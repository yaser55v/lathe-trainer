import {
  AssetManifest,
  AssetType,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  BoxGeometry,
  SessionMode,
  SRGBColorSpace,
  AssetManager,
  World,
  Box3,
  Vector3,
  Object3D,
  ACESFilmicToneMapping,
  VisibilityState,
  createSystem,
  PCFSoftShadowMap,
  DirectionalLight,
  ShadowMaterial,
} from "@iwsdk/core";

import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import {
  Interactable,
} from "@iwsdk/core";

import { EnvironmentType, LocomotionEnvironment, IBLTexture, DomeGradient } from "@iwsdk/core";
import { setupHolographicTelemetry } from "./telemetry";

const assets: AssetManifest = {
  latheMachine: {
    url: "./gltf/lath.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  worldHDR: {
    url: "./textures/machine_shop_02_2k.hdr",
    type: AssetType.HDRTexture,
    priority: "critical",
  },
};

// Blender Render Settings Reference:
// # HDRI strength
// World Properties → Strength = 1.5
//
// # Eevee
// Bloom ON
// Screen Space Reflections ON (Note: Post-processing like Bloom and SSR is typically
// bypassed/omitted in WebXR VR sessions for performance and compatibility)
//
// # Color Management
// Look = High Contrast (Emulated using ACESFilmicToneMapping)
// Exposure = +0.3 (Emulated using toneMappingExposure = 1.3)

const enforceSmoothGLBShading = (root: Object3D) => {
  root.traverse((child: any) => {
    if (!child.isMesh) {
      return;
    }

    if (child.geometry) {
      child.geometry.computeVertexNormals();
      child.geometry.attributes.normal.needsUpdate = true;
    }

    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];

    for (const material of materials) {
      if (!material) {
        continue;
      }

      if ("flatShading" in material) {
        material.flatShading = false;
      }
      material.needsUpdate = true;
    }
  });
};

const placeModelOnFloor = (root: Object3D, targetMaxDimension: number = 3) => {
  root.scale.set(2, 2, 2);
  root.position.set(0, 0, 0);
  root.updateMatrixWorld(true);

  const bounds = new Box3().setFromObject(root);
  const center = new Vector3();
  const size = new Vector3();
  bounds.getCenter(center);
  bounds.getSize(size);

  const maxDimension = Math.max(size.x, size.y, size.z);
  let scaleFactor = 1;
  if (maxDimension > 0) {
    scaleFactor = targetMaxDimension / maxDimension;
    root.scale.set(scaleFactor, scaleFactor, scaleFactor);
  }

  root.position.x = -center.x * scaleFactor;
  root.position.z = -center.z * scaleFactor;
  root.position.y = -bounds.min.y * scaleFactor;
  root.updateMatrixWorld(true);
};

