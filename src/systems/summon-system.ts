import {
  createSystem,
  Vector3,
  Transform,
  PanelUI,
  eq
} from "@iwsdk/core";

export class SummonSystem extends createSystem({
  dockPanel: {
    required: [PanelUI, Transform],
    where: [eq(PanelUI, "config", "./ui/dock.json")],
  },
}) {
  private tempCameraPos!: Vector3;
  private tempCameraDir!: Vector3;
  private tempTargetPos!: Vector3;

  init() {
    this.tempCameraPos = new Vector3();
    this.tempCameraDir = new Vector3();
    this.tempTargetPos = new Vector3();

    const { renderer, camera } = this.world;

    const summon = () => {
      const dockEntities = this.queries.dockPanel.entities;
      if (dockEntities.size === 0) return;
      const dockEntity = dockEntities.values().next().value;
      if (!dockEntity || !dockEntity.object3D) return;


      // 1. Get current XR camera world position and direction
      camera.getWorldPosition(this.tempCameraPos);
      camera.getWorldDirection(this.tempCameraDir);

      // 2. Project target position 1.2 meters in front of the camera
      this.tempTargetPos
        .copy(this.tempCameraPos)
        .addScaledVector(this.tempCameraDir, 1.2);

      // 3. Move UI Dock mesh to the new target position
      dockEntity.object3D.position.copy(this.tempTargetPos);

      // 4. Orient the panel to face the user's eyes
      dockEntity.object3D.lookAt(this.tempCameraPos);


    };

    // Listen to squeezestart on both XR controllers
    const controller1 = renderer.xr.getController(0);
    const controller2 = renderer.xr.getController(1);

    controller1.addEventListener("squeezestart", summon);
    controller2.addEventListener("squeezestart", summon);

    this.cleanupFuncs.push(() => {
      controller1.removeEventListener("squeezestart", summon);
      controller2.removeEventListener("squeezestart", summon);
    });
  }
}
