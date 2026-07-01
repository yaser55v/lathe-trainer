import {
  AdditiveBlending,
  Box3,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Pressed,
  RayInteractable,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  World,
  createSystem,
} from "@iwsdk/core";

export interface TelemetryController {
  update: (time: number, delta: number) => void;
  destroy: () => void;
  toggle: () => void;
}

type TextPlane = ReturnType<typeof createTextPlane>;

function createTextPlane(
  width: number,
  height: number,
  drawCallback: (
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
  ) => void,
) {
  const canvas = document.createElement("canvas");
  const pixelsPerMeter = 512;
  canvas.width = Math.max(2, Math.round(width * pixelsPerMeter));
  canvas.height = Math.max(2, Math.round(height * pixelsPerMeter));

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create 2D canvas context");
  }

  drawCallback(ctx, canvas.width, canvas.height);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;

  const geometry = new PlaneGeometry(width, height);
  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });

  const mesh = new Mesh(geometry, material);
  return { mesh, canvas, ctx, texture, material, geometry, drawCallback };
}

function drawReadableText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fillStyle: string,
) {
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fillStyle;
  ctx.fillText(text, x, y);
}

function makeTitle(text: string): TextPlane {
  return createTextPlane(0.56, 0.08, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 34px inter";
    ctx.shadowColor = "#00f3ff";
    ctx.shadowBlur = 12;
    drawReadableText(ctx, text, w / 2, h / 2, "#00f3ff");
  });
}

function makeInfoText(): TextPlane {
  return createTextPlane(0.72, 0.28, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.shadowColor = "#00f3ff";
    ctx.shadowBlur = 8;

    ctx.font = "700 22px inter";
    drawReadableText(ctx, "CNC operator interface", 10, 8, "#9ffbff");

    ctx.font = "600 18px inter";
    const lines = [
      ["STATUS", "Program, alarms, machine state"],
      ["CYCLE", "Start, feed hold, reset"],
      ["OVERRIDE", "Spindle speed and feed rate"],
      ["SAFETY", "Emergency stop and manual control"],
    ] as const;

    lines.forEach(([label, value], index) => {
      const y = 48 + index * 24;
      drawReadableText(ctx, label, 10, y, "#ffaa00");
      drawReadableText(ctx, value, 0, y, "#dffcff");
    });
  });
}

function findObjectByName(modelRoot: Object3D, name: string): Object3D | null {
  let match: Object3D | null = null;

  modelRoot.traverse((child) => {
    if (!match && child.name === name) {
      match = child;
    }
  });

  return match;
}

function findFallbackCenter(modelRoot: Object3D): Vector3 {
  const bounds = new Box3().setFromObject(modelRoot);
  return bounds.getCenter(new Vector3());
}

