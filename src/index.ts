import {
  AssetManifest,
  AssetType,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  BoxGeometry,
  SphereGeometry,
  SessionMode,
  SRGBColorSpace,
  AssetManager,
  World,
  Box3,
  Vector3,
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  DirectionalLight,
  ShadowMaterial,
  Interactable,
  PokeInteractable,
  RayInteractable,
  DistanceGrabbable,
  MovementMode,
  PanelUI,
  createSystem,
  createComponent,
} from "@iwsdk/core";

import { AssistantService } from "./services/assistant-service";
import { ActionRegistry } from "./services/action-registry";
import { createSceneContext } from "./services/scene-context";
import { RobotPresenter } from "./robot/robot-presenter";
import { AssistantSystem } from "./systems/assistant-system";
import { DevTextInput } from "./overlay/assistant-overlay";
import { MACHINE_COMPONENTS } from "./machine/machine-map";
import { extractComponentPositions } from "./helpers/extract-positions";
import { ScreenshotService } from "./services/screenshot-service";
import { ControllerInputSystem } from "./systems/controller-input-system";
import { MouseInputSystem } from "./systems/mouse-input-system";

import * as lucideKit from '@pmndrs/uikit-lucide';

import { EnvironmentType, LocomotionEnvironment, IBLTexture, DomeTexture } from "@iwsdk/core";
import { OrbitControlsSystem } from "./systems/orbit-controls-system";
import { optimizeLatheMaterials, placeModelOnFloor } from "./helpers/model-utils";
import { DoorSlideSystem } from "./systems/door-slide-system";
import { SummonSystem } from "./systems/summon-system";
import { HotspotSystem } from "./systems/hotspot-system";
import { ExploreSystem } from "./systems/explore-system";
import { VerticalMenuSystem } from "./systems/vertical-menu-system";
import { RobotSystem } from "./systems/robot-system";
import { RobotToolbarSystem } from "./systems/robot-toolbar-system";
import { PanelSystem } from "./panel";

// ---------------------------------------------------------------------------
// SPINNER COMPONENT & SYSTEM INTEGRATION
// Handles the 360-degree horizontal billboard tracking behavior.
// ---------------------------------------------------------------------------
export const Spinner = createComponent('Spinner', {});

export class SpinSystem extends createSystem({
  spinner: { required: [Spinner] },
}) {
  private lookAtTarget!: Vector3;
  private vec3!: Vector3;

  init() {
    this.lookAtTarget = new Vector3();
    this.vec3 = new Vector3();
  }

  update() {
    for (const entity of this.queries.spinner.entities) {
      this.player.head.getWorldPosition(this.lookAtTarget);
      const spinnerObject = entity.object3D;
      if (!spinnerObject) continue;

      spinnerObject.getWorldPosition(this.vec3);
      // Locks the Y axis to prevent awkward vertical tilting, ensuring 360 horizontal billboard behavior
      this.lookAtTarget.y = this.vec3.y;
      spinnerObject.lookAt(this.lookAtTarget);
    }
  }
}

const assets: AssetManifest = {
  latheMachine: {
    url: "./gltf/wows3.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  robot: {
    url: "./gltf/robot-anim.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  worldHDR: {
    url: "./textures/industrial_pipe_and_valve_02_1k.hdr",
    type: AssetType.HDRTexture,
    priority: "critical",
  },
};

