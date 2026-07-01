/**
 * RobotToolbarSystem
 * ==================
 * Drives the two-part robot toolbar:
 *
 *   toolbarToggle  — always visible ≡ button (robot-toolbar-toggle.json)
 *   toolbarPill    — collapsible vertical pill with Pen/Clock/Settings
 *                    (robot-toolbar-pill.json), hidden by default
 *
 * Settings sub-panel (robot-settings.json) is a third entity toggled by
 * the Settings icon.
 *
 * Button wiring:
 *   ≡ toggle  → show/hide the pill
 *   Pen       → dispatch "assistant:open_input" → DevTextInput shows
 *   Clock     → future feature (no-op)
 *   Settings  → show/hide settings sub-panel
 */

import {
  PanelDocument,
  PanelUI,
  createSystem,
  eq,
  Object3D,
} from "@iwsdk/core";
import type { UIKitDocument } from "@iwsdk/core";

export class RobotToolbarSystem extends createSystem({
  toggle: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/robot-toolbar-toggle.json")],
  },
  pill: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/robot-toolbar-pill.json")],
  },
  settings: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/robot-settings.json")],
  },
}) {
  private toggleWired = false;
  private pillWired = false;
  private settingsWired = false;

  private pillVisible = false;
  private settingsVisible = false;

  init() {
    this.queries.toggle.subscribe("qualify",   () => this.tryWireToggle());
    this.queries.pill.subscribe("qualify",     () => this.tryWirePill());
    this.queries.settings.subscribe("qualify", () => this.tryWireSettings());
  }

  update() {
    if (!this.toggleWired)   this.tryWireToggle();
    if (!this.pillWired)     this.tryWirePill();
    if (!this.settingsWired) this.tryWireSettings();
  }

  // ── Toggle button ──────────────────────────────────────────────────────────

  private tryWireToggle() {
    for (const entity of this.queries.toggle.entities) {
      const doc = PanelDocument.data.document[entity.index] as UIKitDocument | undefined;
      if (!doc) continue;

      const toggleBtn = doc.getElementById("toolbar-toggle");
      const toggleIcon = doc.getElementById("toolbar-toggle-icon");

      toggleBtn?.addEventListener("pointerenter", () => {
        toggleIcon?.setProperties({ color: "rgba(244, 244, 244, 1)" } as any);
      });
      toggleBtn?.addEventListener("pointerleave", () => {
        toggleIcon?.setProperties({ color: "rgba(25, 25, 25, 0.96)" } as any);
      });

      toggleBtn?.addEventListener("click", () => {
        this.pillVisible = !this.pillVisible;
        const pillObj = (this.world.globals as any).robotToolbarPillObject3D as Object3D | undefined;
        if (pillObj) pillObj.visible = this.pillVisible;
        // Close settings if pill closes
        if (!this.pillVisible) this.closeSettings();
      });

      this.toggleWired = true;
      break;
    }
  }

  // ── Pill (Pen / Clock / Settings) ─────────────────────────────────────────

  private tryWirePill() {
    for (const entity of this.queries.pill.entities) {
      const doc = PanelDocument.data.document[entity.index] as UIKitDocument | undefined;
      if (!doc) continue;

      doc.getElementById("toolbar-btn-stop")?.addEventListener("click", () => {
        window.dispatchEvent(new CustomEvent("assistant:stop"));
        this.closePill();
      });

      doc.getElementById("toolbar-btn-pen")?.addEventListener("click", () => {
        window.dispatchEvent(new CustomEvent("assistant:open_input"));
        this.closePill();
      });

      doc.getElementById("toolbar-btn-clock")?.addEventListener("click", () => {
        // Future: conversation summary
        console.log("[RobotToolbar] History — coming soon");
      });

      doc.getElementById("toolbar-btn-settings")?.addEventListener("click", () => {
        this.settingsVisible = !this.settingsVisible;
        const settingsObj = (this.world.globals as any).robotSettingsPanelObject3D as Object3D | undefined;
        if (settingsObj) settingsObj.visible = this.settingsVisible;
        this.closePill();
      });

      this.pillWired = true;
      break;
    }
  }

  // ── Settings panel ─────────────────────────────────────────────────────────

  private tryWireSettings() {
    for (const entity of this.queries.settings.entities) {
      const doc = PanelDocument.data.document[entity.index] as UIKitDocument | undefined;
      if (!doc) continue;

      const states = {
        voice: true,
        autoListen: false,
        subtitles: true,
      };

      const wire = (id: string, key: keyof typeof states) => {
        doc.getElementById(id)?.addEventListener("click", () => {
          states[key] = !states[key];
          const on = states[key];
          doc.getElementById(id)?.setProperties({
            backgroundColor: on ? "rgba(0,122,255,1)" : "rgba(200,200,200,0.9)",
          } as any);
          window.dispatchEvent(new CustomEvent("assistant:setting", {
            detail: { key, value: on },
          }));
        });
      };

      wire("setting-voice",       "voice");
      wire("setting-autolisten",  "autoListen");
      wire("setting-subtitles",   "subtitles");

      // Wire talk mode buttons
      const talkModes = ['hold', 'toggle', 'always'] as const;
      let activeTalkMode: 'hold' | 'toggle' | 'always' = 'hold';

      const updateTalkModeUI = (newMode: typeof activeTalkMode) => {
        talkModes.forEach(mode => {
          const btnId = `talk-mode-${mode}`;
          const isActive = mode === newMode;
          doc.getElementById(btnId)?.setProperties({
            class: isActive ? 'talk-mode-btn-active' : 'talk-mode-btn',
          } as any);
        });
      };

      doc.getElementById('talk-mode-hold')?.addEventListener('click', () => {
        activeTalkMode = 'hold';
        updateTalkModeUI('hold');
        window.dispatchEvent(new CustomEvent('assistant:talk_mode', {
          detail: { mode: 'hold' },
        }));
      });

      doc.getElementById('talk-mode-toggle')?.addEventListener('click', () => {
        activeTalkMode = 'toggle';
        updateTalkModeUI('toggle');
        window.dispatchEvent(new CustomEvent('assistant:talk_mode', {
          detail: { mode: 'toggle' },
        }));
      });

      doc.getElementById('talk-mode-always')?.addEventListener('click', () => {
        activeTalkMode = 'always';
        updateTalkModeUI('always');
        window.dispatchEvent(new CustomEvent('assistant:talk_mode', {
          detail: { mode: 'always_on' },
        }));
      });

      this.settingsWired = true;
      break;
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private closePill() {
    this.pillVisible = false;
    const obj = (this.world.globals as any).robotToolbarPillObject3D as Object3D | undefined;
    if (obj) obj.visible = false;
  }

  private closeSettings() {
    this.settingsVisible = false;
    const obj = (this.world.globals as any).robotSettingsPanelObject3D as Object3D | undefined;
    if (obj) obj.visible = false;
  }
}
