import {
  createSystem,
  PanelUI,
  PanelDocument,
  eq,
  Object3D,
} from "@iwsdk/core";
import type { UIKitDocument } from "@iwsdk/core";

export class PanelSystem extends createSystem({
  welcomePanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/welcome.json")],
  },
  dockPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/dock.json")],
  },
  aiCardPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/ask-ai-card.json")],
  },
  xrActionPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/xr-action-panel.json")],
  },
}) {
  private welcomeWired = false;
  private xrActionWired = false;
  private showXrActionsHandler!: (e: Event) => void;

  init() {
    this.queries.welcomePanel.subscribe("qualify", () => this.tryWireWelcome());
    this.queries.xrActionPanel.subscribe("qualify", () => this.tryWireXrActionPanel());

    this.showXrActionsHandler = (e: Event) => {
      const mode = ((e as CustomEvent).detail as any)?.mode as string | undefined;
      this.showXrActionPanel(mode);
    };
    window.addEventListener("assistant:show_xr_actions", this.showXrActionsHandler);

    this.cleanupFuncs.push(() => {
      window.removeEventListener("assistant:show_xr_actions", this.showXrActionsHandler);
    });
  }

  update() {
    if (!this.welcomeWired) this.tryWireWelcome();
    if (!this.xrActionWired) this.tryWireXrActionPanel();
  }

  private tryWireWelcome() {
    for (const entity of this.queries.welcomePanel.entities) {
      const doc = PanelDocument.data.document[entity.index] as UIKitDocument | undefined;
      if (!doc) continue;

      const setLanguage = (lang: string) => {
        localStorage.setItem("dev-assistant-lang", lang);
        window.dispatchEvent(new CustomEvent("assistant:set_language", { detail: { lang } }));
        this.hideWelcome();
      };

      doc.getElementById("welcome-lang-en")?.addEventListener("click", () => setLanguage("en"));
      doc.getElementById("welcome-lang-it")?.addEventListener("click", () => setLanguage("it"));
      doc.getElementById("welcome-lang-ar")?.addEventListener("click", () => setLanguage("ar"));
      doc.getElementById("welcome-lang-fr")?.addEventListener("click", () => setLanguage("fr"));
      doc.getElementById("welcome-lang-es")?.addEventListener("click", () => setLanguage("es"));

      doc.getElementById("welcome-continue")?.addEventListener("click", () => setLanguage("en"));
      doc.getElementById("welcome-write")?.addEventListener("click", () => {
        window.dispatchEvent(new CustomEvent("assistant:open_input"));
      });
      doc.getElementById("welcome-image")?.addEventListener("click", () => {
        window.dispatchEvent(new CustomEvent("assistant:open_input"));
      });
      doc.getElementById("welcome-mic")?.addEventListener("click", () => {
        window.dispatchEvent(new CustomEvent("assistant:mic_toggle"));
      });

      this.welcomeWired = true;
      break;
    }
  }

  private hideWelcome() {
    const obj = (this.world.globals as any).welcomePanelObject3D as Object3D | undefined;
    if (obj) obj.visible = false;
  }

  private tryWireXrActionPanel() {
    for (const entity of this.queries.xrActionPanel.entities) {
      const doc = PanelDocument.data.document[entity.index] as UIKitDocument | undefined;
      if (!doc) continue;

      doc.getElementById("xr-action-write")?.addEventListener("click", () => {
        this.setXrActionCopy(doc, "Text mode selected. Say your message aloud, or use the desktop dev input while testing.");
        window.dispatchEvent(new CustomEvent("assistant:xr_action", { detail: { mode: "write" } }));
      });

      doc.getElementById("xr-action-image")?.addEventListener("click", () => {
        this.setXrActionCopy(doc, "Image mode selected. Use Quest screenshot sharing for now; native XR image picking can be added next.");
        window.dispatchEvent(new CustomEvent("assistant:screenshot_guide"));
      });

      doc.getElementById("xr-action-settings")?.addEventListener("click", () => {
        const settingsObj = (this.world.globals as any).robotSettingsPanelObject3D as Object3D | undefined;
        if (settingsObj) settingsObj.visible = true;
        this.setXrActionCopy(doc, "Settings opened.");
      });

      doc.getElementById("xr-action-language")?.addEventListener("click", () => {
        const welcomeObj = (this.world.globals as any).welcomePanelObject3D as Object3D | undefined;
        if (welcomeObj) welcomeObj.visible = true;
        this.hideXrActionPanel();
      });

      doc.getElementById("xr-action-close")?.addEventListener("click", () => {
        this.hideXrActionPanel();
      });

      this.xrActionWired = true;
      break;
    }
  }

  private showXrActionPanel(mode?: string) {
    const obj = (this.world.globals as any).xrActionPanelObject3D as Object3D | undefined;
    if (obj) obj.visible = true;

    const doc = this.getXrActionDoc();
    if (!doc) return;

    if (mode === "write") {
      this.setXrActionCopy(doc, "Text tools are ready. This is the XR panel summoned by your command.");
    } else if (mode === "image") {
      this.setXrActionCopy(doc, "Image tools are ready. Use screenshot sharing for the first test.");
    } else if (mode === "settings") {
      this.setXrActionCopy(doc, "Settings tools are ready.");
    } else if (mode === "language") {
      this.setXrActionCopy(doc, "Language tools are ready.");
    } else {
      this.setXrActionCopy(doc, "Choose what you want to open in XR.");
    }
  }

  private hideXrActionPanel() {
    const obj = (this.world.globals as any).xrActionPanelObject3D as Object3D | undefined;
    if (obj) obj.visible = false;
  }

  private getXrActionDoc(): UIKitDocument | null {
    for (const entity of this.queries.xrActionPanel.entities) {
      const doc = PanelDocument.data.document[entity.index] as UIKitDocument | undefined;
      if (doc) return doc;
    }
    return null;
  }

  private setXrActionCopy(doc: UIKitDocument, text: string) {
    doc.getElementById("xr-action-copy")?.setProperties({ text } as any);
  }
}
