/**
 * AssistantOverlay
 * ================
 * Screen-space XR console for the assistant.
 *
 * Architecture
 * ────────────
 * LAYER 1 — ScreenSpace PanelUI  (inside the XR view, visible in headset)
 *   A `PanelUI` entity with `ScreenSpace` pins the console panel to the
 *   bottom-left of the camera view in XR. It shows the streaming response
 *   text and the current assistant state. This is what the user sees in the
 *   headset. It also has a mic button that toggles voice input.
 *
 * LAYER 2 — DOM textarea strip  (browser only, for dev-time typing)
 *   A minimal HTML strip with a textarea + send button rendered at the very
 *   bottom of the browser viewport. This is the developer's text input path
 *   while building and testing. It is NOT visible inside the XR headset
 *   (the 2D DOM layer disappears when XR is presenting) — which is fine,
 *   because in XR voice is the primary input.
 *   Toggle: backtick (`) key OR clicking the toggle button.
 *
 * Event bus (window CustomEvents)
 * ────────────────────────────────
 *   Receives:  assistant:token    { token: string }
 *              assistant:response { text: string }
 *              assistant:state    { state: string }
 *              assistant:clear
 *   Fires:     assistant:input    { text: string }
 *              assistant:mic_toggle
 */

import {
  PanelUI,
  PanelDocument,
  createSystem,
  eq,
} from "@iwsdk/core";
import type { UIKitDocument } from "@iwsdk/core";

// ─── Status dot colors per state ─────────────────────────────────────────────

const DOT_COLORS: Record<string, string> = {
  thinking: "#4a90ff",
  speaking: "#00d4ff",
  listening: "#4cff91",
  error: "#ff4f4f",
  idle: "rgba(255,255,255,0.3)",
};

const STATUS_LABELS: Record<string, string> = {
  thinking: "Thinking…",
  speaking: "Speaking",
  listening: "Listening…",
  error: "Error",
  idle: "Ready",
};

// ─── ScreenSpace Console System ───────────────────────────────────────────────

/**
 * Registers and drives the ScreenSpace assistant console panel.
 * Created and registered from index.ts after world is ready.
 */
