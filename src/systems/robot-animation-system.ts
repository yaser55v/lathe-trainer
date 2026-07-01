import { createSystem } from "@iwsdk/core";
import { AnimationMixer } from "three";

export class RobotAnimationSystem extends createSystem({}) {
  private mixer?: AnimationMixer;

  init() {
    const gltf = (this.world.globals as any).robotGLTF;
    if (!gltf || !gltf.animations?.length) return;

    this.mixer = new AnimationMixer(gltf.scene);
    for (const clip of gltf.animations) {
      this.mixer.clipAction(clip).play();
    }
  }

  update(delta: number) {
    this.mixer?.update(delta);
  }
}