export function setupHolographicTelemetry(
  world: World,
  modelRoot: Object3D,
): TelemetryController {
  const { camera } = world;

  const marker = findObjectByName(modelRoot, "main_control_info");
  const targetWorldPos = new Vector3();

  if (marker) {
    marker.getWorldPosition(targetWorldPos);
  } else {
    console.warn(
      "Telemetry Setup Warning: Empty marker 'main_control_info' not found. Using model center instead.",
    );
    targetWorldPos.copy(findFallbackCenter(modelRoot));
  }

  const cyanMaterial = new MeshBasicMaterial({
    color: 0x00f3ff,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    blending: AdditiveBlending,
  });

  const beaconGroup = new Group();
  beaconGroup.position.copy(targetWorldPos);

  const ringGeom = new RingGeometry(0.035, 0.044, 32);
  const ringMesh = new Mesh(ringGeom, cyanMaterial);
  beaconGroup.add(ringMesh);

  const coreGeom = new SphereGeometry(0.012, 16, 8);
  const coreMaterial = new MeshBasicMaterial({
    color: 0x00f3ff,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: AdditiveBlending,
    wireframe: true,
  });
  const coreMesh = new Mesh(coreGeom, coreMaterial);
  beaconGroup.add(coreMesh);

  const beaconEntity = world.createTransformEntity(beaconGroup);

  const hitTargetGeom = new SphereGeometry(0.3, 16, 8);
  const hitTargetMat = new MeshBasicMaterial({
    color: 0x00f3ff,
    transparent: true,
    opacity: 0.001,
    depthWrite: false,
    colorWrite: false,
  });
  const hitTarget = new Mesh(hitTargetGeom, hitTargetMat);
  hitTarget.name = "main_control_info_hit_target";
  hitTarget.position.copy(targetWorldPos);
  const hitTargetEntity = world
    .createTransformEntity(hitTarget)
    .addComponent(RayInteractable);

  const telemetryGroup = new Group();
  telemetryGroup.position.copy(targetWorldPos).add(new Vector3(0, 0.26, 0.06));
  telemetryGroup.scale.setScalar(0.001);
  telemetryGroup.visible = false;

  const title = makeTitle("CONTROL PANEL");
  title.mesh.position.set(0, 0.12, 0);
  telemetryGroup.add(title.mesh);

  const info = makeInfoText();
  info.mesh.position.set(0, -0.04, 0);
  telemetryGroup.add(info.mesh);

  const accentGeom = new PlaneGeometry(0.62, 0.004);
  const accentMat = new MeshBasicMaterial({
    color: 0x00f3ff,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const topAccent = new Mesh(accentGeom, accentMat);
  topAccent.position.set(0, 0.075, -0.002);
  telemetryGroup.add(topAccent);

  const bottomAccent = new Mesh(accentGeom, accentMat);
  bottomAccent.position.set(0, -0.195, -0.002);
  telemetryGroup.add(bottomAccent);

  const telemetryEntity = world.createTransformEntity(telemetryGroup);
  const telemetryPosition = new Vector3();

  let isOpen = false;
  let currentProgress = 0;
  let targetProgress = 0;
  let beaconFadeProgress = 1;

  const toggle = () => {
    isOpen = !isOpen;
    targetProgress = isOpen ? 1 : 0;
    if (isOpen) {
      telemetryGroup.visible = true;
    }
  };

  class TelemetryPressSystem extends createSystem({
    pressedHotspots: { required: [Pressed] },
  }) {
    init() {
      this.queries.pressedHotspots.subscribe("qualify", (entity) => {
        if (entity === hitTargetEntity) {
          toggle();
        }
      });
    }
  }
  world.registerSystem(TelemetryPressSystem);

  const update = (time: number, delta: number) => {
    const frameDelta = Math.min(Math.max(delta || 1 / 60, 1 / 120), 0.1);
    const pulse = Math.sin(time * 5);
    const pulseOpacity = 0.55 + (pulse + 1) * 0.18;

    ringMesh.scale.setScalar(1 + pulse * 0.14);
    coreMesh.scale.setScalar(1 - pulse * 0.08);

    const lerpSpeed = 1 - Math.exp(-10 * frameDelta);
    currentProgress += (targetProgress - currentProgress) * lerpSpeed;
    beaconFadeProgress += ((isOpen ? 0 : 1) - beaconFadeProgress) * lerpSpeed;

    if (currentProgress > 0.001) {
      telemetryGroup.visible = true;
      const scale = 0.68 * currentProgress;
      telemetryGroup.scale.setScalar(scale);
      telemetryPosition.set(0, 0.2 + currentProgress * 0.06, 0.06);
      telemetryGroup.position.copy(targetWorldPos).add(telemetryPosition);
    } else {
      telemetryGroup.visible = false;
    }

    cyanMaterial.opacity = beaconFadeProgress * pulseOpacity;
    coreMaterial.opacity = beaconFadeProgress * 0.85 * pulseOpacity;
    beaconGroup.visible = beaconFadeProgress > 0.01;

    if (telemetryGroup.visible) {
      telemetryGroup.lookAt(camera.position);
    }
    beaconGroup.lookAt(camera.position);
  };

  const destroy = () => {
    if (activeTelemetry === controller) {
      activeTelemetry = null;
    }
    beaconEntity.dispose();
    telemetryEntity.dispose();
    hitTargetEntity.dispose();

    ringGeom.dispose();
    coreGeom.dispose();
    hitTargetGeom.dispose();
    accentGeom.dispose();
    title.geometry.dispose();
    info.geometry.dispose();

    cyanMaterial.dispose();
    coreMaterial.dispose();
    hitTargetMat.dispose();
    accentMat.dispose();
    title.material.dispose();
    info.material.dispose();

    title.texture.dispose();
    info.texture.dispose();
  };

  const controller = { update, destroy, toggle };
  activeTelemetry = controller;
  return controller;
}

let activeTelemetry: TelemetryController | null = null;

export class TelemetrySystem extends createSystem({}) {
  private lastTime = performance.now() / 1000;

  update() {
    if (activeTelemetry) {
      const now = performance.now() / 1000;
      activeTelemetry.update(now, now - this.lastTime);
      this.lastTime = now;
    }
  }
}
