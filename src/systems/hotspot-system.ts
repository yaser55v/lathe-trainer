import {
  AdditiveBlending,
  Group,
  Interactable,
  MeshBasicMaterial,
  Object3D,
  PanelDocument,
  PanelUI,
  PokeInteractable,
  Pressed,
  RingGeometry,
  SphereGeometry,
  Mesh,
  Vector3,
  createSystem,
  eq,
} from "@iwsdk/core";
import type { UIKitDocument } from "@iwsdk/core";

// ---------------------------------------------------------------------------
// Per-hotspot metadata
// ---------------------------------------------------------------------------
interface HotspotMeta {
  /** Human-readable title shown in the card header */
  title: string;
  /** One-sentence description shown in the card body */
  description: string;
  /** Tag label (e.g. component category) */
  tag: string;
  /**
   * Local-space Y offset for the card above the hotspot marker.
   * Override per-hotspot if the empty sits at an awkward height.
   */
  cardYOffset?: number;
}

const HOTSPOT_META: Record<string, HotspotMeta> = {
  chip_conveyor_hotspot: {
    title: "Chip Conveyor",
    description:
      "Automatically removes metal chips and coolant from the cutting zone, keeping the work area clear during machining.",
    tag: "SWARF REMOVAL",
  },
  chuck_hotspot: {
    title: "Chuck",
    description:
      "Three-jaw hydraulic chuck that clamps the workpiece and rotates it at programmed spindle speeds.",
    tag: "WORKHOLDING",
  },
  door_hotspot: {
    title: "Safety Door",
    description:
      "Interlocked sliding door that prevents operator access while the spindle is running. Tap to open or close.",
    tag: "SAFETY",
  },
  panel_hotspot: {
    title: "Control Panel",
    description:
      "Fanuc-style CNC controller. Used to write and execute G-code programs, monitor spindle status, and adjust feed overrides.",
    tag: "CNC CONTROL",
  },
  tailstock_hotspot: {
    title: "Tailstock",
    description:
      "Supports long workpieces from the opposite end to the chuck, preventing deflection during heavy turning operations.",
    tag: "WORKHOLDING",
  },
  tool_turret_hotspot: {
    title: "Tool Turret",
    description:
      "Motorised turret that indexes through up to 12 tool positions. Each station holds a different cutting insert.",
    tag: "TOOLING",
  },
};

// ---------------------------------------------------------------------------
// Visual constants
// ---------------------------------------------------------------------------
const CARD_Y_OFFSET_DEFAULT = 0.28;
const CARD_Z_OFFSET = 0.05;
const CARD_MAX_WIDTH = 0.55;
const CARD_MAX_HEIGHT = 0.32;
const PULSE_SPEED = 4.5;
const BEACON_RING_INNER = 0.034;
const BEACON_RING_OUTER = 0.044;
const BEACON_CORE_RADIUS = 0.012;
const BEACON_HIT_RADIUS = 0.12;

// ---------------------------------------------------------------------------
// Internal per-hotspot runtime state
// ---------------------------------------------------------------------------
interface HotspotInstance {
  meta: HotspotMeta;
  markerWorldPos: Vector3;
  beaconGroup: Group;
  ringMesh: Mesh;
  coreMesh: Mesh;
  cyanMat: MeshBasicMaterial;
  beaconEntityIndex: number;
  cardEntityIndex: number;
  hotspotEntityIndex: number;
  isOpen: boolean;
}

