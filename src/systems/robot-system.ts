import {
  createSystem,
  Interactable,
  Pressed,
  MathUtils,
  Group,
} from "@iwsdk/core";
import { AnimationMixer, Color, MeshStandardMaterial, Object3D, ShaderMaterial } from "three";
import { AssetManager } from "@iwsdk/core";
import type { VisualStateChannel, RobotVisualState } from "../robot/robot-presenter";

// ─── Emissive + animation speed per state ─────────────────────────────────────

const STATE_CONFIG: Record<RobotVisualState, {
  emissive: number;
  animSpeed: number;
  glowColor: [number, number, number];
}> = {
  idle: { emissive: 0.0, animSpeed: 0.6, glowColor: [1, 1, 1] },
  listening: { emissive: 2.0, animSpeed: 1.2, glowColor: [0.2, 1.0, 0.6] },
  thinking: { emissive: 1.5, animSpeed: 0.8, glowColor: [1.0, 0.9, 0.6] }, // Warm light gold
  speaking: { emissive: 3.5, animSpeed: 1.8, glowColor: [1, 1, 1] },
};

const LERP_SPEED = 6.0;

// ─── RobotSystem ──────────────────────────────────────────────────────────────

export class RobotSystem extends createSystem({
  pressed: { required: [Interactable, Pressed] },
}) implements VisualStateChannel {
  private targetState: RobotVisualState = "idle";
  private blueMeshes: MeshStandardMaterial[] = [];
  private mixer?: AnimationMixer;

  private currentEmissive = 0.0;
  private currentGlow = new Color(1, 1, 1);
  private targetGlow = new Color(1, 1, 1);

  private bellyMaterial?: ShaderMaterial;
  private shaderTime = 0;

  private robotEntityIndex = -1;
  private initialized = false;
  private lastToggleTime = -1;
  private presenterRegistered = false;

  // ─── VisualStateChannel ────────────────────────────────────────────────────

  setState(state: RobotVisualState): void {
    if (this.targetState === state) return;
    this.targetState = state;

    if (state === "speaking") {
      const bubble = (this.world.globals as any).robotBubbleObject3D;
      if (bubble) bubble.visible = true;
    }
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  private tryInit(): void {
    const gltf = AssetManager.getGLTF("robot");
    if (!gltf) return;

    const robot = (this.world.globals as any).robot as Group ?? gltf.scene as Group;

    // Start the built-in animation
    if (gltf.animations?.length) {
      this.mixer = new AnimationMixer(robot);
      for (const clip of gltf.animations) {
        const action = this.mixer.clipAction(clip);
        action.play();
      }
    }

    // Collect emissive meshes and setup BellyScreen
    robot.traverse((child: any) => {
      if (!child.isMesh) return;

      if (child.name === "BellyScreen") {
        this.bellyMaterial = new ShaderMaterial({
          uniforms: {
            time: { value: 0 },
            state: { value: 0 },
            glowColor: { value: new Color(1, 1, 1) }
          },
          vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform float time;
            uniform float state;
            uniform vec3 glowColor;
            varying vec2 vUv;

            void main() {
              vec3 finalColor = vec3(0.0);
              
              // The belly screen UVs seem rotated: vUv.x is Vertical, vUv.y is Horizontal.
              // To move the effect down, we change the vertical center. 
              // (If it goes up instead of down, change 0.35 to 0.65)
              float vertCenter = 0.35; 
              
              if (state > 1.5 && state < 2.5) {
                // THINKING (Sci-fi layered rings)
                vec2 center = vec2(vertCenter, 0.5);
                // Multiply by 1.35 to scale the rings down (make them smaller)
                vec2 pos = (vUv - center) * 1.35; 
                float angle = atan(pos.y, pos.x);
                float radius = length(pos);
                
                float t = time * 2.0;
                
                // Outer dashed ring
                float ring1 = smoothstep(0.3, 0.32, radius) - smoothstep(0.32, 0.34, radius);
                float dash1 = step(0.5, sin(angle * 8.0 + t));
                float r1 = ring1 * dash1;

                // Inner fast rotating ring
                float ring2 = smoothstep(0.2, 0.22, radius) - smoothstep(0.22, 0.24, radius);
                float dash2 = step(0.5, sin(angle * 12.0 - t * 1.5));
                float r2 = ring2 * dash2;

                // Solid thin outer ring
                float ring3 = smoothstep(0.38, 0.39, radius) - smoothstep(0.39, 0.40, radius);
                float r3 = ring3 * (sin(angle * 4.0 + t * 0.5) * 0.5 + 0.5);

                // Pulsing core
                float core = smoothstep(0.1, 0.0, radius) * (sin(t * 3.0) * 0.5 + 0.5);

                finalColor = glowColor * (r1 + r2 + r3 + core);
                
              } else if (state > 2.5) {
                // SPEAKING (Wave voice - Horizontal)
                float wave1 = sin(vUv.y * 15.0 + time * 10.0) * 0.1;
                float wave2 = sin(vUv.y * 25.0 - time * 15.0) * 0.05;
                
                float line1 = smoothstep(0.03, 0.0, abs(vUv.x - vertCenter + wave1));
                float line2 = smoothstep(0.02, 0.0, abs(vUv.x - vertCenter + wave2));
                
                // Core bright wave
                float coreWave = sin(vUv.y * 8.0 + time * 20.0) * 0.02;
                float coreLine = smoothstep(0.04, 0.0, abs(vUv.x - vertCenter + coreWave));
                
                finalColor = glowColor * (line1 + line2 + coreLine * 0.6);
                
              } else if (state > 0.5 && state < 1.5) {
                // LISTENING (Pulse)
                float pulse = (sin(time * 3.0) * 0.5 + 0.5);
                // Apply the same vertical center offset and scale
                float dist = length((vUv - vec2(vertCenter, 0.5)) * 1.35);
                float circle = smoothstep(0.4, 0.0, dist);
                finalColor = glowColor * circle * pulse * 0.5;
              }
              
              gl_FragColor = vec4(finalColor, 1.0);
            }
          `,
          transparent: true,
        });
        child.material = this.bellyMaterial;
        return; // ← Done with BellyScreen; skip emissive-mesh collection below
      }

      const mat = child.material as MeshStandardMaterial;
      if (!mat || !mat.isMaterial) return;
      if (child.name.includes("Eyes") || child.name.includes("Mouth") || child.name.includes("Wave")) {
        if (mat.color && mat.emissive) {
          mat.color.set(new Color(1, 1, 1));
          mat.emissive.set(new Color(1, 1, 1));
          this.blueMeshes.push(mat);
        }
      }
    });

    this.robotEntityIndex = (robot as any).hotspotEntityIdx ?? -1;

    this.queries.pressed.subscribe("qualify", (entity) => {
      if (entity.index !== this.robotEntityIndex) return;
      const now = performance.now();
      if (now - this.lastToggleTime < 400) return;
      this.lastToggleTime = now;

      const service = (this.world.globals as any).assistantService;
      if (!service) {
        this.setState(this.targetState === "idle" ? "speaking" : "idle");
        const bubble = (this.world.globals as any).robotBubbleObject3D;
        if (bubble) {
          bubble.visible = this.targetState !== "idle";
          if (this.targetState === "idle") {
            clearTimeout((this as any)._bubbleTimer);
          } else {
            (this as any)._bubbleTimer = setTimeout(() => {
              bubble.visible = false;
              this.setState("idle");
            }, 8000);
          }
        }
      }
    });

    this.initialized = true;
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  update(delta: number): void {
    if (!this.initialized) {
      this.tryInit();
      return;
    }

    if (!this.presenterRegistered) {
      const presenter = (this.world.globals as any).robotPresenter;
      if (presenter) {
        presenter.addVisualChannel(this);
        this.presenterRegistered = true;
      }
    }

    const cfg = STATE_CONFIG[this.targetState];
    const lerpFactor = MathUtils.clamp(delta * LERP_SPEED, 0, 1);

    // Drive animation speed based on state — pause when idle
    if (this.mixer) {
      if (this.targetState === "idle") {
        this.mixer.timeScale = 0;
      } else {
        this.mixer.timeScale = cfg.animSpeed;
      }
      this.mixer.update(delta);
    }

    // Lerp emissive intensity
    this.currentEmissive = MathUtils.lerp(this.currentEmissive, cfg.emissive, lerpFactor);

    // Lerp glow color
    const [tr, tg, tb] = cfg.glowColor;
    this.targetGlow.setRGB(tr, tg, tb);
    this.currentGlow.lerp(this.targetGlow, lerpFactor);

    for (const mat of this.blueMeshes) {
      mat.emissiveIntensity = this.currentEmissive;
      mat.emissive.copy(this.currentGlow);
    }

    // Update belly shader
    this.shaderTime += delta;
    if (this.bellyMaterial) {
      this.bellyMaterial.uniforms.time.value = this.shaderTime;

      let shaderState = 0; // idle
      if (this.targetState === "listening") shaderState = 1;
      else if (this.targetState === "thinking") shaderState = 2;
      else if (this.targetState === "speaking") shaderState = 3;

      this.bellyMaterial.uniforms.state.value = shaderState;
      this.bellyMaterial.uniforms.glowColor.value.copy(this.currentGlow);
    }
  }
}
