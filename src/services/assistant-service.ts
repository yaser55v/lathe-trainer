/**
 * AssistantService
 * ================
 * Core AI layer for the XR Digital Twin Assistant.
 *
 * This is a plain TypeScript class — NOT an ECS system.
 * It owns: API streaming, conversation history, action interception,
 * voice input, and TTS output.
 *
 * It emits structured AssistantEvents that any subscriber (ECS system,
 * overlay, robot presenter) can listen to via the event bus.
 *
 * SceneContext is injected live at request time — any system can update
 * world.globals.sceneContext and it will be included in the next request.
 */

import { AssistantContext } from "./assistant-context";
import type { SceneContext } from "./scene-context";
import { HOW_IT_WORKS_DEMO, getDemoForLanguage, runDemo } from "../machine/machine-demos";
import type { DemoCallbacks } from "../machine/machine-demos";
import { SupportedLang } from "../skills/learner-memory-skill";

// ─── Constants ───────────────────────────────────────────────────────────────

const NVIDIA_ENDPOINT = "/v1/chat/completions";
const MODEL_ID = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";

const MODEL_PARAMS = {
  temperature: 1,
  top_p: 0.95,
  max_tokens: 8192,
  reasoning_budget: 8192,
  chat_template_kwargs: { enable_thinking: true },
} as const;

/**
 * Matches [ACTION:TOKEN_NAME] tokens in text.
 * Always construct fresh — never use a /g regex as a module-level constant
 * because the stateful lastIndex causes missed matches on repeated calls.
 */
