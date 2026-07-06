/**
 * AssistantSystem
 * ===============
 * ECS bridge between AssistantService and the IWSDK world.
 *
 * Responsibilities:
 *  - Subscribe to AssistantService events and route them to RobotPresenter
 *  - Subscribe to AssistantService action events and route to ActionRegistry
 *  - Subscribe to window overlay events (text input from screen console)
 *  - Update scene context (user position) each frame
 *  - Wire robot hotspot press → toggle voice listening
 *
 * This system has NO per-frame AI logic. update() only reads user position
 * into the scene context — a cheap Vector3 read, zero allocations.
 */

import {
  createSystem,
  Interactable,
  Pressed,
  Vector3,
  PanelDocument,
} from "@iwsdk/core";
import type { UIKitDocument } from "@iwsdk/core";
import type { AssistantService, AssistantEvent } from "../services/assistant-service";
import type { ActionRegistry } from "../services/action-registry";
import type { RobotPresenter } from "../robot/robot-presenter";
import { BubblePanelChannel, OverlayTextChannel } from "../robot/robot-presenter";
import type { RobotVisualState } from "../robot/robot-presenter";
import { analyzeSpatialContext } from "../services/spatial-analyzer";

export class AssistantSystem extends createSystem({
  pressed: { required: [Interactable, Pressed] },
  bubblePanel: { required: [PanelDocument] },
}) {
  private initialized = false;
  private robotEntityIndex = -1;
  private bubbleDocEntityIndex = -1;
  private presenterWired = false;

  /** Pre-allocated Vector3 for user position reads — no GC pressure */
  private headPos!: Vector3;
  private overlayInputHandler: ((e: Event) => void) | null = null;
  private serviceUnsub: (() => void) | null = null;

  // These are set during tryInit() from world.globals
  private service!: AssistantService;
  private registry!: ActionRegistry;
  private presenter!: RobotPresenter;

  init() {
    this.headPos = new Vector3();

    // Wire overlay text input events
    this.overlayInputHandler = (e: Event) => {
      const { text } = (e as CustomEvent).detail as { text: string };
      if (text?.trim()) {
        const trimmed = text.trim();
        if (this.handleLocalXrCommand(trimmed)) return;
        this.service?.send(trimmed);
      }
    };
    window.addEventListener("assistant:input", this.overlayInputHandler);

    // Wire audio file upload (dev overlay — bypasses mic, same pipeline)
    const audioFileHandler = (e: Event) => {
      const { file } = (e as CustomEvent).detail as { file: File };
      if (file) this.service?.sendAudio(file);
    };
    window.addEventListener("assistant:audio_file", audioFileHandler);

    // Wire image file upload (dev overlay)
    const imageFileHandler = (e: Event) => {
      const { file } = (e as CustomEvent).detail as { file: File };
      if (file) this.service?.sendImage(file);
    };
    window.addEventListener("assistant:image_file", imageFileHandler);

    // Wire input with attached image (dev overlay)
    const inputWithImageHandler = (e: Event) => {
      const { text, file } = (e as CustomEvent).detail as { text: string, file: File };
      if (file) this.service?.sendImage(file, text);
    };
    window.addEventListener("assistant:input_with_image", inputWithImageHandler);

    // Wire STOP button event
    const stopHandler = () => {
      console.log('[AssistantSystem] STOP button pressed - interrupting conversation');
      this.service?.stop();
    };
    window.addEventListener("assistant:stop", stopHandler);

    // Wire screenshot guide
    const screenshotGuideHandler = () => {
      const guideText = "Please take a screenshot by pressing the Meta Button and the Right Trigger together. Once the image appears, select Share, then choose Lathe Trainer.";
      this.presenter?.present({ type: "message", text: guideText });
    };
    window.addEventListener("assistant:screenshot_guide", screenshotGuideHandler);

    // Wire ServiceWorker Web Share Target messages
    const swMessageHandler = (event: MessageEvent) => {
      if (event.data?.type === 'SHARED_IMAGE') {
        const file = event.data.file as File;
        if (file) {
          console.log('[AssistantSystem] Received shared image from ServiceWorker');
          this.service?.sendImage(file);
        }
      }
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', swMessageHandler);
    }

    // Clean up the listener when the system is destroyed
    this.cleanupFuncs.push(() => {
      if (this.overlayInputHandler) {
        window.removeEventListener("assistant:input", this.overlayInputHandler!);
      }
      window.removeEventListener("assistant:audio_file", audioFileHandler);
      window.removeEventListener("assistant:image_file", imageFileHandler);
      window.removeEventListener("assistant:input_with_image", inputWithImageHandler);
      window.removeEventListener("assistant:stop", stopHandler);
      window.removeEventListener("assistant:screenshot_guide", screenshotGuideHandler);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', swMessageHandler);
      }
      if (this.serviceUnsub) this.serviceUnsub();
    });

    // Robot click removed - voice input now controlled by Right Grip controller button

    (this as any)._lastPressTime = -1;
  }

  update() {
    if (!this.initialized) {
      this.tryInit();
      return;
    }

    // Scene context: update user head position cheaply every frame
    this.player.head.getWorldPosition(this.headPos);
    const ctx = (this.world.globals as any).sceneContext;
    if (ctx) {
      ctx.userPosition = {
        x: this.headPos.x,
        y: this.headPos.y,
        z: this.headPos.z,
      };

      // Calculate spatial analysis (which component is user near/facing)
      const spatial = analyzeSpatialContext(ctx.userPosition);
      ctx.spatialAnalysis = spatial.description;

      // Auto-set selected component using directionally-relevant component
      if (spatial.relevantComponent && spatial.relevantDistance < spatial.relevantComponent.proximityRadius) {
        ctx.selectedComponent = spatial.relevantComponent.displayName;
      } else {
        // Clear selection if not close to anything
        ctx.selectedComponent = undefined;
      }
    }

    // Lazy-wire the bubble panel doc once it's ready
    if (!this.presenterWired) {
      this.tryWireBubbleChannel();
    }
  }

  // ─── Initialisation ───────────────────────────────────────────────────────

  private tryInit(): void {
    const g = this.world.globals as any;

    // All globals must be ready before we proceed
    if (!g.assistantService || !g.actionRegistry || !g.robotPresenter) return;

    this.service = g.assistantService as AssistantService;
    this.registry = g.actionRegistry as ActionRegistry;
    this.presenter = g.robotPresenter as RobotPresenter;

    // Robot hotspot entity index (set in index.ts via robotScene.hotspotEntityIdx)
    const robot = g.robot;
    this.robotEntityIndex = robot ? ((robot as any).hotspotEntityIdx ?? -1) : -1;

    // Register overlay text channel immediately (no DOM deps)
    this.presenter.addTextChannel(new OverlayTextChannel());

    // Subscribe to service events
    this.serviceUnsub = this.service.on((event: AssistantEvent) => {
      this.handleServiceEvent(event);
    });

    this.initialized = true;
  }

  private tryWireBubbleChannel(): void {
    // Look for the bubble panel entity — its Object3D and PanelDocument
    const g = this.world.globals as any;
    const bubbleObj = g.robotBubbleObject3D;
    if (!bubbleObj) return;

    // Find entity with PanelDocument that matches the bubble
    for (const entity of this.queries.bubblePanel.entities) {
      // Only look at the bubble entity — check Object3D matches
      if (entity.object3D && entity.object3D !== bubbleObj) continue;

      const doc = PanelDocument.data.document[entity.index] as UIKitDocument | undefined;
      if (!doc) continue;

      const bubbleChannel = new BubblePanelChannel({
        bubbleObject: bubbleObj,
        textNodeId: "bubble-text",
        getDoc: () => doc,
      });

      this.presenter.addTextChannel(bubbleChannel);
      this.presenterWired = true;
      break;
    }
  }

  // ─── Service Event Routing ────────────────────────────────────────────────

  private handleServiceEvent(event: AssistantEvent): void {
    switch (event.type) {
      case "thinking":
        this.presenter.present({ type: "state_change", state: "thinking" as RobotVisualState });
        this.dispatchOverlayState("thinking");
        break;

      case "token":
        this.presenter.present({ type: "stream_token", text: event.text });
        break;

      case "response":
        this.presenter.present({ type: "message", text: event.text });
        break;

      case "action":
        console.log(`[AssistantSystem] Executing action: ${event.name}`);
        // ActionRegistry.execute() already calls ExploreSystem directly for highlights.
        // Do NOT also route through presenter highlight channels — that would double-fire.
        this.registry.execute(event.name);
        this.presenter.present({ type: "action_feedback", actionName: event.name });
        break;

      case "speaking":
        this.presenter.present({ type: "state_change", state: "speaking" as RobotVisualState });
        this.dispatchOverlayState("speaking");
        break;

      case "speaking_end":
        break;

      case "error":
        console.error(`[AssistantSystem] Service Error: ${event.message}`);
        this.presenter.present({ type: "message", text: `⚠️ Error: ${event.message}` });
        this.dispatchOverlayState("idle");
        break;

      case "listening_start":
        this.presenter.present({ type: "state_change", state: "listening" as RobotVisualState });
        this.dispatchOverlayState("listening");
        break;

      case "listening_end":
        this.presenter.present({ type: "state_change", state: "idle" as RobotVisualState });
        this.dispatchOverlayState("idle");
        break;

      case "idle":
        this.presenter.present({ type: "state_change", state: "idle" as RobotVisualState });
        this.dispatchOverlayState("idle");
        break;
    }
  }

  private handleLocalXrCommand(text: string): boolean {
    const normalized = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").trim();

    // ── Stop command — intercept before sending to AI ──────────────────────
    // Catches typed stop words in any language immediately, without an API call.
    const STOP_WORDS = [
      "stop", "quiet", "silence", "enough", "halt", "cancel", "shut up", "be quiet",
      "fermati", "basta", "silenzio", "smettila", "taci",
      "arrêtez", "arrêtez vous", "tais toi", "suffit",
      "para", "cállate", "silencio",
      "قف", "اسكت", "صمت", "كفى",
      "остановись", "замолчи", "стоп",
      "停", "止まれ", "静かに",
      "रुको", "बंद करो",
    ];
    if (STOP_WORDS.some(w => normalized === w || normalized.startsWith(w + " "))) {
      this.service?.stop();
      return true;
    }

    const wantsToolPanel =
      normalized.includes("open tool panel") ||
      normalized.includes("show tool panel") ||
      normalized.includes("open tools") ||
      normalized.includes("show tools") ||
      normalized.includes("assistant tools") ||
      normalized.includes("apri pannello strumenti") ||
      normalized.includes("mostra strumenti") ||
      normalized.includes("ouvrir le panneau") ||
      normalized.includes("herramientas") ||
      normalized.includes("افتح لوحة") ||
      normalized.includes("افتح الادوات") ||
      normalized.includes("الأدوات");

    if (wantsToolPanel) {
      window.dispatchEvent(new CustomEvent("assistant:show_xr_actions"));
      this.presenter?.present({ type: "message", text: "Opening Tool Panel." });
      return true;
    }

    const wantsWrite =
      normalized.includes("write text") ||
      normalized.includes("write a text") ||
      normalized.includes("type message") ||
      normalized.includes("send text") ||
      normalized.includes("اكتب") ||
      normalized.includes("اكتب رسالة");

    if (wantsWrite) {
      window.dispatchEvent(new CustomEvent("assistant:show_xr_actions", {
        detail: { mode: "write" },
      }));
      this.presenter?.present({ type: "message", text: "Opening XR text tools." });
      return true;
    }

    const wantsImage =
      normalized.includes("send image") ||
      normalized.includes("upload image") ||
      normalized.includes("add image") ||
      normalized.includes("send picture") ||
      normalized.includes("ارسل صورة") ||
      normalized.includes("صورة");

    if (wantsImage) {
      window.dispatchEvent(new CustomEvent("assistant:show_xr_actions", {
        detail: { mode: "image" },
      }));
      this.presenter?.present({ type: "message", text: "Opening XR image tools." });
      return true;
    }

    return false;
  }

  private dispatchOverlayState(state: string): void {
    window.dispatchEvent(new CustomEvent("assistant:state", { detail: { state } }));
  }
}
