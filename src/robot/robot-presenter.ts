/**
 * RobotPresenter
 * ==============
 * Generic presentation layer for the robot assistant.
 *
 * This is NOT a text-bubble system. It is a structured output channel
 * that accepts RobotOutputEvents and routes them to the appropriate
 * presentation layer (3D visual state, bubble panel, overlay, future AR
 * annotations, etc).
 *
 * The presenter is intentionally decoupled from AssistantService.
 * It receives structured events and decides how to render them.
 * This means the same presenter can be driven by AI output, scripted
 * animations, or any other source.
 *
 * Output channels currently supported:
 *   - Visual state machine (idle / listening / thinking / speaking)
 *   - Speech bubble panel text (truncated, clean)
 *   - Overlay console (full response text)
 *
 * Adding a future channel (e.g. highlight annotation, diagram panel):
 *   1. Add a new handler field to RobotPresenter
 *   2. Route the relevant event type to it in present()
 */

import type { Object3D } from "@iwsdk/core";
import type { UIKitDocument } from "@iwsdk/core";

// ─── Visual States ────────────────────────────────────────────────────────────

/**
 * The robot's visual state drives emissive intensity, eye scale, and bob speed.
 * Systems read this and lerp toward target values each frame.
 */
export type RobotVisualState =
  | "idle"         // resting, dim glow, eyes closed
  | "listening"    // mic active, soft pulsing cyan
  | "thinking"     // waiting for AI, slower breathing bob
  | "speaking";    // AI response playing, full glow + fast bob

// ─── Output Event ─────────────────────────────────────────────────────────────

/**
 * Structured events that can be sent to the presenter.
 * Each event represents something that should be communicated to the user
 * through any combination of output channels.
 */
export type RobotOutputEvent =
  | { type: "state_change"; state: RobotVisualState }
  | { type: "message"; text: string }           // full assembled message to show
  | { type: "stream_token"; text: string }      // incremental token (for live streaming)
  | { type: "clear" }                           // clear any displayed content
  | { type: "action_feedback"; actionName: string } // brief confirmation an action fired
  | { type: "highlight"; componentId: string }  // highlight a machine component by id
  | { type: "highlight_clear" };                // remove all active highlights

// ─── Output Channel Interfaces ────────────────────────────────────────────────

/** Anything that can receive visual state changes */
export interface VisualStateChannel {
  setState(state: RobotVisualState): void;
}

/** Anything that can display text content */
export interface TextChannel {
  showMessage(text: string): void;
  showToken(token: string): void;
  clear(): void;
}

/** Anything that can highlight / unhighlight machine components */
export interface HighlightChannel {
  highlight(componentId: string): void;
  clearAll(): void;
}

// ─── RobotPresenter ───────────────────────────────────────────────────────────

export class RobotPresenter {
  private visualChannels: VisualStateChannel[] = [];
  private textChannels: TextChannel[] = [];
  private highlightChannels: HighlightChannel[] = [];
  private streamBuffer = "";

  /** The current state — readable externally for debugging */
  currentState: RobotVisualState = "idle";

  /** Register a visual state channel (e.g. the robot 3D visual system) */
  addVisualChannel(channel: VisualStateChannel): void {
    this.visualChannels.push(channel);
  }

  /** Register a text output channel (e.g. bubble panel, overlay console) */
  addTextChannel(channel: TextChannel): void {
    this.textChannels.push(channel);
  }

  /** Register a highlight channel (e.g. ExploreSystem) */
  addHighlightChannel(channel: HighlightChannel): void {
    this.highlightChannels.push(channel);
  }

  /** Route a structured output event to all registered channels */
  present(event: RobotOutputEvent): void {
    switch (event.type) {
      case "state_change":
        this.currentState = event.state;
        for (const ch of this.visualChannels) ch.setState(event.state);
        break;

      case "message":
        this.streamBuffer = "";
        for (const ch of this.textChannels) ch.showMessage(event.text);
        break;

      case "stream_token":
        this.streamBuffer += event.text;
        for (const ch of this.textChannels) ch.showToken(event.text);
        break;

      case "clear":
        this.streamBuffer = "";
        for (const ch of this.textChannels) ch.clear();
        break;

      case "action_feedback":
        // Short confirmation text — shown briefly, not stored in history
        for (const ch of this.textChannels) {
          ch.showMessage(`→ ${event.actionName.toLowerCase().replace(/_/g, " ")}`);
        }
        break;

      case "highlight":
        for (const ch of this.highlightChannels) ch.highlight(event.componentId);
        break;

      case "highlight_clear":
        for (const ch of this.highlightChannels) ch.clearAll();
        break;
    }
  }
}

// ─── Built-in Channel Implementations ────────────────────────────────────────

/** Max characters to display in the in-world speech bubble */
const BUBBLE_MAX_CHARS = 320;

/**
 * BubblePanelChannel
 * Updates the robot's in-world PanelUI speech bubble text node.
 * Handles show/hide timing so the bubble auto-closes after inactivity.
 */
export class BubblePanelChannel implements TextChannel {
  private bubbleObject: Object3D | null = null;
  private textNodeId: string;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private getDoc: () => UIKitDocument | null;

  constructor(opts: {
    bubbleObject: Object3D | null;
    textNodeId: string;
    getDoc: () => UIKitDocument | null;
  }) {
    this.bubbleObject = opts.bubbleObject;
    this.textNodeId = opts.textNodeId;
    this.getDoc = opts.getDoc;
  }