World.create(document.getElementById("scene-container") as HTMLDivElement, {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    offer: "always",
    features: { handTracking: true, layers: true },
  },
  render: {
    defaultLighting: false,
    near: 0.05,
    far: 50,
    fov: 45,
  },
  features: {
    locomotion: { useWorker: true },
    grabbing: { useHandPinchForGrab: true },
    physics: false,
    sceneUnderstanding: false,
    environmentRaycast: false,
    spatialUI: {
      kits: lucideKit,
    }
  },
}).then((world) => {
  // AI Knowledge Base loading removed as per user request

  const { camera, renderer } = world;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  // Tone mapping: ACESFilmic with conservative exposure to preserve specular detail.
  // Exposure 1.0 keeps metallic highlight variation intact; higher values blow out
  // bright areas and make surfaces look flat under ACESFilmic's aggressive S-curve.
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  // Framebuffer scale: Quest's default render resolution is already ~0.8× native.
  // 1.5× supersamples to ~1.2× native, restoring specular sharpness and normal-map
  // detail that are lost at the default 1.0–1.2× range.
  renderer.xr.setFramebufferScaleFactor(1.5); // Changed from 2 to 1.5 for stability

  const levelRoot = world.activeLevel.value;
  const environmentRotation: [number, number, number] = [0, 0, 0];

  levelRoot.addComponent(IBLTexture, {
    src: "worldHDR",
    intensity: 1.5,
    rotation: environmentRotation,
  });
  levelRoot.addComponent(DomeTexture, {
    src: "worldHDR",
    intensity: 1.3,
    blurriness: 0,
    rotation: environmentRotation,
  });

  camera.position.set(0, 1.7, 5.0);

  const ground = new Mesh(
    new PlaneGeometry(100, 100),
    new MeshBasicMaterial({ visible: false }),
  );
  ground.rotateX(-Math.PI / 2);
  world
    .createTransformEntity(ground)
    .addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC });

  const shadowGround = new Mesh(
    new PlaneGeometry(100, 100),
    new ShadowMaterial({ opacity: 0.4 }),
  );
  shadowGround.rotateX(-Math.PI / 2);
  shadowGround.receiveShadow = true;
  world.createTransformEntity(shadowGround);

  const dirLight = new DirectionalLight(0xffffff, 0.6);
  dirLight.position.set(4, 8, 4);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(1024, 1024);
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 15;
  dirLight.shadow.camera.left = -6;
  dirLight.shadow.camera.right = 6;
  dirLight.shadow.camera.top = 6;
  dirLight.shadow.camera.bottom = -6;
  dirLight.shadow.bias = -0.0005;
  world.createTransformEntity(dirLight);

  const { scene: latheMachine } = AssetManager.getGLTF("latheMachine")!;
  latheMachine.name = "LatheMachine"; // Named for the OrbitControlsSystem target
  optimizeLatheMaterials(latheMachine);

  // Store in globals for systems like DoorSlideSystem
  (world.globals as any).latheMachine = latheMachine;

  latheMachine.traverse((child: any) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  placeModelOnFloor(latheMachine, 9.0);
  latheMachine.position.z -= 3.0;
  latheMachine.updateMatrixWorld(true); // Ensure bounds calculation is accurate

  // DEBUG: Extract real component positions (run once, then comment out)
  // extractComponentPositions(latheMachine);

  world
    .createTransformEntity(latheMachine)
    .addComponent(Interactable);

  // ---------------------------------------------------------------------------
  // Compute the CNC machine bounds to assist with positioning references
  // ---------------------------------------------------------------------------
  const latheBounds = new Box3().setFromObject(latheMachine);
  const latheSize = new Vector3();
  const latheCenter = new Vector3();
  latheBounds.getSize(latheSize);
  latheBounds.getCenter(latheCenter);

  // Welcome card — first XR-facing onboarding surface for language/tools.
  // Anchor it to the machine area, raised above the lathe and slightly forward.
  const welcomePanelEntity = world.createTransformEntity();
  if (welcomePanelEntity.object3D) {
    welcomePanelEntity.object3D.position.set(
      latheCenter.x,
      latheBounds.max.y - 1,
      latheBounds.max.z + 0.25,
    );
  }
  welcomePanelEntity.addComponent(PanelUI, {
    config: "./ui/welcome.json",
    maxWidth: 1.35,
    maxHeight: 0.95,
  });
  welcomePanelEntity.addComponent(Interactable);
  welcomePanelEntity.addComponent(RayInteractable);
  welcomePanelEntity.addComponent(PokeInteractable);
  welcomePanelEntity.addComponent(Spinner);
  (world.globals as any).welcomePanelObject3D = welcomePanelEntity.object3D;

  // XR assistant action test panel — hidden until summoned by command/event.
  const xrActionPanelEntity = world.createTransformEntity();
  if (xrActionPanelEntity.object3D) {
    xrActionPanelEntity.object3D.position.set(
      latheCenter.x,
      latheBounds.max.y + 0.05,
      latheBounds.max.z + 0.35,
    );
    xrActionPanelEntity.object3D.visible = false;
  }
  xrActionPanelEntity.addComponent(PanelUI, {
    config: "./ui/xr-action-panel.json",
    maxWidth: 0.78,
    maxHeight: 0.42,
  });
  xrActionPanelEntity.addComponent(Interactable);
  xrActionPanelEntity.addComponent(RayInteractable);
  xrActionPanelEntity.addComponent(PokeInteractable);
  xrActionPanelEntity.addComponent(Spinner);
  (world.globals as any).xrActionPanelObject3D = xrActionPanelEntity.object3D;

  // ---------------------------------------------------------------------------
  // VERTICAL MENU — kept in code but HIDDEN. Robot takes this position now.
  // ---------------------------------------------------------------------------
  const vmenuAnchorPosition = new Vector3(
    latheBounds.min.x + 0.1,
    0.8,
    latheBounds.max.z - 0.2,
  );

  const menuHandleGeom = new BoxGeometry(0.4, 0.04, 0.04);
  menuHandleGeom.translate(0, -0.12, 0);
  const menuRootMesh = new Mesh(
    menuHandleGeom,
    new MeshBasicMaterial({ visible: false }),
  );
  menuRootMesh.name = "MenuRoot";
  menuRootMesh.position.copy(vmenuAnchorPosition);
  menuRootMesh.visible = false; // HIDDEN
  const menuRootEntity = world.createTransformEntity(menuRootMesh);
  menuRootEntity.addComponent(Interactable);
  menuRootEntity.addComponent(RayInteractable);
  menuRootEntity.addComponent(DistanceGrabbable, {
    movementMode: MovementMode.MoveFromTarget,
  });
  menuRootEntity.addComponent(Spinner);

  const verticalMenuEntity = world.createTransformEntity(undefined, { parent: menuRootEntity });
  if (verticalMenuEntity.object3D) {
    verticalMenuEntity.object3D.position.set(0, 0, 0.01);
    verticalMenuEntity.object3D.visible = false; // HIDDEN
  }
  verticalMenuEntity.addComponent(PanelUI, {
    config: "./ui/vertical-menu.json",
    maxWidth: 1.1,
    maxHeight: 0.18,
  });
  verticalMenuEntity.addComponent(Interactable);
  verticalMenuEntity.addComponent(RayInteractable);
  verticalMenuEntity.addComponent(PokeInteractable);

  const vmExplorePanel = world.createTransformEntity(undefined, { parent: menuRootEntity });
  if (vmExplorePanel.object3D) {
    vmExplorePanel.object3D.position.set(0, 0.42, 0.02);
    vmExplorePanel.object3D.visible = false; // HIDDEN
  }
  vmExplorePanel.addComponent(PanelUI, {
    config: "./ui/explore-panel.json",
    maxWidth: 0.65,
    maxHeight: 0.55,
  });
  vmExplorePanel.addComponent(Interactable);
  vmExplorePanel.addComponent(RayInteractable);
  vmExplorePanel.addComponent(PokeInteractable);
  (world.globals as any).vmExplorePanelObject3D = vmExplorePanel.object3D;

  const vmAiCard = world.createTransformEntity(undefined, { parent: menuRootEntity });
  if (vmAiCard.object3D) {
    vmAiCard.object3D.position.set(0, 0.52, 0.02);
    vmAiCard.object3D.visible = false; // HIDDEN
  }
  vmAiCard.addComponent(PanelUI, {
    config: "./ui/ask-ai-card.json",
    maxWidth: 1.2,
    maxHeight: 0.9,
  });
  vmAiCard.addComponent(Interactable);
  vmAiCard.addComponent(RayInteractable);
  vmAiCard.addComponent(PokeInteractable);
  (world.globals as any).vmAiCardObject3D = vmAiCard.object3D;

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

  // Register ECS Systems
  world.registerSystem(OrbitControlsSystem);
  world.registerSystem(SpinSystem);
  world.registerSystem(DoorSlideSystem);
  world.registerSystem(ExploreSystem);
  world.registerSystem(PanelSystem);
  world.registerSystem(VerticalMenuSystem); // kept registered, panels are just hidden
  world.registerSystem(ControllerInputSystem); // Quest 3 controllers
  world.registerSystem(MouseInputSystem); // PC testing

  // ---------------------------------------------------------------------------
  // ROBOT — moved to the vertical menu anchor position, scaled up
  // ---------------------------------------------------------------------------
  const { scene: robotScene } = AssetManager.getGLTF("robot")!;
  (world.globals as any).robot = robotScene;

  robotScene.traverse((child: any) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  placeModelOnFloor(robotScene, 1.0);

  // Place robot where the vertical menu used to be — front-left of the machine
  robotScene.position.set(
    latheBounds.min.x + 0.1,   // same x as vmenuAnchorPosition
    robotScene.position.y,
    latheBounds.max.z - 0.2,   // same z as vmenuAnchorPosition
  );

  // Scale up — robot was too small
  robotScene.scale.setScalar(1.8);

  const robotEntity = world.createTransformEntity(robotScene);
  (robotScene as any).entityIdx = robotEntity.index;
  robotEntity.addComponent(Interactable);
  robotEntity.addComponent(DistanceGrabbable, {
    movementMode: MovementMode.MoveFromTarget,
  });
  robotEntity.addComponent(Spinner);

  // Invisible press hotspot — robot chest/face level
  const hotspotMesh = new Mesh(
    new SphereGeometry(0.18, 8, 8),
    new MeshBasicMaterial({ visible: false }),
  );
  const robotBodyNode = robotScene.getObjectByName("Robot") ?? robotScene;
  hotspotMesh.position.set(0, 0.5, 0);
  robotBodyNode.add(hotspotMesh);
  const robotHotspotEntity = world.createTransformEntity(hotspotMesh, robotEntity);
  robotHotspotEntity.addComponent(Interactable);
  robotHotspotEntity.addComponent(RayInteractable);
  (robotScene as any).hotspotEntityIdx = robotHotspotEntity.index;

  // Speech bubble — above robot head
  const robotBubble = world.createTransformEntity(undefined, { parent: robotEntity });
  if (robotBubble.object3D) {
    robotBubble.object3D.position.set(0, 1.05, 0);
    robotBubble.object3D.visible = false;
  }
  robotBubble.addComponent(PanelUI, {
    config: "./ui/robot-bubble.json",
    maxWidth: 0.9,
    maxHeight: 0.6,
  });
  (world.globals as any).robotBubbleObject3D = robotBubble.object3D;

  // ---------------------------------------------------------------------------
  // ROBOT TOOLBAR
  // Two entities parented to robotEntity:
  //   1. toolbarToggleEntity — always visible, contains only the ≡ toggle button
  //   2. toolbarPillEntity   — hidden by default, contains Pen/Clock/Settings
  // Both face the user via Spinner inherited from robotEntity parent.
  // ---------------------------------------------------------------------------

  // Always-visible toggle button
  const toolbarToggleEntity = world.createTransformEntity(undefined, { parent: robotEntity });
  if (toolbarToggleEntity.object3D) {
    toolbarToggleEntity.object3D.position.set(-0.4, 0.3, 0.1);
  }
  toolbarToggleEntity.addComponent(PanelUI, {
    config: "./ui/robot-toolbar-toggle.json",
    maxWidth: 0.12,
    maxHeight: 0.12,
  });
  toolbarToggleEntity.addComponent(Interactable);
  toolbarToggleEntity.addComponent(RayInteractable);
  toolbarToggleEntity.addComponent(PokeInteractable);
  (world.globals as any).robotToolbarToggleObject3D = toolbarToggleEntity.object3D;

  // Collapsible pill — hidden until toggle pressed
  const toolbarPillEntity = world.createTransformEntity(undefined, { parent: robotEntity });
  if (toolbarPillEntity.object3D) {
    toolbarPillEntity.object3D.position.set(-0.4, 0.45, 0.1);
    toolbarPillEntity.object3D.visible = false;
  }
  toolbarPillEntity.addComponent(PanelUI, {
    config: "./ui/robot-toolbar-pill.json",
    maxWidth: 0.12,
    maxHeight: 0.62,
  });
  toolbarPillEntity.addComponent(Interactable);
  toolbarPillEntity.addComponent(RayInteractable);
  toolbarPillEntity.addComponent(PokeInteractable);
  (world.globals as any).robotToolbarPillObject3D = toolbarPillEntity.object3D;

  // Settings sub-panel — appears to the left of the toolbar pill
  const settingsPanelEntity = world.createTransformEntity(undefined, { parent: robotEntity });
  if (settingsPanelEntity.object3D) {
    settingsPanelEntity.object3D.position.set(-0.7, 0.45, 0.1);
    settingsPanelEntity.object3D.visible = false;
  }
  settingsPanelEntity.addComponent(PanelUI, {
    config: "./ui/robot-settings.json",
    maxWidth: 0.42,
    maxHeight: 0.5,
  });
  settingsPanelEntity.addComponent(Interactable);
  settingsPanelEntity.addComponent(RayInteractable);
  settingsPanelEntity.addComponent(PokeInteractable);
  (world.globals as any).robotSettingsPanelObject3D = settingsPanelEntity.object3D;

  world.registerSystem(RobotSystem);
  world.registerSystem(RobotToolbarSystem);

  // ─── AI Assistant Setup ────────────────────────────────────────────────────

  // Screenshot service for vision queries
  const screenshotService = new ScreenshotService(renderer, camera);
  (world.globals as any).screenshotService = screenshotService;

  // Scene context — mutable object any system can write to
  const sceneContext = createSceneContext();
  (world.globals as any).sceneContext = sceneContext;

  // Action registry — maps AI action tokens to world functions
  const actionRegistry = new ActionRegistry();
  (world.globals as any).actionRegistry = actionRegistry;

  // Wire door actions
  const doorSystem = world.getSystem(DoorSlideSystem);
  if (doorSystem) {
    actionRegistry.register("OPEN_DOOR", () => doorSystem.openDoor());
    actionRegistry.register("CLOSE_DOOR", () => doorSystem.closeDoor());
    (world.globals as any).doorSlideSystem = doorSystem;
  }

  // Wire all HIGHLIGHT_* component actions + HIGHLIGHT_CLEAR
  const exploreSystem = world.getSystem(ExploreSystem);
  if (exploreSystem) {
    for (const component of MACHINE_COMPONENTS) {
      actionRegistry.register(component.highlightAction, () =>
        exploreSystem.highlightComponent(component.id),
      );
    }
    actionRegistry.register("HIGHLIGHT_CLEAR", () => exploreSystem.clearHighlights());
    (world.globals as any).exploreSystem = exploreSystem;
  }

  actionRegistry.register("SHOW_TOOL_PANEL", () => {
    window.dispatchEvent(new CustomEvent("assistant:show_xr_actions"));
  });
  actionRegistry.register("SHOW_XR_WRITE_PANEL", () => {
    window.dispatchEvent(new CustomEvent("assistant:show_xr_actions", {
      detail: { mode: "write" },
    }));
  });
  actionRegistry.register("SHOW_XR_IMAGE_PANEL", () => {
    window.dispatchEvent(new CustomEvent("assistant:show_xr_actions", {
      detail: { mode: "image" },
    }));
  });

  // Robot presenter — generic output layer
  const robotPresenter = new RobotPresenter();
  (world.globals as any).robotPresenter = robotPresenter;

  // Register ExploreSystem as a HighlightChannel now that presenter exists
  if (exploreSystem) {
    robotPresenter.addHighlightChannel(exploreSystem);
  }

  // BubblePanelChannel will be wired lazily by AssistantSystem once PanelDocument is ready

  // Load knowledge base then boot the assistant service
  const apiKey = (window as any).__NVIDIA_API_KEY__ ?? import.meta.env.VITE_AI_API_KEY ?? "";
  fetch("/CNC_Knowledge.md")
    .then((r) => (r.ok ? r.text() : Promise.resolve("")))
    .catch(() => "")
    .then((knowledgeBase) => {
      const assistantService = new AssistantService({
        apiKey,
        knowledgeBase,
        sceneContext,
        screenshotService,
      });

      // Wire demo callbacks so the service can drive highlights and narration
      const exploreSystemRef = world.getSystem(ExploreSystem);
      const doorSystemRef = world.getSystem(DoorSlideSystem);
      if (exploreSystemRef) {
        assistantService.demoCallbacks = {
          highlight: (id: string) => exploreSystemRef.highlightComponent(id),
          clearHighlights: () => exploreSystemRef.clearHighlights(),
          // showMessage is overridden inside runDemo() to go through emit
          showMessage: () => { },
          // Open door mid-demo after the door slide narration
          openDoor: () => doorSystemRef?.openDoor(),
        };
      }

      // Register DEMO_HOW_IT_WORKS action
      actionRegistry.register("DEMO_HOW_IT_WORKS", () => assistantService.runDemo());

      (world.globals as any).assistantService = assistantService;
    });

  // Register ECS bridge system (wires lazily once globals are ready)
  world.registerSystem(AssistantSystem);

  // Dev textarea strip — browser-only text input for development typing
  const devInput = new DevTextInput();
  devInput.mount();

  // Expose ExploreSystem instance so VerticalMenuSystem can toggle its signal
  // (already stored in world.globals.exploreSystem above)
});