// ---------------------------------------------------------------------------
// HotspotSystem
// ---------------------------------------------------------------------------
export class HotspotSystem extends createSystem(
  {
    pressedHotspots: { required: [Pressed] },
    hotspotCards: {
      required: [PanelUI, PanelDocument],
      where: [eq(PanelUI, "config", "./ui/hotspot-card.json")],
    },
  },
) {
  private instances: HotspotInstance[] = [];
  /** Maps entity index → instance so press events resolve in O(1) */
  private entityToInstance = new Map<number, HotspotInstance>();
  private tempVec3!: Vector3;

  init() {
    this.tempVec3 = new Vector3();

    const latheMachine = (this.world.globals as any).latheMachine as Object3D;
    if (!latheMachine) {
      console.warn("[HotspotSystem] latheMachine not found in globals");
      return;
    }

    // Ensure world matrices are up-to-date (placeModelOnFloor may have moved it)
    latheMachine.updateMatrixWorld(true);

    // Collect all objects whose name ends with "_hotspot"
    const hotspotNodes: Object3D[] = [];
    latheMachine.traverse((child) => {
      if (child.name.endsWith("_hotspot")) {
        hotspotNodes.push(child);
      }
    });

    if (hotspotNodes.length === 0) {
      console.warn("[HotspotSystem] No *_hotspot nodes found in model");
      return;
    }

    for (const node of hotspotNodes) {
      this.createHotspot(node);
    }

    // ---------------------------------------------------------------------------
    // React to presses — open/close the associated card
    // ---------------------------------------------------------------------------
    this.queries.pressedHotspots.subscribe("qualify", (entity) => {
      const instance = this.entityToInstance.get(entity.index);
      if (!instance) return;
      instance.isOpen = !instance.isOpen;
      this.applyCardVisibility(instance);
    });

    // Handle existing hotspot entities (in case the query already has matches)
    for (const entity of this.queries.pressedHotspots.entities) {
      const instance = this.entityToInstance.get(entity.index);
      if (!instance) continue;
      instance.isOpen = !instance.isOpen;
      this.applyCardVisibility(instance);
    }

    // ---------------------------------------------------------------------------
    // Wire up close buttons once PanelDocuments are ready
    // ---------------------------------------------------------------------------
    this.queries.hotspotCards.subscribe("qualify", (entity) => {
      this.wireCloseButton(entity.index);
    });

    // Handle cards already qualified
    for (const entity of this.queries.hotspotCards.entities) {
      this.wireCloseButton(entity.index);
    }
  }

  update() {
    const time = performance.now() / 1000;
    const pulse = Math.sin(time * PULSE_SPEED);

    for (const inst of this.instances) {
      const { ringMesh, coreMesh, cyanMat, beaconGroup } = inst;

      // Pulse scale
      ringMesh.scale.setScalar(1 + pulse * 0.14);
      coreMesh.scale.setScalar(1 - pulse * 0.08);

      // Opacity breathing
      cyanMat.opacity = 0.5 + (pulse + 1) * 0.2;

      // Billboard: always face the player's head
      this.world.player.head.getWorldPosition(this.tempVec3);
      beaconGroup.lookAt(this.tempVec3);

      // Hide beacon when card is open (less clutter)
      beaconGroup.visible = !inst.isOpen;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private createHotspot(node: Object3D) {
    const meta = HOTSPOT_META[node.name] ?? {
      title: node.name.replace(/_hotspot$/, "").replace(/_/g, " "),
      description: "Component of the CNC lathe machine.",
      tag: "CNC LATHE",
    };

    // World position of the EMPTY marker
    const markerWorldPos = new Vector3();
    node.getWorldPosition(markerWorldPos);

    // ------------------------------------------------------------------
    // 1. Beacon visual (ring + core sphere)
    // ------------------------------------------------------------------
    const cyanMat = new MeshBasicMaterial({
      color: 0x00d4ff,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: AdditiveBlending,
    });

    const ringMesh = new Mesh(
      new RingGeometry(BEACON_RING_INNER, BEACON_RING_OUTER, 32),
      cyanMat,
    );

    const coreMesh = new Mesh(
      new SphereGeometry(BEACON_CORE_RADIUS, 16, 8),
      new MeshBasicMaterial({
        color: 0x00d4ff,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: AdditiveBlending,
        wireframe: true,
      }),
    );

    const beaconGroup = new Group();
    beaconGroup.position.copy(markerWorldPos);
    beaconGroup.add(ringMesh);
    beaconGroup.add(coreMesh);

    const beaconEntity = this.world.createTransformEntity(beaconGroup);

    // ------------------------------------------------------------------
    // 2. Invisible hit-sphere for raycasting / poke
    // ------------------------------------------------------------------
    const hitMesh = new Mesh(
      new SphereGeometry(BEACON_HIT_RADIUS, 12, 8),
      new MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        colorWrite: false,
      }),
    );
    hitMesh.name = `${node.name}_hit`;
    hitMesh.position.copy(markerWorldPos);

    const hotspotEntity = this.world
      .createTransformEntity(hitMesh)
      .addComponent(Interactable)
      .addComponent(PokeInteractable);

    // ------------------------------------------------------------------
    // 3. PanelUI card — positioned above the beacon
    // ------------------------------------------------------------------
    const yOffset = meta.cardYOffset ?? CARD_Y_OFFSET_DEFAULT;
    const cardEntity = this.world.createTransformEntity();

    if (cardEntity.object3D) {
      cardEntity.object3D.position.set(
        markerWorldPos.x,
        markerWorldPos.y + yOffset,
        markerWorldPos.z + CARD_Z_OFFSET,
      );
      cardEntity.object3D.visible = false; // hidden until beacon is pressed
    }

    cardEntity
      .addComponent(PanelUI, {
        config: "./ui/hotspot-card.json",
        maxWidth: CARD_MAX_WIDTH,
        maxHeight: CARD_MAX_HEIGHT,
      })
      .addComponent(Interactable)
      .addComponent(PokeInteractable);

    // ------------------------------------------------------------------
    // 4. Store instance
    // ------------------------------------------------------------------
    const instance: HotspotInstance = {
      meta,
      markerWorldPos,
      beaconGroup,
      ringMesh,
      coreMesh,
      cyanMat,
      beaconEntityIndex: beaconEntity.index,
      cardEntityIndex: cardEntity.index,
      hotspotEntityIndex: hotspotEntity.index,
      isOpen: false,
    };

    this.instances.push(instance);
    this.entityToInstance.set(hotspotEntity.index, instance);
    // Also map card entity so close-btn wires correctly
    this.entityToInstance.set(cardEntity.index, instance);
  }

  private applyCardVisibility(instance: HotspotInstance) {
    // Find the card entity by index
    const cardEntityIndex = instance.cardEntityIndex;
    for (const entity of this.queries.hotspotCards.entities) {
      if (entity.index === cardEntityIndex) {
        if (entity.object3D) {
          entity.object3D.visible = instance.isOpen;
        }

        // Update card content when opening
        if (instance.isOpen) {
          this.populateCard(entity.index, instance.meta);
        }
        return;
      }
    }

    // Card entity exists but PanelDocument may not be ready yet — set via object3D
    const allEntities = this.world.entityManager;
    const cardEntity = allEntities.getEntityByIndex(cardEntityIndex);
    if (cardEntity?.object3D) {
      cardEntity.object3D.visible = instance.isOpen;
    }
  }

  private populateCard(entityIndex: number, meta: HotspotMeta) {
    const doc = PanelDocument.data.document[entityIndex] as UIKitDocument | undefined;
    if (!doc) return;

    const titleEl = doc.getElementById("hotspot-title");
    const descEl = doc.getElementById("hotspot-description");
    const tagEl = doc.getElementById("hotspot-tag");

    titleEl?.setProperties({ text: meta.title });
    descEl?.setProperties({ text: meta.description });
    tagEl?.setProperties({ text: meta.tag });
  }

  private wireCloseButton(entityIndex: number) {
    const doc = PanelDocument.data.document[entityIndex] as UIKitDocument | undefined;
    if (!doc) return;

    const closeBtn = doc.getElementById("hotspot-close");
    if (!closeBtn) return;

    const instance = this.entityToInstance.get(entityIndex);
    if (!instance) return;

    // Populate initial content in case the card opens later
    this.populateCard(entityIndex, instance.meta);

    closeBtn.addEventListener("click", () => {
      instance.isOpen = false;
      this.applyCardVisibility(instance);
    });
  }
}