World.create(document.getElementById("scene-container") as HTMLDivElement, {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    offer: "always",
    // Optional structured features; layers/local-floor are offered by default
    features: { handTracking: true, layers: true },
  },
  render: {
    // Fix #1: disable SDK default lighting so it doesn't race-add IBLGradient
    // before our IBLTexture/DomeTexture components are attached in .then()
    defaultLighting: false,
    // Fix #6: tighter near/far reduces near:far ratio from 2000:1 → 1000:1,
    // doubling depth buffer precision on Quest's 16-bit depth buffer
    near: 0.05,
    far: 50,
    // Telephoto-style FOV: 45° mimics a ~50mm lens — stable product proportions
    // with minimal perspective distortion (vs SDK default 50°).
    fov: 45,
  },
  features: {
    locomotion: { useWorker: true },
    grabbing: true,
    physics: false,
    sceneUnderstanding: false,
    environmentRaycast: false,
  },
}).then((world) => {
  const { camera, renderer } = world;
  renderer.outputColorSpace = SRGBColorSpace;
  // Enable shadows with a soft shadow map
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  // Fix #4: physicallyCorrectLights was removed in Three.js r155+; SDK ships r177.
  // Setting it via `as any` silently no-ops. useLegacyLights = false is the correct form.
  (renderer as any).useLegacyLights = false;

  // Apply Blender Color Management/Exposure settings
  renderer.toneMapping = ACESFilmicToneMapping; // Emulates High Contrast look
  renderer.toneMappingExposure = 0.9; // Emulates Exposure = +0.3 (1.0 + 0.3)

  // Fix #2: request 1.5× the headset's recommended resolution so metallic surface
  // detail and specular highlights are rendered at near-panel-native sharpness.
  renderer.xr.setFramebufferScaleFactor(1.5);

  // Fix #3: some Quest browser versions reset renderer state on xr.setSession().
  // Reaffirm tone mapping and colour space on every XR session start.
  renderer.xr.addEventListener('sessionstart', () => {
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.outputColorSpace = SRGBColorSpace;
  });

  const levelRoot = world.activeLevel.value;
  levelRoot.addComponent(IBLTexture, {
    src: "worldHDR",
    intensity: 1.5, // Matches HDRI strength = 1.5
  });
  levelRoot.addComponent(DomeGradient, {
    sky: [0.95, 0.95, 0.95, 1.0],
    equator: [0.95, 0.95, 0.95, 1.0],
    ground: [0.95, 0.95, 0.95, 1.0],
    intensity: 1.0,
  });

  // Fix #5: align desktop preview camera with XR eye height (1.7 m) and place it
  // at Z=5.0 to frame the large lathe machine and prevent perspective distortion at startup.
  camera.position.set(0, 1.7, 5.0);


  const ground = new Mesh(
    new PlaneGeometry(100, 100),
    new MeshBasicMaterial({ visible: false }),
  );
  ground.rotateX(-Math.PI / 2);
  world
    .createTransformEntity(ground)
    .addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC });

  // Add a transparent shadow-receiving plane at floor level
  const shadowGround = new Mesh(
    new PlaneGeometry(100, 100),
    new ShadowMaterial({ opacity: 0.4 }),
  );
  shadowGround.rotateX(-Math.PI / 2);
  shadowGround.receiveShadow = true;
  world.createTransformEntity(shadowGround);

  // Performance-optimized directional light for shadows in VR
  const dirLight = new DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(4, 8, 4);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024; // Optimized for performance/quality balance on Quest
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 15;
  dirLight.shadow.camera.left = -6;
  dirLight.shadow.camera.right = 6;
  dirLight.shadow.camera.top = 6;
  dirLight.shadow.camera.bottom = -6;
  dirLight.shadow.bias = -0.0005; // Prevents shadow acne artifacts on model meshes
  world.createTransformEntity(dirLight);

  const { scene: latheMachine } = AssetManager.getGLTF("latheMachine")!;
  enforceSmoothGLBShading(latheMachine);

  // Enable shadow casting and receiving for the model's meshes
  latheMachine.traverse((child: any) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  placeModelOnFloor(latheMachine, 9.0);
  latheMachine.position.z -= 3.0;
  world
    .createTransformEntity(latheMachine)
    .addComponent(Interactable);

  const telemetry = setupHolographicTelemetry(world, latheMachine);

  const latheBounds = new Box3().setFromObject(latheMachine);
  const latheSize = new Vector3();
  const latheCenter = new Vector3();
  latheBounds.getSize(latheSize);
  latheBounds.getCenter(latheCenter);

  // Collision standoff margin: 0.4 m padding beyond the machine bounding box.
  // In XR this is the minimum distance the locomotion system enforces between the
  // user and the machine — prevents perspective distortion from overly close inspection.
  const COLLISION_STANDOFF = 0.4;
  const latheCollisionProxy = new Mesh(
    new BoxGeometry(
      latheSize.x + COLLISION_STANDOFF * 2,
      latheSize.y,
      latheSize.z + COLLISION_STANDOFF * 2,
    ),
    new MeshBasicMaterial({ visible: false }),
  );
  latheCollisionProxy.name = "LatheCollisionProxy";
  latheCollisionProxy.position.copy(latheCenter);
  world
    .createTransformEntity(latheCollisionProxy)
    .addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC });

  // Set up OrbitControls on desktop for a premium showroom product-viewing feel
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(latheCenter);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Prevent looking from underneath the floor
  controls.maxPolarAngle = Math.PI / 2 - 0.01;

  // Constrain distance to prevent overly close inspection (which exaggerates perspective distortion)
  // or zooming too far out (losing details).
  controls.minDistance = 4.5;
  controls.maxDistance = 15.0;

  controls.update();

  // Custom system to update controls on every frame for smooth damping
  class OrbitControlsSystem extends createSystem({}) {
    update() {
      if (controls && controls.enabled) {
        controls.update();
      }
    }
  }
  world.registerSystem(OrbitControlsSystem);

  let lastTelemetryTime = performance.now() / 1000;
  class TelemetrySystem extends createSystem({}) {
    update() {
      const now = performance.now() / 1000;
      telemetry.update(now, now - lastTelemetryTime);
      lastTelemetryTime = now;
    }
  }
  world.registerSystem(TelemetrySystem);

  // Disable controls when entering XR, and restore/re-enable when returning to desktop preview
  world.visibilityState.subscribe((state) => {
    if (state === VisibilityState.NonImmersive) {
      controls.enabled = true;
      camera.position.set(0, 1.7, 5.0);
      controls.target.copy(latheCenter);
      controls.update();
    } else {
      controls.enabled = false;
    }
  });

});
