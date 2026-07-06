/**
 * machine-demos.test.ts
 * =====================
 * Guards the multilingual demo scripts and runDemo() execution logic.
 *
 * Tests cover:
 *   - getDemoForLanguage() returns correct script for each supported language
 *   - Every demo script covers all 6 machine components
 *   - All delayMs values are positive and within sensible range
 *   - runDemo() calls highlight/clearHighlights/showMessage in the right order
 *   - runDemo() cancel function stops execution immediately
 *   - runDemo() calls onDemoEnd when finished
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { getDemoForLanguage, HOW_IT_WORKS_DEMO, runDemo } from "../machine-demos";
import type { DemoCallbacks } from "../machine-demos";
import { MACHINE_COMPONENTS } from "../machine-map";

// ─── getDemoForLanguage ───────────────────────────────────────────────────────

describe("getDemoForLanguage()", () => {
  it("returns English demo for 'en'", () => {
    expect(getDemoForLanguage("en")).toBe(HOW_IT_WORKS_DEMO);
  });

  it("returns English demo for unknown language code", () => {
    expect(getDemoForLanguage("xx")).toBe(HOW_IT_WORKS_DEMO);
    expect(getDemoForLanguage("")).toBe(HOW_IT_WORKS_DEMO);
  });

  it("returns a different script for each supported language", () => {
    const en = getDemoForLanguage("en");
    const it_ = getDemoForLanguage("it");
    const ar = getDemoForLanguage("ar");
    const fr = getDemoForLanguage("fr");
    const es = getDemoForLanguage("es");

    // Each language should have distinct message text
    expect(it_[0].message).not.toBe(en[0].message);
    expect(ar[0].message).not.toBe(en[0].message);
    expect(fr[0].message).not.toBe(en[0].message);
    expect(es[0].message).not.toBe(en[0].message);
  });

  it("all supported language scripts have the same number of steps as English", () => {
    const en = getDemoForLanguage("en");
    for (const lang of ["it", "ar", "fr", "es"]) {
      expect(getDemoForLanguage(lang)).toHaveLength(en.length);
    }
  });
});

// ─── Demo script content ──────────────────────────────────────────────────────

describe("demo script content — all languages", () => {
  const COMPONENT_IDS = MACHINE_COMPONENTS.map((c) => c.id);

  for (const lang of ["en", "it", "ar", "fr", "es"]) {
    it(`${lang}: covers all 6 machine component IDs across its steps`, () => {
      const steps = getDemoForLanguage(lang);
      const highlightedIds = steps
        .filter((s) => s.componentId !== "clear")
        .map((s) => s.componentId);

      for (const id of COMPONENT_IDS) {
        expect(highlightedIds).toContain(id);
      }
    });

    it(`${lang}: all delayMs values are positive and under 15 seconds`, () => {
      const steps = getDemoForLanguage(lang);
      for (const step of steps) {
        expect(step.delayMs).toBeGreaterThan(0);
        expect(step.delayMs).toBeLessThanOrEqual(15000);
      }
    });

    it(`${lang}: first step is a 'clear' to reset any existing highlights`, () => {
      const steps = getDemoForLanguage(lang);
      expect(steps[0].componentId).toBe("clear");
    });

    it(`${lang}: last step is a 'clear' to clean up after the tour`, () => {
      const steps = getDemoForLanguage(lang);
      expect(steps[steps.length - 1].componentId).toBe("clear");
    });

    it(`${lang}: all steps have non-empty message text`, () => {
      const steps = getDemoForLanguage(lang);
      for (const step of steps) {
        expect(step.message.trim().length).toBeGreaterThan(0);
      }
    });
  }
});

// ─── runDemo() execution logic ────────────────────────────────────────────────

describe("runDemo()", () => {
  let callbacks: DemoCallbacks;

  beforeEach(() => {
    vi.useFakeTimers();
    callbacks = {
      highlight: vi.fn(),
      clearHighlights: vi.fn(),
      showMessage: vi.fn(),
      onDemoEnd: vi.fn(),
    };
  });

  it("calls clearHighlights for the first 'clear' step immediately", () => {
    const steps = getDemoForLanguage("en");
    runDemo(steps, callbacks);
    expect(callbacks.clearHighlights).toHaveBeenCalledTimes(1);
  });

  it("calls showMessage for the first step immediately", () => {
    const steps = getDemoForLanguage("en");
    runDemo(steps, callbacks);
    expect(callbacks.showMessage).toHaveBeenCalledTimes(1);
    expect(callbacks.showMessage).toHaveBeenCalledWith(steps[0].message, expect.any(Function));
  });

  it("advances to the next step after speech completes and delay passes", () => {
    const steps = getDemoForLanguage("en");
    runDemo(steps, callbacks);

    // Simulate step 0: speech finishes + timer fires
    const onSpoken = (callbacks.showMessage as ReturnType<typeof vi.fn>).mock.calls[0][1];
    onSpoken(); // speech done
    vi.advanceTimersByTime(steps[0].delayMs + 500); // delay + gap

    // Step 1 should now be active
    expect(callbacks.showMessage).toHaveBeenCalledTimes(2);
  });

  it("does NOT advance until both speech AND delay are both done", () => {
    const steps = getDemoForLanguage("en");
    runDemo(steps, callbacks);

    // Only fire speech callback — delay has not passed
    const onSpoken = (callbacks.showMessage as ReturnType<typeof vi.fn>).mock.calls[0][1];
    onSpoken();

    // Still on step 0
    expect(callbacks.showMessage).toHaveBeenCalledTimes(1);

    // Now advance timer — both conditions met
    vi.advanceTimersByTime(steps[0].delayMs + 500);
    expect(callbacks.showMessage).toHaveBeenCalledTimes(2);
  });

  it("cancel function stops execution immediately — no further callbacks fire", () => {
    const steps = getDemoForLanguage("en");
    const cancel = runDemo(steps, callbacks);

    cancel();

    // Advance all timers — nothing should advance
    vi.advanceTimersByTime(60000);

    // showMessage was called once for step 0, but never for step 1+
    expect(callbacks.showMessage).toHaveBeenCalledTimes(1);
    expect(callbacks.onDemoEnd).not.toHaveBeenCalled();
  });

  it("cancel calls clearHighlights to clean up the scene", () => {
    const steps = getDemoForLanguage("en");
    const cancel = runDemo(steps, callbacks);

    cancel();

    // clearHighlights should have been called: once for step 0 (clear) + once on cancel
    expect(callbacks.clearHighlights).toHaveBeenCalledTimes(2);
  });

  it("calls onDemoEnd after all steps complete", () => {
    // Use a minimal 2-step script for speed
    const shortSteps = [
      { componentId: "clear", message: "Step 1", delayMs: 100 },
      { componentId: "clear", message: "Step 2", delayMs: 100 },
    ];

    runDemo(shortSteps, callbacks);

    // Complete step 0
    const onSpoken0 = (callbacks.showMessage as ReturnType<typeof vi.fn>).mock.calls[0][1];
    onSpoken0();
    vi.advanceTimersByTime(600);

    // Complete step 1
    const onSpoken1 = (callbacks.showMessage as ReturnType<typeof vi.fn>).mock.calls[1][1];
    onSpoken1();
    vi.advanceTimersByTime(600);

    expect(callbacks.onDemoEnd).toHaveBeenCalledTimes(1);
  });

  it("calls highlight (not clearHighlights) for component steps", () => {
    const componentSteps = [
      { componentId: "chuck", message: "This is the chuck", delayMs: 100 },
    ];

    runDemo(componentSteps, callbacks);

    expect(callbacks.highlight).toHaveBeenCalledWith("chuck");
    expect(callbacks.clearHighlights).not.toHaveBeenCalled();
  });
});