function makeActionRE(): RegExp {
  return /\[ACTION:([A-Z0-9_]+)\]/g;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Structured event types emitted by AssistantService */
export type AssistantEvent =
  | { type: "thinking" }                        // waiting for first token
  | { type: "token"; text: string }             // visible streamed text chunk
  | { type: "response"; text: string }          // full response assembled
  | { type: "action"; name: string }            // action token intercepted
  | { type: "speaking"; text: string }          // TTS started
  | { type: "speaking_end" }                    // TTS finished
  | { type: "listening_start" }                 // microphone active
  | { type: "listening_end" }                   // microphone stopped
  | { type: "listening_auto_stop" }             // 30s limit reached
  | { type: "error"; message: string }          // something went wrong
  | { type: "idle" };                           // back to waiting for input

export type AssistantEventHandler = (event: AssistantEvent) => void;

// ─── AssistantService ─────────────────────────────────────────────────────────

export class AssistantService {
  private readonly apiKey: string;
  private readonly history: ChatMessage[] = [];
  private readonly listeners: AssistantEventHandler[] = [];
  private readonly context: AssistantContext;

  private abortController: AbortController | null = null;
  private voiceInput: VoiceInputController | null = null;
  private tts: NativeTTSController;
  private cancelDemo: (() => void) | null = null;
  demoCallbacks: DemoCallbacks | null = null;
  private screenshotService: any = null;

  constructor(opts: {
    apiKey: string;
    knowledgeBase: string;
    sceneContext: SceneContext;
    screenshotService?: any;
  }) {
    this.apiKey = opts.apiKey;
    this.screenshotService = opts.screenshotService ?? null;
    this.context = new AssistantContext({
      knowledgeBase: opts.knowledgeBase,
      sceneContext: opts.sceneContext,
    });
    this.tts = new NativeTTSController(
      () => this.emit({ type: "speaking_end" }),
      () => this.emit({ type: "idle" }),
    );

    // Wire voice input if browser supports it
    this.voiceInput = new VoiceInputController({
      onStart: () => this.emit({ type: "listening_start" }),
      onResult: (audioBlob) => this.sendAudio(audioBlob),
      onEnd: () => this.emit({ type: "listening_end" }),
      onError: (err) => {
        // "not-allowed" means mic permission denied — don't treat as a hard error
        if (err === "not-allowed" || err === "permission-denied") {
          console.warn("[AssistantService] Microphone permission denied. Voice input disabled.");
          this.emit({ type: "listening_end" });
        } else {
          this.emit({ type: "error", message: `Voice error: ${err}` });
        }
      },
      onAutoStop: () => {
        console.warn("[AssistantService] Recording reached 30s limit.");
        this.emit({ type: "listening_auto_stop" });
      }
    });

    window.addEventListener("assistant:set_language", (e: any) => {
      if (e.detail?.lang) {
        this.context.learnerMemory.setLanguage(e.detail.lang);
      }
    });
  }

  /** 
   * Limit history to prevent "Context Bloat" which causes slow responses.
   * 10 messages = ~5 full turns of conversation.
   */
  private static readonly MAX_HISTORY = 10;

  // ─── Public API ─────────────────────────────────────────────────────────────

  /** Subscribe to assistant events. Returns an unsubscribe function. */
  on(handler: AssistantEventHandler): () => void {
    this.listeners.push(handler);
    return () => {
      const idx = this.listeners.indexOf(handler);
      if (idx !== -1) this.listeners.splice(idx, 1);
    };
  }

  /** Send a text message to the assistant */
  async send(text: string, includeScreenshot = false): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;

    this.stopCurrentStream();

    // Capture screenshot if vision query detected or explicitly requested
    let imageBase64: string | null = null;
    if (includeScreenshot || this.isVisionQuery(trimmed)) {
      if (this.screenshotService) {
        // Instead of programmatic capture (which fails in WebXR),
        // we ask the user to take a native screenshot and share it to the app.
        this.screenshotService.triggerScreenshotGuide();
        
        // We do NOT send the request to the AI right now.
        // We wait for the user to share the screenshot, which will trigger sendImage().
        return;
      }
    }

    this.history.push({ role: "user", content: trimmed });
    this.pruneHistory();

    await this.processRequest(trimmed, imageBase64, null);
  }

  /** Send native audio to the assistant — accepts any Blob or File */
  async sendAudio(audioBlob: Blob): Promise<void> {
    this.stopCurrentStream();

    if (audioBlob.size === 0) {
      this.emit({ type: "error", message: "Audio recording was empty" });
      return;
    }

    // Resample to 16kHz mono WAV — the sample rate Parakeet was trained on.
    // TTS-generated files and most phone recordings are 24kHz or 44.1kHz;
    // sending them at the wrong rate causes the model to hear sped-up speech.
    let processedBlob: Blob;
    try {
      // Add a timeout to ensure audio processing doesn't hang the entire service
      processedBlob = await Promise.race([
        resampleToWav(audioBlob, 16000),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Audio processing timeout")), 8000))
      ]);
    } catch (e) {
      console.warn("[AssistantService] Resampling failed, sending original:", e);
      processedBlob = audioBlob;
    }

    // resampleToWav always returns audio/wav, but fallback to blob type if failed
    const mimeType = processedBlob.type || "audio/wav";

    const audioBase64 = await this.blobToBase64(processedBlob);
    if (!audioBase64) {
      this.emit({ type: "error", message: "Failed to process audio" });
      return;
    }

    console.log(`[AssistantService] Sending audio — original: ${audioBlob.size}B, resampled: ${processedBlob.size}B @ 16kHz wav`);

    // Language-neutral placeholder — an English string here biases the model toward English,
    // even when the user spoke Arabic, French, etc. The neutral tag lets the model's
    // native audio understanding determine the language from the actual audio signal.
    // May be a greeting, casual phrase, or technical question — the GREETING RULE in the
    // system prompt ensures all are handled warmly without asking the user to repeat.
    this.history.push({
      role: "user",
      content: "[VOICE_INPUT — respond to whatever was spoken, including greetings]"
    });
    this.pruneHistory();

    await this.processRequest(null, null, audioBase64, mimeType);
  }

  /** Send an uploaded or shared image to the assistant, optionally with text */
  async sendImage(imageBlob: Blob, text?: string): Promise<void> {
    this.stopCurrentStream();

    if (imageBlob.size === 0) {
      this.emit({ type: "error", message: "Image file was empty" });
      return;
    }

    const imageBase64 = await this.blobToBase64(imageBlob);
    if (!imageBase64) {
      this.emit({ type: "error", message: "Failed to process image" });
      return;
    }

    console.log(`[AssistantService] Sending image — size: ${imageBlob.size}B`);

    const userContent = text?.trim() 
      ? `(User provided an image with the following message: "${text.trim()}". Analyze the image to answer the user.)` 
      : `(User provided an image. Analyze the image to troubleshoot the machine issue or answer the user's implied question.)`;

    this.history.push({
      role: "user",
      content: userContent
    });
    this.pruneHistory();

    await this.processRequest(text?.trim() || null, imageBase64, null);
  }

  private async processRequest(text: string | null, imageBase64: string | null, audioBase64: string | null, audioMime = "audio/wav"): Promise<void> {
    this.emit({ type: "thinking" });

    const messages = this.buildPayload(text, imageBase64, audioBase64, audioMime);
    let rawAccum = "";

    this.abortController = new AbortController();

    try {
      const response = await fetch(NVIDIA_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: this.abortController.signal,
        body: JSON.stringify({
          model: MODEL_ID,
          messages,
          stream: true,
          ...MODEL_PARAMS,
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`API ${response.status}: ${detail}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder("utf-8");
      let sseBuffer = "";
      let inThinkBlock = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine.startsWith("data:")) continue;

          const payload = trimmedLine.slice(5).trim();
          if (payload === "[DONE]") break;

          let parsed: any;
          try {
            parsed = JSON.parse(payload);
          } catch {
            continue;
          }

          const delta = parsed?.choices?.[0]?.delta;
          if (!delta?.content) continue;

          rawAccum += delta.content;

          // Strip <think>...</think> blocks from visible stream
          // Track open/close tags across chunk boundaries
          let chunk = delta.content;

          // If rawAccum looks like it's building a JSON content array, suppress tokens
          // until post-stream where we extract the text cleanly
          const accumTrimmed = rawAccum.trimStart();
          if (accumTrimmed.startsWith("[") || accumTrimmed.startsWith("{")) {
            continue;
          }
          if (inThinkBlock) {
            const closeIdx = chunk.indexOf("</think>");
            if (closeIdx === -1) continue; // still inside think block
            chunk = chunk.slice(closeIdx + 8);
            inThinkBlock = false;
          }
          if (chunk.includes("<think>")) {
            const openIdx = chunk.indexOf("<think>");
            const closeIdx = chunk.indexOf("</think>", openIdx);
            if (closeIdx === -1) {
              chunk = chunk.slice(0, openIdx);
              inThinkBlock = true;
            } else {
              chunk = chunk.slice(0, openIdx) + chunk.slice(closeIdx + 8);
            }
          }

          const visibleChunk = chunk.replace(makeActionRE(), "");
          if (visibleChunk) {
            this.emit({ type: "token", text: visibleChunk });
          }
        }
      }

      // ── Post-stream: derive clean text and fire actions ──────────────────
      // Strip all reasoning blocks from the complete accumulated string.
      // Three cases handled in order:
      //   1. Full block:      <think>...</think>
      //   2. Orphaned open:   <think>...EOF  (no closing tag — strip to end)
      //   3. Orphaned close:  BOF...</think> (no opening tag — strip from start)
      let rawClean = rawAccum
        .replace(/<think>[\s\S]*?<\/think>/g, "") // case 1: full blocks
        .replace(/<think>[\s\S]*$/, "") // case 2: orphaned open tag
        .replace(/^[\s\S]*?<\/think>/, "") // case 3: orphaned close tag
        .trim();

      // Handle model returning structured JSON content array: [{"type":"text","text":"..."}]
      // Also handle Python-style single quotes: [{'type': 'text', 'text': '...'}]
      if (rawClean.startsWith("[") || rawClean.startsWith("{")) {
        let parsedSuccessfully = false;

        // Try standard JSON parsing first
        try {
          const parsed = JSON.parse(rawClean);
          if (Array.isArray(parsed)) {
            rawClean = parsed
              .filter((b: any) => b.type === "text")
              .map((b: any) => b.text ?? "")
              .join("");
            parsedSuccessfully = true;
          } else if (parsed.text) {
            rawClean = parsed.text;
            parsedSuccessfully = true;
          }
        } catch (err) {
          // Parse failed, try to normalize single quotes
          try {
            const normalized = rawClean
              .replace(/'/g, '"')
              .replace(/True/g, 'true')
              .replace(/False/g, 'false')
              .replace(/None/g, 'null');
            const parsed = JSON.parse(normalized);
            if (Array.isArray(parsed)) {
              rawClean = parsed
                .filter((b: any) => b.type === "text")
                .map((b: any) => b.text ?? "")
                .join("");
              parsedSuccessfully = true;
            } else if (parsed.text) {
              rawClean = parsed.text;
              parsedSuccessfully = true;
            }
          } catch (err2) {
            // Ignore and fall back to regex
          }
        }

        // Robust regex fallback if JSON parsing failed (e.g. unescaped nested quotes)
        if (!parsedSuccessfully) {
          const doubleQuoteRegex = /"text"\s*:\s*"((?:[^"\\]|\\.)*)"/gi;
          const singleQuoteRegex = /'text'\s*:\s*'((?:[^'\\]|\\.)*)'/gi;
          const matches: string[] = [];
          let match;

          while ((match = doubleQuoteRegex.exec(rawClean)) !== null) {
            matches.push(match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\'));
          }

          if (matches.length === 0) {
            while ((match = singleQuoteRegex.exec(rawClean)) !== null) {
              matches.push(match[1].replace(/\\'/g, "'").replace(/\\n/g, '\n').replace(/\\\\/g, '\\'));
            }
          }

          if (matches.length > 0) {
            rawClean = matches.join("");
          } else {
            // If no match, try a greedy fallback for the last double-quoted value of "text"
            const greedyMatch = rawClean.match(/"text"\s*:\s*"(.*)"\s*}\s*\]?/s);
            if (greedyMatch) {
              rawClean = greedyMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
            }
          }
        }
      }

      // Strip action tokens to get visible text
      const fullText = rawClean.replace(makeActionRE(), "").trim();

      // Fire each unique action exactly once
      const firedActions = new Set<string>();
      const actionRE = makeActionRE();
      let actionMatch: RegExpExecArray | null;
      while ((actionMatch = actionRE.exec(rawClean)) !== null) {
        const actionName = actionMatch[1];
        if (!firedActions.has(actionName)) {

          // ── Hard safety gate for door actions ──────────────────────────────
          // The AI may incorrectly emit OPEN_DOOR/CLOSE_DOOR when the user
          // claims to have moved ("ok I moved, you can open now"). We re-check
          // the REAL-TIME SafetySkill against live SceneContext here — this is
          // the deterministic enforcement layer that the prompt alone cannot
          // guarantee. If blocked, suppress the action entirely.
          if (actionName === "OPEN_DOOR" || actionName === "CLOSE_DOOR") {
            if (!this.context.canPerformAction(actionName)) {
              console.warn(`[AssistantService] SAFETY GATE: Suppressed ${actionName} — canPerformAction() returned false. User position/state does not allow this action.`);
              firedActions.add(actionName); // mark as seen so we don't retry
              continue; // skip emitting — do not execute the blocked action
            }
          }

          // Visual Bug Fix: Highlights are static world-space objects and do not 
          // follow moving meshes. Force a clear before door actions to prevent 
          // floating outline artifacts.
          if ((actionName === "OPEN_DOOR" || actionName === "CLOSE_DOOR") && !firedActions.has("HIGHLIGHT_CLEAR")) {
            this.emit({ type: "action", name: "HIGHLIGHT_CLEAR" });
            firedActions.add("HIGHLIGHT_CLEAR");
          }

          firedActions.add(actionName);
          this.emit({ type: "action", name: actionName });
        }
      }

      if (fullText) {
        this.history.push({ role: "assistant", content: fullText });
        this.pruneHistory();
        this.emit({ type: "response", text: fullText });
        this.speakResponse(fullText);
      } else {
        this.emit({ type: "idle" });
      }

    } catch (err: any) {
      if (err.name === "AbortError") return;
      this.emit({ type: "error", message: err.message });
    }
  }

  /** Toggle voice listening on/off */
  toggleListening(): void {
    if (!this.voiceInput?.supported) {
      this.emit({ type: "error", message: "Voice input not supported in this browser." });
      return;
    }
    this.voiceInput.toggle();
  }

  /** Stop any active stream, TTS, voice recording, or demo */
  stop(): void {
    this.stopCurrentStream();
    this.tts.stop();
    this.voiceInput?.stop();
    this.cancelDemo?.();
    this.cancelDemo = null;
    this.emit({ type: "idle" });
  }

  /** Clear conversation history */
  clearHistory(): void {
    this.history.length = 0;
  }

  private pruneHistory(): void {
    if (this.history.length > AssistantService.MAX_HISTORY) {
      // Remove the oldest messages to keep within budget
      this.history.splice(0, this.history.length - AssistantService.MAX_HISTORY);
    }
  }

  /**
   * Run the automated "How It Works" component tour demo.
   * Requires demoCallbacks to be set (wired from index.ts after ExploreSystem is ready).
   */
  runDemo(): void {
    if (!this.demoCallbacks) {
      console.warn("[AssistantService] runDemo() called but demoCallbacks not set.");
      return;
    }

    this.cancelDemo?.();

    // Pick the script that matches the learner's selected language
    const profile = this.context.learnerMemory.getProfile();
    const lang = profile.language || "en";
    const demoSteps = getDemoForLanguage(lang);

    // Track whether we've already opened the door mid-demo
    let doorOpenedDuringDemo = false;

    const callbacks: DemoCallbacks = {
      ...this.demoCallbacks,
      showMessage: (text: string, onSpoken?: () => void) => {
        // Open the door at the "Let me open the door" step (componentId === "clear", step index 4)
        // We detect this by checking if the door is not yet open and we've already passed the door slide
        if (!doorOpenedDuringDemo && text && (
          text.includes("open the door") ||
          text.includes("Apro la porta") ||
          text.includes("ouvre le portillon") ||
          text.includes("Abro la puerta") ||
          text.includes("سأفتح")
        )) {
          doorOpenedDuringDemo = true;
          this.demoCallbacks?.openDoor?.();
        }

        this.emit({ type: "speaking", text });
        this.emit({ type: "response", text });
        this.tts.speak(text, lang, () => {
          onSpoken?.();
        });
      },
      onDemoEnd: () => {
        this.cancelDemo = null;
        this.emit({ type: "idle" });
      },
    };

    this.emit({ type: "speaking", text: "Starting demo..." });
    this.cancelDemo = runDemo(demoSteps, callbacks);
  }

  get isVoiceSupported(): boolean {
    return this.voiceInput?.supported ?? false;
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private emit(event: AssistantEvent): void {
    for (const handler of this.listeners) {
      try {
        handler(event);
      } catch (e) {
        console.error("[AssistantService] Event handler threw:", e);
      }
    }
  }

  private stopCurrentStream(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private speakResponse(text: string): void {
    // Priority 1: User's explicit preference from memory
    // Priority 2: Automatic detection as fallback
    const profile = this.context.learnerMemory.getProfile();
    const lang = profile.language || detectLanguage(text);

    this.emit({ type: "speaking", text });
    this.tts.speak(text, lang, () => {
      this.emit({ type: "speaking_end" });
      this.emit({ type: "idle" });
    });
  }

  private buildPayload(text: string | null, imageBase64: string | null, audioBase64: string | null, audioMime = "audio/wav"): ChatMessage[] {
    // Feed current query to MaintenanceSkill before building the system prompt
    if (text) this.context.setLastQuery(text);
    const systemContent = this.context.getSystemPrompt();

    // History contains plain text only — never audio_url or image_url blobs.
    // Those are attached only to the current turn's message below.
    const messages: ChatMessage[] = [{ role: "system", content: systemContent }, ...this.history];

    // The current user turn is the last message in history (already pushed by send/sendAudio).
    // Replace its plain-text content with a multipart array only for this request —
    // the history entry itself stays as plain text so it never accumulates blobs.
    if (audioBase64 || imageBase64) {
      const contentParts: any[] = [];
      const lastIdx = messages.length - 1;
      const isUser = messages[lastIdx]?.role === "user";

      // If the last message in history is a string (like the wrapper prompts injected by sendAudio/sendImage), 
      // use that string. Otherwise fallback to the raw text passed in.
      const promptText = isUser && typeof messages[lastIdx].content === "string" 
        ? messages[lastIdx].content 
        : text;

      if (promptText) {
        contentParts.push({ type: "text", text: promptText as string });
      }

      if (audioBase64) {
        contentParts.push({
          type: "audio_url",
          audio_url: { url: `data:${audioMime};base64,${audioBase64}` },
        });
      }

      if (imageBase64) {
        contentParts.push({
          type: "image_url",
          image_url: { url: `data:image/png;base64,${imageBase64}` },
        });
      }

      if (contentParts.length > 0) {
        // Replace the last message in the payload copy only — not the history array
        if (isUser) {
          messages[lastIdx] = { ...messages[lastIdx], content: contentParts as any };
        } else {
          // No prior user message in history (first turn via audio) — append fresh
          messages.push({ role: "user", content: contentParts as any });
        }
      }
    }

    return messages;
  }

  private async blobToBase64(blob: Blob): Promise<string | null> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64 || null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Detect if user query requires visual analysis
   */
  private isVisionQuery(text: string): boolean {
    const lowerText = text.toLowerCase();
    const visionKeywords = [
      'what button',
      'which button',
      'what color',
      'read the',
      'what does it say',
      'what text',
      'identify button',
      'show me button',
      'screenshot',
      'camera',
      'capture',
      'what is this',
      'what do i see',
      'look at',
      'see this',
      'can you see',
      'what am i looking at',
    ];
    return visionKeywords.some(keyword => lowerText.includes(keyword));
  }
}

// ─── Language Detection ──────────────────────────────────────────────────────

// ─── Language Detection ──────────────────────────────────────────────────────

function detectLanguage(text: string): SupportedLang {
  // Script-based detection — unambiguous
  if (/[\u0600-\u06FF]/.test(text)) return "ar";
  if (/[\u0400-\u04FF]/.test(text)) return "ru";
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  if (/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(text)) return "zh";
  if (/[\u3040-\u30FF]/.test(text)) return "ja";

  // Function-word scoring for Latin-script languages
  const score = (words: string[]): number =>
    (text.match(new RegExp(`\\b(${words.join("|")})\\b`, "gi")) || []).length;

  const scores: Record<SupportedLang, number> = {
    it: score(["il", "la", "di", "con", "per", "che", "del", "della", "delle", "dei", "gli", "le", "uno", "una", "sono", "è", "ho", "ha", "come", "cosa", "questo", "questa", "si", "no", "va", "bene", "mandrino", "torretta", "macchina", "pezzo", "utensile", "ciao", "grazie"]),
    fr: score(["le", "la", "les", "de", "du", "des", "un", "une", "et", "est", "en", "au", "que", "qui", "sur", "par", "pour", "avec", "mais", "je", "tu", "nous", "vous", "ils", "elle", "oui", "non", "merci", "salut", "mandrin"]),
    de: score(["der", "die", "das", "ein", "eine", "und", "ist", "ich", "du", "er", "sie", "es", "wir", "nicht", "mit", "auf", "für", "von", "zu", "aber", "oder", "auch", "noch", "ja", "nein", "danke"]),
    es: score(["el", "la", "los", "las", "de", "del", "un", "una", "y", "es", "en", "que", "con", "por", "para", "pero", "como", "más", "muy", "este", "esta", "también", "cuando", "si", "no", "gracias", "hola", "puerta"]),
    pt: score(["o", "a", "os", "as", "de", "do", "da", "dos", "das", "um", "uma", "e", "é", "em", "que", "com", "por", "para", "mas", "como", "mais", "muito", "este", "esta", "também"]),
    en: 0, ar: 0, ja: 0, zh: 0, hi: 0, ru: 0,
  };

  let best: SupportedLang = "en";
  let bestScore = 0; // Any match overrides English default
  for (const [lang, s] of Object.entries(scores) as [SupportedLang, number][]) {
    if (s > bestScore) { bestScore = s; best = lang; }
  }
  return best;
}

// ─── NativeTTSController ──────────────────────────────────────────────────────

const PREFERRED_VOICES: Record<SupportedLang, string[]> = {
  en: ["Google UK English Male", "Google US English"],
  it: ["Google italiano"],
  ar: ["Google arabic"],
  fr: ["Google français"],
  de: ["Google Deutsch"],
  es: ["Google español"],
  pt: ["Google português do Brasil", "Google português"],
  ja: ["Google 日本語"],
  zh: ["Google 普通话（中国大陆）", "Google 粤語（香港）", "Google 國語（臺灣）"],
  hi: ["Google हिन्दी"],
  ru: ["Google русский"],
};

const LANG_BCP47: Record<SupportedLang, string> = {
  en: "en-US", it: "it-IT", ar: "ar-SA",
  fr: "fr-FR", de: "de-DE", es: "es-ES",
  pt: "pt-BR", ja: "ja-JP", zh: "zh-CN",
  hi: "hi-IN", ru: "ru-RU",
};

const LANG_RATE: Record<SupportedLang, number> = {
  en: 1.0, it: 1.0, ar: 1.2,
  fr: 1.0, de: 1.0, es: 1.0,
  pt: 1.0, ja: 1.0, zh: 1.0,
  hi: 1.0, ru: 1.0,
};

function pickVoice(lang: SupportedLang): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  // Try preferred voice names first
  for (const name of PREFERRED_VOICES[lang]) {
    const v = voices.find(v => v.name.includes(name));
    if (v) return v;
  }

  // Fall back to any voice whose lang code matches the BCP-47 prefix
  const prefix = LANG_BCP47[lang].split("-")[0];
  return voices.find(v => v.lang.startsWith(prefix)) ?? null;
}

class NativeTTSController {
  private onDone: () => void;
  private onIdle: () => void;
  private utterance: SpeechSynthesisUtterance | null = null;

  constructor(onDone: () => void, onIdle: () => void) {
    this.onDone = onDone;
    this.onIdle = onIdle;
    // Trigger async voice list load in browsers that need a nudge
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
    }
  }

  speak(text: string, lang: SupportedLang, onDone?: () => void, onTokenTrigger?: (token: string) => void): void {
    if (!("speechSynthesis" in window)) {
      onDone?.(); this.onDone(); this.onIdle();
      return;
    }

    this.stop();

    // Right-to-left languages benefit from a slightly slower rate
    const rate = LANG_RATE[lang] ?? 1.0;
    // Split text into sentences so each utterance stays short and the browser
    // never silently truncates. Splitting on . ! ? followed by whitespace or
    // end-of-string, keeping the punctuation with the preceding sentence.
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (sentences.length === 0) {
      onDone?.(); this.onDone(); this.onIdle();
      return;
    }

    const speakSentences = (voice: SpeechSynthesisVoice | null, index: number) => {
      if (index >= sentences.length) {
        this.utterance = null;
        onDone?.(); this.onDone(); this.onIdle();
        return;
      }

      const utt = new SpeechSynthesisUtterance(sentences[index]);
      utt.lang = LANG_BCP47[lang] ?? "en-US";
      utt.rate = rate;
      utt.pitch = 1.0;
      if (voice) utt.voice = voice;

      if (onTokenTrigger) {
        utt.onboundary = (event) => {
          if (event.name === "word") {
            const word = sentences[index].substring(event.charIndex, event.charIndex + event.charLength);
            onTokenTrigger(word);
          }
        };
      }

      utt.onend = () => speakSentences(voice, index + 1);
      utt.onerror = () => {
        // Skip errored sentence and continue with the rest
        speakSentences(voice, index + 1);
      };

      this.utterance = utt;
      window.speechSynthesis.speak(utt);
    };

    const startWithVoice = () => {
      const voice = pickVoice(lang);
      speakSentences(voice, 0);
    };

    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null;
        startWithVoice();
      };
    } else {
      startWithVoice();
    }
  }

  stop(): void {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    this.utterance = null;
  }
}

// ─── Audio Resampling ─────────────────────────────────────────────────────────

/**
 * Resample any audio Blob to a 16kHz mono WAV using the Web Audio API.
 *
 * Why 16kHz: The Parakeet speech encoder inside Nemotron Omni was trained on
 * 16kHz mono audio. Sending 24kHz or 44.1kHz causes the encoder to hear speech
 * at the wrong speed, degrading transcription accuracy significantly.
 *
 * The process:
 *  1. Decode the source blob into a full AudioBuffer (any format/rate)
 *  2. Resample to 16kHz via OfflineAudioContext
 *  3. Encode as 16-bit PCM WAV (the simplest lossless format Parakeet handles)
 */
let sharedAudioCtx: AudioContext | null = null;

async function resampleToWav(blob: Blob, targetSampleRate = 16000): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();

  // Decode — browser handles any supported format (wav, mp3, ogg, webm, m4a…)
  // CRITICAL: Reuse a single AudioContext to avoid hitting the browser's hardware limit
  if (!sharedAudioCtx) sharedAudioCtx = new AudioContext();
  if (sharedAudioCtx.state === 'suspended') await sharedAudioCtx.resume();

  const decoded = await sharedAudioCtx.decodeAudioData(arrayBuffer);
  // Do NOT close the context here; we want to keep it alive for the next turn

  // Resample via OfflineAudioContext
  const numFrames = Math.ceil(decoded.duration * targetSampleRate);
  const offline = new OfflineAudioContext(1, numFrames, targetSampleRate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);
  const resampled = await offline.startRendering();

  // Encode as 16-bit PCM WAV
  const pcm = resampled.getChannelData(0); // mono — channel 0 only
  return pcmToWav(pcm, targetSampleRate);
}

/**
 * Encode a Float32 PCM array into a 16-bit mono WAV Blob.
 */
function pcmToWav(samples: Float32Array, sampleRate: number): Blob {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  // RIFF header
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true); // file size - 8
  writeStr(8, "WAVE");

  // fmt chunk
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);          // chunk size
  view.setUint16(20, 1, true);          // PCM format
  view.setUint16(22, 1, true);          // mono
  view.setUint32(24, sampleRate, true);  // sample rate
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true);          // block align
  view.setUint16(34, 16, true);          // bits per sample

  // data chunk
  writeStr(36, "data");
  view.setUint32(40, numSamples * 2, true);

  // Convert float32 [-1, 1] to int16
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

// ─── VoiceInputController ─────────────────────────────────────────────────────

/**
 * Native Audio Input Controller
 * Captures raw audio and sends it directly to the Nvidia API
 * for better understanding (tone, emotion, multilingual mixing)
 * and word-level timestamp support.
 */
class VoiceInputController {
  readonly supported: boolean;
  private isListening = false;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private autoStopTimer: ReturnType<typeof setTimeout> | null = null;

  /** Maximum recording duration in milliseconds — keeps audio short and model-friendly */
  private static readonly MAX_DURATION_MS = 30_000;

  constructor(private opts: {
    onResult: (audioBlob: Blob) => void;
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (error: string) => void;
    onAutoStop?: () => void; // fired when 30s limit is hit
  }) {
    this.supported = typeof MediaRecorder !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia !== 'undefined';
  }

  async start(): Promise<void> {
    if (!this.supported || this.isListening) return;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      const mimeType = this.getBestMimeType();
      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.audioChunks.push(event.data);
      };

      this.mediaRecorder.onstop = () => {
        this.clearAutoStop();
        const audioBlob = new Blob(this.audioChunks, { type: mimeType });
        this.audioChunks = [];
        this.isListening = false;
        this.stream?.getTracks().forEach(track => track.stop());
        this.stream = null;
        this.opts.onEnd?.();
        if (audioBlob.size > 0) this.opts.onResult(audioBlob);
      };

      this.mediaRecorder.onerror = (event: any) => {
        this.clearAutoStop();
        this.isListening = false;
        this.opts.onError?.(event.error?.message || 'recording-error');
      };

      this.mediaRecorder.start();
      this.isListening = true;
      this.opts.onStart?.();

      // Auto-stop after MAX_DURATION_MS to prevent runaway recordings
      this.autoStopTimer = setTimeout(() => {
        if (this.isListening) {
          console.warn(`[VoiceInput] Auto-stopping after ${VoiceInputController.MAX_DURATION_MS / 1000}s`);
          this.opts.onAutoStop?.();
          this.stop();
        }
      }, VoiceInputController.MAX_DURATION_MS);

    } catch (err: any) {
      this.isListening = false;
      const errorType = err.name === 'NotAllowedError' ? 'not-allowed' : err.message;
      this.opts.onError?.(errorType);
    }
  }

  stop(): void {
    this.clearAutoStop();
    if (!this.supported || !this.isListening || !this.mediaRecorder) return;
    if (this.mediaRecorder.state !== 'inactive') this.mediaRecorder.stop();
  }

  toggle(): void {
    if (this.isListening) this.stop();
    else this.start();
  }

  private clearAutoStop(): void {
    if (this.autoStopTimer !== null) {
      clearTimeout(this.autoStopTimer);
      this.autoStopTimer = null;
    }
  }

  private getBestMimeType(): string {
    // Model officially supports wav and mp3.
    // Prefer wav (uncompressed, zero decode ambiguity), then mp3, then webm as last resort.
    const types = [
      'audio/wav',
      'audio/mpeg',
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return 'audio/webm'; // fallback
  }
}
