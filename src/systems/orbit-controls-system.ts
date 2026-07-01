import { createSystem, VisibilityState, Vector3, Box3 } from "@iwsdk/core";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/**
 * ECS System that manages desktop mouse navigation (OrbitControls).
 * Automatically disables controls when entering XR mode and restores them upon returning.
 * Automatically targets the center of the entity named "LatheMachine".
 */
export class OrbitControlsSystem extends createSystem({}) {
  private controls!: OrbitControls;

  init() {
    const { camera, renderer, scene } = this.world;

    this.controls = new OrbitControls(camera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.01;
    this.controls.minDistance = 4.5;
    this.controls.maxDistance = 15.0;

    // Set initial target based on the LatheMachine model bounds
    const targetPos = new Vector3(0, 1.25, -3.0); // Safe default fallback
    const lathe = scene.getObjectByName("LatheMachine");
    if (lathe) {
      new Box3().setFromObject(lathe).getCenter(targetPos);
    }
    this.controls.target.copy(targetPos);
    this.controls.update();

    // Respond to XR session changes
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        if (state === VisibilityState.NonImmersive) {
          this.controls.enabled = true;
          camera.position.set(0, 1.7, 5.0);
          
          // Re-evaluate target in case the model position shifted
          const activeLathe = scene.getObjectByName("LatheMachine");
          if (activeLathe) {
            new Box3().setFromObject(activeLathe).getCenter(targetPos);
          }
          this.controls.target.copy(targetPos);
          this.controls.update();
        } else {
          this.controls.enabled = false;
        }
      })
    );
  }

  update() {
    if (this.controls && this.controls.enabled) {
      this.controls.update();
    }
  }
}