export class AssistantConsoleSystem extends createSystem({
  consolePanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/assistant-console.json")],
  },
}) {
  private doc: UIKitDocument | null = null;
  private wired = false;
  private accumBuffer = "";

  // Bound event handlers — kept for cleanup
  private onToken!: (e: Event) => void;
  private onResponse!: (e: Event) => void;
  private onState!: (e: Event) => void;
  private onClear!: (e: Event) => void;

  init() {
    // Bind handlers here — constructors aren't safe in IWSDK systems
    this.onToken = (e) => this.handleToken(e as CustomEvent);
    this.onResponse = (e) => this.handleResponse(e as CustomEvent);
    this.onState = (e) => this.handleState(e as CustomEvent);
    this.onClear = () => this.handleClear();

    window.addEventListener("assistant:token", this.onToken);
    window.addEventListener("assistant:response", this.onResponse);
    window.addEventListener("assistant:state", this.onState);
    window.addEventListener("assistant:clear", this.onClear);

    // Listen for controller grip events to show visual feedback
    window.addEventListener('controller:grip_pressed', () => this.showGripFeedback());
    window.addEventListener('controller:grip_released', () => this.hideGripFeedback());

    this.cleanupFuncs.push(() => {
      window.removeEventListener("assistant:token", this.onToken);
      window.removeEventListener("assistant:response", this.onResponse);
      window.removeEventListener("assistant:state", this.onState);
      window.removeEventListener("assistant:clear", this.onClear);
    });

    this.queries.consolePanel.subscribe("qualify", () => this.tryWire());
  }

  update() {
    if (!this.wired) this.tryWire();
  }

  // ── Panel wiring ────────────────────────────────────────────────────────────

  private tryWire() {
    for (const entity of this.queries.consolePanel.entities) {
      const doc = PanelDocument.data.document[entity.index] as UIKitDocument | undefined;
      if (!doc) continue;
      this.doc = doc;
      this.wireMicButton(doc);
      this.wired = true;
      break;
    }
  }

  private wireMicButton(doc: UIKitDocument) {
    doc.getElementById("console-mic-btn")?.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("assistant:mic_toggle"));
    });
  }

  // ── Window event handlers ──────────────────────────────────────────────────

  private handleToken(e: CustomEvent) {
    this.accumBuffer += (e.detail as any).token ?? "";
    this.setResponseText(this.accumBuffer);
  }

  private handleResponse(e: CustomEvent) {
    const text = (e.detail as any).text ?? "";
    this.accumBuffer = text;
    this.setResponseText(text);
  }

  private handleState(e: CustomEvent) {
    const state: string = (e.detail as any).state ?? "idle";
    if (!this.doc) return;

    const dotColor = DOT_COLORS[state] ?? DOT_COLORS.idle;
    const statusText = STATUS_LABELS[state] ?? "Ready";

    this.doc.getElementById("console-dot")?.setProperties({
      backgroundColor: dotColor,
    } as any);
    this.doc.getElementById("console-status")?.setProperties({
      text: statusText,
    } as any);
  }

  private handleClear() {
    this.accumBuffer = "";
    this.setResponseText("Tap the robot or speak to begin.");
  }

  private setResponseText(text: string) {
    if (!this.doc) return;
    this.doc.getElementById("console-response-text")?.setProperties({
      text: truncate(text, 220),
    } as any);
  }

  private showGripFeedback() {
    if (!this.doc) return;
    // Pulse the mic button to show grip is held
    this.doc.getElementById("console-mic-btn")?.setProperties({
      backgroundColor: "rgba(76,255,145,0.3)",
      borderColor: "rgba(76,255,145,0.8)",
    } as any);
  }

  private hideGripFeedback() {
    if (!this.doc) return;
    // Reset mic button appearance
    this.doc.getElementById("console-mic-btn")?.setProperties({
      backgroundColor: "rgba(255,255,255,0.1)",
      borderColor: "rgba(255,255,255,0.25)",
    } as any);
  }
}

// ─── Dev Textarea Strip ───────────────────────────────────────────────────────

/**
 * Minimal DOM textarea for dev-time text input.
 * Visible only in the browser (2D DOM layer). Disappears when XR presents —
 * at which point the ScreenSpace panel above and voice input take over.
 */
export class DevTextInput {
  private container: HTMLElement | null = null;
  private textarea: HTMLTextAreaElement | null = null;
  private toggleBtn: HTMLButtonElement | null = null;
  private visible = false;
  private attachedImage: File | null = null;

  private boundKeydown = this.handleKeydown.bind(this);
  private boundMicToggle = () => {
    // Visual feedback when mic is toggled from the XR panel
    this.toggleBtn?.classList.toggle("mic-active");
  };

  mount(): void {
    if (this.container) return;
    this.injectStyles();
    this.buildDOM();
    window.addEventListener("keydown", this.boundKeydown);
    window.addEventListener("assistant:mic_toggle", this.boundMicToggle);
    // Pen button in toolbar opens the input strip
    window.addEventListener("assistant:open_input", () => this.show());
  }

  destroy(): void {
    this.container?.remove();
    this.toggleBtn?.remove();
    window.removeEventListener("keydown", this.boundKeydown);
    window.removeEventListener("assistant:mic_toggle", this.boundMicToggle);
  }

  // ── DOM ──────────────────────────────────────────────────────────────────────

