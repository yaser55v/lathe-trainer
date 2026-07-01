import {
  createSystem,
  Interactable,
  Vector3,
  Mesh,
  RingGeometry,
  SphereGeometry,
  MeshBasicMaterial,
  AdditiveBlending,
  Pressed,
  Group,
  MathUtils,
} from "@iwsdk/core";

const DOOR_CLOSED_OFFSET_X = 0;
const DOOR_OPEN_OFFSET_X = -0.6;
const DOOR_ANIMATION_SPEED = 5;
const DOOR_SNAP_EPSILON = 0.002;

enum DoorState {
  Closed = "CLOSED",
  Opening = "OPENING",
  Open = "OPEN",
  Closing = "CLOSING",
}

/**
 * DoorSlideSystem
 * 
 * Finds the door, door_glass, and handle nodes in the loaded lathe model,
 * groups them under a new lathe-local parent, and uses the Empty marker as a
 * hotspot that toggles a simple automatic sliding state machine.
 */
export class DoorSlideSystem extends createSystem({
  pressedHotspot: { required: [Interactable, Pressed] }
}) {
  private tempVec3!: Vector3;
  private tempLocalVec3!: Vector3;
  private latheMachine?: Group;
  private doorGroup?: Group;
  private doorClosedLocalPosition!: Vector3;
  private doorSlideOffsetX: number = DOOR_CLOSED_OFFSET_X;
  private doorState: DoorState = DoorState.Closed;
  private hotspotRing?: Mesh;
  private hotspotCore?: Mesh;
  private hotspotEntityIndex: number = -1;

  init() {
    this.tempVec3 = new Vector3();
    this.tempLocalVec3 = new Vector3();
    this.doorClosedLocalPosition = new Vector3();

    // Find the lathe model root via world.globals (set in index.ts)
    const latheMachine = (this.world.globals as any).latheMachine as Group;
    if (!latheMachine) {
      console.warn("[DoorSlideSystem] LatheMachine not found in globals");
      return;
    }
    this.latheMachine = latheMachine;

    // Locate the nodes in the sosos.glb structure
    const door = latheMachine.getObjectByName("door");
    const doorGlass = latheMachine.getObjectByName("door_glass");
    const handle = latheMachine.getObjectByName("handle");

    // Fallback: use the handle as the interaction marker since 'Empty' is missing
    const emptyMarker = latheMachine.getObjectByName("handle") || handle;

    if (!door) {
      console.warn("[DoorSlideSystem] 'door' node not found in model");
      return;
    }

    // Ensure matrices are updated for correct world positions after placeModelOnFloor
    latheMachine.updateMatrixWorld(true);
    door.getWorldPosition(this.tempVec3);
    this.tempLocalVec3.copy(this.tempVec3);
    latheMachine.worldToLocal(this.tempLocalVec3);

    // 1. Create a new group to hold all door parts
    const doorGroup = new Group();
    doorGroup.name = "DoorGroup";
    doorGroup.position.copy(this.tempLocalVec3); // Anchor in lathe-local space.
    latheMachine.add(doorGroup);
    doorGroup.updateMatrixWorld(true);
    this.doorGroup = doorGroup;
    this.doorClosedLocalPosition.copy(doorGroup.position);
    this.applyDoorSlideOffset();

    // 2. Reparent meshes. .attach preserves world transform.
    doorGroup.attach(door);
    if (doorGlass) doorGroup.attach(doorGlass);
    if (handle) doorGroup.attach(handle);
    if (emptyMarker) doorGroup.attach(emptyMarker);

    // ------------------------------------------------------------------
    // 5. Create an ECS entity from the group and add components
    // ------------------------------------------------------------------
    const latheEntity =
      typeof (latheMachine as any).entityIdx === "number"
        ? this.world.entityManager.getEntityByIndex(
          (latheMachine as any).entityIdx,
        )
        : null;
    const doorEntity = latheEntity
      ? this.world.createTransformEntity(doorGroup, latheEntity)
      : this.world.createTransformEntity(doorGroup);

    // Mark as interactive so raycasting can hit it
    doorEntity.addComponent(Interactable);

    // ------------------------------------------------------------------
    // 6. Create Visual Hotspot on the Empty marker
    // ------------------------------------------------------------------
    if (emptyMarker) {
      const hotspotMaterial = new MeshBasicMaterial({
        color: 0x00f3ff,
        transparent: true,
        opacity: 0.8,
        blending: AdditiveBlending,
        depthWrite: false,
      });

      this.hotspotRing = new Mesh(
        new RingGeometry(0.04, 0.05, 32),
        hotspotMaterial,
      );
      this.hotspotCore = new Mesh(
        new SphereGeometry(0.015, 16, 8),
        hotspotMaterial,
      );

      // Attach visuals to the empty marker node so they slide with the door
      emptyMarker.add(this.hotspotRing);
      emptyMarker.add(this.hotspotCore);

      // To make the Empty node interactive while keeping it parented to the door group,
      // we create a specialized entity for it.
      const hotspotEntity = this.world.createTransformEntity(
        emptyMarker,
        doorEntity,
      );
      hotspotEntity.addComponent(Interactable);
      this.hotspotEntityIndex = hotspotEntity.index;
    }

    // Interaction logic for the hotspot
    this.queries.pressedHotspot.subscribe("qualify", (entity) => {
      if (entity.index === this.hotspotEntityIndex) {

        this.toggleDoorState();
      }
    });

  }

  /**
   * Handle the pulsing animation for the hotspot
   */
  update(delta: number) {
    this.updateDoorAnimation(delta);

    if (this.hotspotRing && this.hotspotCore) {
      const time = performance.now() / 1000;
      const pulse = Math.sin(time * 4);
      const scale = 1 + pulse * 0.15;

      this.hotspotRing.scale.setScalar(scale);
      this.hotspotCore.scale.setScalar(1 - pulse * 0.1);

      // Billboarding: make the hotspot always face the user's head
      this.world.player.head.getWorldPosition(this.tempVec3);
      this.hotspotRing.lookAt(this.tempVec3);

      // Update opacity for a breathing effect
      const mat = this.hotspotRing.material as MeshBasicMaterial;
      mat.opacity = 0.6 + (pulse + 1) * 0.2;
    }
  }

  /** Open the door — callable by ActionRegistry or any external system */
  openDoor(): void {
    if (
      this.doorState === DoorState.Closed ||
      this.doorState === DoorState.Closing
    ) {
      this.doorState = DoorState.Opening;
      this.updateSceneContext();
    }
  }

  /** Close the door — callable by ActionRegistry or any external system */
  closeDoor(): void {
    if (
      this.doorState === DoorState.Open ||
      this.doorState === DoorState.Opening
    ) {
      this.doorState = DoorState.Closing;
      this.updateSceneContext();
    }
  }

  /** Whether the door is fully open right now */
  get isDoorOpen(): boolean {
    return this.doorState === DoorState.Open;
  }

  private updateSceneContext(): void {
    const ctx = (this.world.globals as any).sceneContext;
    if (!ctx) return;
    ctx.machineState = ctx.machineState ?? {};
    // Use exact door state — not a guess based on transition direction
    ctx.machineState.doorOpen =
      this.doorState === DoorState.Open ||
      this.doorState === DoorState.Opening;
    ctx.machineState.doorSettled =
      this.doorState === DoorState.Open ||
      this.doorState === DoorState.Closed;
  }

  private toggleDoorState(): void {
    if (
      this.doorState === DoorState.Closed ||
      this.doorState === DoorState.Closing
    ) {
      this.openDoor();
      return;
    }
    this.closeDoor();
  }

  private updateDoorAnimation(delta: number) {
    if (
      this.doorState !== DoorState.Opening &&
      this.doorState !== DoorState.Closing
    ) {
      return;
    }

    const targetOffsetX =
      this.doorState === DoorState.Opening
        ? DOOR_OPEN_OFFSET_X
        : DOOR_CLOSED_OFFSET_X;
    const lerpFactor = MathUtils.clamp(delta * DOOR_ANIMATION_SPEED, 0, 1);

    this.doorSlideOffsetX = MathUtils.lerp(
      this.doorSlideOffsetX,
      targetOffsetX,
      lerpFactor,
    );

    if (Math.abs(this.doorSlideOffsetX - targetOffsetX) <= DOOR_SNAP_EPSILON) {
      this.doorSlideOffsetX = targetOffsetX;
      this.doorState =
        targetOffsetX === DOOR_OPEN_OFFSET_X
          ? DoorState.Open
          : DoorState.Closed;
      // Update context once animation fully settles to final state
      this.updateSceneContext();
    }

    this.applyDoorSlideOffset();
  }

  private applyDoorSlideOffset() {
    if (!this.doorGroup) {
      return;
    }

    this.doorGroup.position.set(
      this.doorClosedLocalPosition.x + this.doorSlideOffsetX,
      this.doorClosedLocalPosition.y,
      this.doorClosedLocalPosition.z,
    );
    this.doorGroup.updateMatrixWorld(true);
  }
}