  showMessage(text: string): void {
    this.show(truncateForBubble(text));
  }

  showToken(_token: string): void {
    // For streaming: accumulate tokens and update bubble live.
    // Called via stream_token events — the presenter's streamBuffer holds the
    // full accumulated text, but here we only have the new chunk.
    // We just let the message event at end-of-stream do the final bubble update,
    // to avoid excessive panel repaints during streaming.
  }

  clear(): void {
    this.setNodeText("");
    this.scheduleHide(0);
  }

  private show(text: string): void {
    if (this.bubbleObject) this.bubbleObject.visible = true;
    this.setNodeText(text);
    this.scheduleHide(10_000);
  }

  private setNodeText(text: string): void {
    const doc = this.getDoc();
    if (!doc) return;
    const node = doc.getElementById(this.textNodeId);
    if (!node) return;
    node.setProperties({ text } as any);
  }

  private scheduleHide(delayMs: number): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    if (delayMs <= 0) {
      if (this.bubbleObject) this.bubbleObject.visible = false;
      return;
    }
    this.hideTimer = setTimeout(() => {
      if (this.bubbleObject) this.bubbleObject.visible = false;
    }, delayMs);
  }
}

/**
 * OverlayTextChannel
 * Dispatches text events to the screen overlay via the window event bus.
 * The overlay HTML/JS listens for these and renders them however it wants.
 */
export class OverlayTextChannel implements TextChannel {
  showMessage(text: string): void {
    window.dispatchEvent(
      new CustomEvent("assistant:response", { detail: { text } }),
    );
  }

  showToken(token: string): void {
    window.dispatchEvent(
      new CustomEvent("assistant:token", { detail: { token } }),
    );
  }

  clear(): void {
    window.dispatchEvent(new CustomEvent("assistant:clear"));
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Truncates a response for the in-world bubble.
 * Tries to cut at a sentence boundary, falls back to word boundary.
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')   // bold
    .replace(/\*(.+?)\*/g, '$1')        // italic
    .replace(/_{1,2}(.+?)_{1,2}/g, '$1') // underscore bold/italic
    .replace(/^#{1,6}\s+/gm, '')        // headings
    .replace(/^[-*+]\s+/gm, '• ')       // unordered list
    .replace(/^\d+\.\s+/gm, '')         // ordered list
    .replace(/`(.+?)`/g, '$1')          // inline code
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links
    .trim();
}

/**
 * Sanitizes text for the 3D XR bubble panel.
 * The XR font only covers basic Latin (ASCII + common Western characters).
 * Characters outside this range render as □ boxes.
 *
 * Strategy:
 *  - Replace Unicode punctuation with ASCII equivalents
 *  - Replace Arabic / RTL text blocks with a short "[AR]" label so the
 *    bubble doesn't show a wall of boxes. The full Arabic text is still
 *    displayed correctly in the HTML overlay.
 *  - Strip any remaining non-printable / non-Latin Unicode
 */
function sanitizeForBubble(text: string): string {
  return text
    // 1. Normalize accented Latin characters → base letter
    // NFD decomposes è→e+combining_grave, then we strip all combining marks.
    // This fixes Italian (è,ò,à,ù), French (é,ê,ç), German (ö,ü,ä→o,u,a),
    // Spanish (ñ→n), Portuguese, etc. — all without missing-glyph boxes.
    .normalize("NFD")
    .replace(/[\u0300-\u036F]/g, "")   // strip all combining diacritics
    // 2. Common Unicode punctuation → ASCII equivalents
    .replace(/\u2026/g, "...")          // … → ...
    .replace(/[\u2018\u2019]/g, "'")   // '' → '
    .replace(/[\u201C\u201D]/g, '"')   // "" → "
    .replace(/\u2013/g, "-")           // – → -
    .replace(/\u2014/g, "--")          // — → --
    .replace(/\u00B7/g, ".")           // · → .
    .replace(/\u2022/g, "*")           // • → *
    // 3. Arabic / Hebrew / other RTL scripts → compact placeholder
    // Full text is still displayed correctly in the HTML overlay.
    .replace(/[\u0600-\u06FF\u0590-\u05FF\u0750-\u077F\u08A0-\u08FF]+(\s+[\u0600-\u06FF\u0590-\u05FF\u0750-\u077F\u08A0-\u08FF]+)*/g, "[AR]")
    // 4. Chinese / Japanese / Korean → compact placeholder
    .replace(/[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]+/g, "[CJK]")
    // 5. Strip any remaining characters outside printable ASCII + Latin Extended
    .replace(/[^\x20-\x7E\xC0-\u024F]/g, "")
    // 6. Collapse extra whitespace
    .replace(/\s{2,}/g, " ")
    .trim();
}

function truncateForBubble(text: string): string {
  const clean = sanitizeForBubble(stripMarkdown(text));

  if (clean.length <= BUBBLE_MAX_CHARS) return clean;

  const sentenceEnd = clean.lastIndexOf(".", BUBBLE_MAX_CHARS);
  if (sentenceEnd > 40) return clean.slice(0, sentenceEnd + 1);

  const wordEnd = clean.lastIndexOf(" ", BUBBLE_MAX_CHARS);
  if (wordEnd > 40) return clean.slice(0, wordEnd) + "...";

  return clean.slice(0, BUBBLE_MAX_CHARS) + "...";
}