  private buildDOM(): void {
    // Toggle button — sleek modern floating badge
    this.toggleBtn = document.createElement("button");
    this.toggleBtn.id = "dev-input-toggle";
    this.toggleBtn.title = "Dev chat  (` key)";
    this.toggleBtn.setAttribute("aria-label", "Toggle dev chat");
    this.toggleBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
    `;
    this.toggleBtn.addEventListener("click", () => this.toggle());
    document.body.appendChild(this.toggleBtn);

    // Sidebar Console
    this.container = document.createElement("div");
    this.container.id = "dev-sidebar";
    this.container.setAttribute("aria-hidden", "true");
    this.container.innerHTML = `
      <div id="dev-sidebar-header">
        <div class="header-title">
          <span class="pulse-indicator"></span>
          <span>Assistant Environment</span>
        </div>
        <button id="dev-sidebar-close" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      <div id="dev-lang-selector-row">
        <label for="dev-lang-select">System Locale</label>
        <div class="select-wrapper">
          <select id="dev-lang-select">
            <option value="en">English (US)</option>
            <option value="it">Italiano (IT)</option>
            <option value="ar">العربية (AR)</option>
            <option value="fr">Français (FR)</option>
            <option value="es">Español (ES)</option>
          </select>
        </div>
      </div>
      <div id="dev-history"></div>
      <div id="dev-input-row">
        <div id="dev-image-preview" style="display: none;">
          <img id="dev-image-preview-img" alt="preview" />
          <span id="dev-image-preview-name"></span>
          <button id="dev-image-preview-remove" aria-label="Remove image">✕</button>
        </div>
        
        <textarea
          id="dev-textarea"
          placeholder="Message assistant..."
          rows="1"
          autocomplete="off"
          spellcheck="false"
        ></textarea>
        
        <div id="dev-action-grid">
          <div class="left-actions">
            <button id="dev-stop-btn" aria-label="Stop conversation" title="Stop">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"></rect></svg>
            </button>
            
            <div id="dev-media-tools">
              <label id="dev-audio-label" title="Upload audio" aria-label="Upload audio file">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v1a7 7 0 0 1-14 0v-1"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                <input id="dev-audio-input" type="file" accept="audio/*" aria-label="Audio file" />
              </label>
              <label id="dev-image-label" title="Attach image" aria-label="Upload image file">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                <input id="dev-image-input" type="file" accept="image/*" aria-label="Image file" />
              </label>
            </div>
          </div>
          
          <button id="dev-send-btn">
            Send
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(this.container);

    this.textarea = this.container.querySelector("#dev-textarea");

    this.container.querySelector("#dev-sidebar-close")
      ?.addEventListener("click", () => this.hide());

    // Auto-resize textarea to feel more native
    this.textarea?.addEventListener("input", () => {
      if (this.textarea) {
        this.textarea.style.height = 'auto';
        this.textarea.style.height = Math.min(this.textarea.scrollHeight, 120) + 'px';
      }
    });

    this.textarea?.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.submit();
        if (this.textarea) this.textarea.style.height = 'auto'; // reset height on send
      }
    });

    this.container.querySelector("#dev-stop-btn")
      ?.addEventListener("click", () => {
        window.dispatchEvent(new CustomEvent("assistant:stop"));
      });

    // --- LANGUAGE DROPDOWN LOGIC FIXED HERE ---
    const langSelect = this.container.querySelector("#dev-lang-select") as HTMLSelectElement;

    // 1. Check local storage on load to persist visual state
    const savedLang = localStorage.getItem("dev-assistant-lang");
    if (savedLang && langSelect) {
      langSelect.value = savedLang;
    }

    langSelect?.addEventListener("change", () => {
      const lang = langSelect.value;
      // 2. Save choice to local storage so it survives page reloads
      localStorage.setItem("dev-assistant-lang", lang);

      window.dispatchEvent(new CustomEvent("assistant:set_language", { detail: { lang } }));
      this.appendMessage("ai", `Language set to: ${lang.toUpperCase()}. I will now strictly respond in this language.`);
    });
    // ------------------------------------------

    this.container.querySelector("#dev-send-btn")
      ?.addEventListener("click", () => {
        this.submit();
        if (this.textarea) this.textarea.style.height = 'auto';
      });

    const audioInput = this.container.querySelector("#dev-audio-input") as HTMLInputElement;
    audioInput?.addEventListener("change", () => {
      const file = audioInput.files?.[0];
      if (!file) return;
      audioInput.value = "";
      this.appendMessage("user", `🎙 ${file.name}`);
      window.dispatchEvent(new CustomEvent("assistant:audio_file", { detail: { file } }));
    });

    const imageInput = this.container.querySelector("#dev-image-input") as HTMLInputElement;
    imageInput?.addEventListener("change", this.handleImageSelect.bind(this));

    const removeBtn = this.container.querySelector("#dev-image-preview-remove");
    removeBtn?.addEventListener("click", () => this.clearAttachment());

    window.addEventListener("assistant:input", (e: Event) => {
      const text = ((e as CustomEvent).detail as any).text;
      this.appendMessage("user", text);
    });
    window.addEventListener("assistant:response", (e: Event) => {
      const text = ((e as CustomEvent).detail as any).text;
      this.appendMessage("ai", text);
    });
  }

  private appendMessage(role: "user" | "ai", text: string): void {
    const history = document.getElementById("dev-history");
    if (!history) return;

    const bubble = document.createElement("div");
    bubble.className = `dev-msg dev-msg-${role}`;
    bubble.innerHTML = `
      <div class="dev-msg-text">${text.replace(/</g, "&lt;").replace(/\n/g, "<br>")}</div>
      <button class="dev-msg-copy" title="Copy">⎘</button>
    `;
    bubble.querySelector(".dev-msg-copy")!.addEventListener("click", () => {
      navigator.clipboard.writeText(text).then(() => {
        const btn = bubble.querySelector(".dev-msg-copy") as HTMLButtonElement;
        btn.textContent = "✓";
        setTimeout(() => { btn.textContent = "⎘"; }, 1500);
      });
    });
    history.appendChild(bubble);
    history.scrollTop = history.scrollHeight;
  }

  private injectStyles(): void {
    if (document.getElementById("dev-input-styles")) return;
    const s = document.createElement("style");
    s.id = "dev-input-styles";
    s.textContent = `
      #dev-input-toggle {
        position: fixed;
        bottom: 24px; /* Moved to bottom for easier access */
        right: 24px;
        z-index: 9999;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: #0f111a;
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #94a3b8;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(12px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1);
        transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      #dev-input-toggle:hover {
        color: #fff;
        background: #1e2136;
        transform: scale(1.05);
      }
      #dev-input-toggle.is-open { 
        right: 384px; 
        background: #6366f1; 
        color: #fff; 
        border-color: transparent;
        box-shadow: 0 8px 24px rgba(99, 102, 241, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.3);
      }
      #dev-input-toggle.mic-active { 
        background: #10b981; 
        color: #fff; 
        box-shadow: 0 0 20px rgba(16, 185, 129, 0.4); 
      }

      #dev-sidebar {
        position: fixed;
        top: 16px;
        right: -380px;
        width: 352px;
        height: calc(100vh - 32px);
        z-index: 9998;
        display: flex;
        flex-direction: column;
        background: rgba(13, 15, 23, 0.85);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        box-shadow: -10px 0 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05);
        transition: right 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        overflow: hidden;
      }
      #dev-sidebar.is-visible { right: 16px; }

      #dev-sidebar-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0) 100%);
      }
      .header-title {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: -0.01em;
        color: #f8fafc;
      }
      .pulse-indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #10b981;
        box-shadow: 0 0 10px rgba(16, 185, 129, 0.6);
      }
      #dev-sidebar-close {
        background: transparent;
        border: none;
        color: #64748b;
        cursor: pointer;
        padding: 4px;
        border-radius: 6px;
        transition: all 0.2s;
      }
      #dev-sidebar-close:hover { color: #f8fafc; background: rgba(255, 255, 255, 0.1); }

      #dev-lang-selector-row {
        padding: 12px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 12px;
        color: #94a3b8;
        font-weight: 500;
        border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      }
      .select-wrapper {
        position: relative;
      }
      .select-wrapper::after {
        content: "▾";
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        pointer-events: none;
        color: #94a3b8;
        font-size: 10px;
      }
      #dev-lang-select {
        appearance: none;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #e2e8f0;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 500;
        padding: 4px 24px 4px 10px;
        outline: none;
        cursor: pointer;
        transition: all 0.2s;
      }
      #dev-lang-select:hover { border-color: rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.06); }
      #dev-lang-select:focus { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2); }

      #dev-history {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        scrollbar-width: none;
      }
      #dev-history::-webkit-scrollbar { display: none; }

      .dev-msg {
        display: flex;
        flex-direction: column;
        max-width: 88%;
        animation: msgFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      @keyframes msgFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      
      .dev-msg-user { align-self: flex-end; }
      .dev-msg-ai   { align-self: flex-start; }

      .dev-msg-text {
        padding: 10px 14px;
        border-radius: 14px;
        font-size: 13.5px;
        line-height: 1.5;
        word-break: break-word;
        white-space: pre-wrap;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
      .dev-msg-user .dev-msg-text {
        background: linear-gradient(180deg, #6366f1 0%, #4f46e5 100%);
        color: #ffffff;
        border-bottom-right-radius: 4px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-top-color: rgba(255, 255, 255, 0.2);
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2), inset 0 1px 0 rgba(255,255,255,0.1);
      }
      .dev-msg-ai .dev-msg-text {
        background: #1e2136;
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: #e2e8f0;
        border-bottom-left-radius: 4px;
      }

      .dev-msg-copy {
        background: none;
        border: none;
        color: #475569;
        font-size: 11px;
        cursor: pointer;
        padding: 4px;
        margin-top: 2px;
        transition: color 0.2s;
        opacity: 0;
      }
      .dev-msg:hover .dev-msg-copy { opacity: 1; }
      .dev-msg-user .dev-msg-copy { align-self: flex-end; }
      .dev-msg-ai   .dev-msg-copy { align-self: flex-start; }
      .dev-msg-copy:hover { color: #94a3b8; }

      #dev-input-row {
        display: flex;
        flex-direction: column;
        padding: 16px;
        background: rgba(10, 11, 18, 0.8);
        border-top: 1px solid rgba(255, 255, 255, 0.06);
      }

      #dev-textarea {
        width: 100%;
        background: #161827;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        color: #f8fafc;
        font-size: 13.5px;
        font-family: inherit;
        line-height: 1.5;
        padding: 12px 14px;
        resize: none;
        outline: none;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        box-sizing: border-box;
        margin-bottom: 12px;
        box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
      }
      #dev-textarea::placeholder { color: #64748b; }
      #dev-textarea:focus {
        border-color: #6366f1;
        background: #1a1d2d;
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15), inset 0 2px 4px rgba(0,0,0,0.2);
      }

      #dev-action-grid {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .left-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      /* AAA Ghost Button */
      #dev-stop-btn {
        background: transparent;
        border: 1px solid transparent;
        border-radius: 8px;
        color: #64748b;
        cursor: pointer;
        padding: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
      }
      #dev-stop-btn:hover { 
        background: rgba(239, 68, 68, 0.1); 
        color: #ef4444; 
      }

      #dev-media-tools {
        display: flex;
        gap: 4px;
      }
      #dev-audio-label, #dev-image-label {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border-radius: 8px;
        cursor: pointer;
        background: transparent;
        border: 1px solid transparent;
        color: #64748b;
        transition: all 0.2s ease;
      }
      #dev-audio-label:hover, #dev-image-label:hover { 
        background: rgba(255, 255, 255, 0.05); 
        color: #e2e8f0; 
      }
      #dev-audio-input, #dev-image-input { display: none; }

      /* AAA Primary Solid Button */
      #dev-send-btn {
        background: linear-gradient(180deg, #6366f1 0%, #4f46e5 100%);
        border: 1px solid transparent;
        border-top-color: rgba(255, 255, 255, 0.2);
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.15);
        border-radius: 10px;
        color: #ffffff;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        padding: 8px 16px;
        display: flex;
        align-items: center;
        gap: 6px;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      #dev-send-btn:hover { 
        background: linear-gradient(180deg, #818cf8 0%, #6366f1 100%);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2);
      }
      #dev-send-btn:active {
        transform: translateY(0);
        box-shadow: 0 1px 2px rgba(0,0,0,0.2), inset 0 2px 4px rgba(0,0,0,0.2);
      }

      #dev-image-preview {
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        padding: 6px;
        margin-bottom: 12px;
      }
      #dev-image-preview-img {
        width: 32px;
        height: 32px;
        object-fit: cover;
        border-radius: 4px;
      }
      #dev-image-preview-name { font-size: 11px; color: #cbd5e1; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      #dev-image-preview-remove { background: none; border: none; color: #64748b; cursor: pointer; padding: 4px 8px; font-size: 14px; border-radius: 4px;}
      #dev-image-preview-remove:hover { color: #f87171; background: rgba(255,255,255,0.05); }
    `;
    document.head.appendChild(s);
  }

  // ── Toggle / Submit ────────────────────────────────────────────────────────

  toggle(): void { this.visible ? this.hide() : this.show(); }

  show(): void {
    this.visible = true;
    this.container?.classList.add("is-visible");
    this.container?.setAttribute("aria-hidden", "false");
    this.toggleBtn?.classList.add("is-open");
    setTimeout(() => this.textarea?.focus(), 320);
  }

  hide(): void {
    this.visible = false;
    this.container?.classList.remove("is-visible");
    this.container?.setAttribute("aria-hidden", "true");
    this.toggleBtn?.classList.remove("is-open");
  }

  private submit(): void {
    if (!this.textarea) return;
    const text = this.textarea.value;
    if (!text.trim() && !this.attachedImage) return;

    this.textarea.value = "";

    if (this.attachedImage) {
      this.appendMessage("user", `🖼 [${this.attachedImage.name}] ${text}`);
      window.dispatchEvent(new CustomEvent("assistant:input_with_image", { detail: { text, file: this.attachedImage } }));

      this.clearAttachment();
    } else {
      window.dispatchEvent(new CustomEvent("assistant:input", { detail: { text } }));
    }
  }

  private clearAttachment(): void {
    this.attachedImage = null;
    const preview = this.container?.querySelector("#dev-image-preview") as HTMLElement;
    const previewImg = this.container?.querySelector("#dev-image-preview-img") as HTMLImageElement;
    const imageLabel = this.container?.querySelector("#dev-image-label") as HTMLElement;
    const imageInput = this.container?.querySelector("#dev-image-input") as HTMLInputElement;

    if (preview && imageLabel && imageInput) {
      preview.style.display = "none";
      if (previewImg.src) URL.revokeObjectURL(previewImg.src);
      previewImg.src = "";
      imageLabel.style.display = "flex";
      imageInput.value = ""; // clear selected file
    }
  }

  private handleImageSelect(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.attachedImage = file;

    const preview = this.container?.querySelector("#dev-image-preview") as HTMLElement;
    const previewImg = this.container?.querySelector("#dev-image-preview-img") as HTMLImageElement;
    const previewName = this.container?.querySelector("#dev-image-preview-name") as HTMLElement;
    const imageLabel = this.container?.querySelector("#dev-image-label") as HTMLElement;

    if (preview && previewImg && previewName && imageLabel) {
      previewImg.src = URL.createObjectURL(file);
      previewName.textContent = file.name;
      preview.style.display = "flex";
      imageLabel.style.display = "none";
    }
  }

  private handleKeydown(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement)?.tagName;
    if (e.key === "`" && tag !== "TEXTAREA" && tag !== "INPUT") {
      e.preventDefault();
      this.toggle();
    }
    if (e.key === "Escape" && this.visible) {
      this.hide();
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.lastIndexOf(" ", max);
  return (cut > max * 0.6 ? text.slice(0, cut) : text.slice(0, max)) + "…";
}
