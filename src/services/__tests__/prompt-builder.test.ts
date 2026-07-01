/**
 * PromptBuilder.test.ts
 * =====================
 * Snapshot-style tests that lock the section ordering and shape of the
 * system prompt. These tests fail loudly if anyone reorders sections,
 * removes the visibility rules, or accidentally changes the
 * section-numbering scheme documented in the docstring.
 *
 * We assert on *structure* (section headers, key phrases, ordering) rather
 * than on the full string — full-string snapshots get noisy when trivial
 * wording changes ripple through hundreds of lines.
 */
import { describe, expect, it } from "vitest";
import { PromptBuilder } from "../prompt-builder";
import { MACHINE_COMPONENTS } from "../../machine/machine-map";
import type { SceneContext } from "../scene-context";
import type { SafetyContext } from "../../skills/safety-skill";
import type { SpatialContext } from "../../skills/spatial-skill";
import type { SalesContext } from "../../skills/sales-skill";
import type { TrainingContext } from "../../skills/training-skill";
import type { MaintenanceAnalysis } from "../../skills/maintenance-skill";

// Minimal fixture for the Maintenance skill to format a block.
// Mirrors the shape produced by MaintenanceSkill.analyze() for "alarm 301".
const MAINT_FIXTURE: MaintenanceAnalysis = {
  failureType: "mechanical",
  severity: "high",
  probableCauses: ["Spindle overload"],
  escalationLevel: "certified_service",
  safeToContinueOperation: false,
  recommendedActions: ["Stop machine immediately"],
  relatedComponents: ["chuck"],
  confidence: 0.9,
};

const SCENE_BASE: SceneContext = {
  machineState: { doorOpen: false, doorSettled: true, spindleRunning: false },
  selectedComponent: "chuck",
};

const SPATIAL_FIXTURE: SpatialContext = {
  side: "front",
  nearest: "Safety Door",
  distance: 1.2,
  visibleComponents: ["Safety Door", "Control Panel"],
  description: "User is in front of the machine (1.4m away), at operator level with. Near the Safety Door (1.2m).",
  unusualPosition: false,
};

const SAFETY_FIXTURE: SafetyContext = {
  doorState: "CLOSED",
  spindleRunning: false,
  activeWarnings: [],
  checks: {
    canOpenDoor: { allowed: true },
    canCloseDoor: { allowed: false, reason: "Door is already CLOSED" },
    canRunSpindle: { allowed: true },
    canStartCycle: { allowed: true },
  },
};

const SALES_FIXTURE: SalesContext = {
  basePriceRange: [150_000, 220_000],
  maintenancePercent: [10, 15],
  estimatedAnnualMaintenance: [15_000, 33_000],
  efficiencyGains: {
    setupTimeSavedMinutes: 42,
    toolChangeSub05s: true,
    precisionMm: 0.005,
    throughputIncreaseFactor: 3,
    scratchRateReductionPercent: 80,
  },
  roiExamples: {
    dailyTimeSavedMinutes: 42,
    annualHoursSaved: 175,
    costPerPartReduction: "up to 60% reduction in cost-per-part at volume",
  },
  commercialArguments: {
    tcoVsCheapAlternative: "",
    downtimeCostAdvantage: "",
    precisionValueProp: "",
  },
  currency: "EUR",
  disclaimer: "Figures are estimates; final integration costs depend on factory options.",
};

const TRAINING_FIXTURE: TrainingContext = {
  currentLesson: null,
  completedLessons: [],
  skillLevel: "beginner",
  safetyScore: 100,
  totalLessons: 5,
  progressPercent: 0,
  summary: "beginner level, 0/5 lessons completed, safety score 100",
};
// silence unused-var linting — kept as documentation of the TrainingContext shape
void TRAINING_FIXTURE;

const LEARNER_MEMORY_BLOCK =
  "LEARNER MEMORY (from previous sessions):\n- Language: English\n- Skill level: beginner\n- Safety score: 100/100\n- Sessions completed: 0";

function indexOfAll(haystack: string, needle: string): number[] {
  const out: number[] = [];
  let from = 0;
  while (true) {
    const i = haystack.indexOf(needle, from);
    if (i === -1) return out;
    out.push(i);
    from = i + 1;
  }
  return out;
}

describe("PromptBuilder — section structure", () => {
  it("emits the 8 always-on sections in the documented order", () => {
    const pb = new PromptBuilder("KB body", MACHINE_COMPONENTS);
    const out = pb.build();

    const headers = [
      "# 1. ROLE",
      "# 2. BEHAVIOR RULES",
      "# 3. LANGUAGE RULES",
      "# 4. MACHINE KNOWLEDGE",
      "# 5. MACHINE COMPONENT MAP",
      "# 6. AVAILABLE ACTIONS",
      "# 7. DEMO RULES",
      "# 8. LIVE SCENE CONTEXT",
    ];

    const positions = headers.map((h) => out.indexOf(h));
    // All headers must exist
    for (const p of positions) {
      expect(p, `header not found in prompt`).toBeGreaterThanOrEqual(0);
    }
    // All headers must be in increasing order
    for (let i = 1; i < positions.length; i++) {
      expect(
        positions[i],
        `section ${i + 1} appears out of order`,
      ).toBeGreaterThan(positions[i - 1]!);
    }
  });

  it("inserts SALES block as # 9 when sales inputs are present", () => {
    const pb = new PromptBuilder("KB", MACHINE_COMPONENTS);
    pb.updateSkillInputs({ sales: SALES_FIXTURE });
    const out = pb.build();
    const salesIdx = out.indexOf("# 9. AUTHORITATIVE COMMERCIAL DATA");
    expect(salesIdx).toBeGreaterThan(out.indexOf("# 8. LIVE SCENE CONTEXT"));
  });

  it("inserts LEARNER MEMORY as # 10 (no header) when memory block is present", () => {
    const pb = new PromptBuilder("KB", MACHINE_COMPONENTS);
    pb.updateSkillInputs({ learnerMemoryBlock: LEARNER_MEMORY_BLOCK });
    const out = pb.build();
    const memoryIdx = out.indexOf("LEARNER MEMORY (from previous sessions):");
    expect(memoryIdx).toBeGreaterThan(0);
  });

  it("inserts MAINTENANCE block as # 11 when maintenance is present", () => {
    const pb = new PromptBuilder("KB", MACHINE_COMPONENTS);
    pb.updateSkillInputs({ maintenance: MAINT_FIXTURE });
    const out = pb.build();
    const maintIdx = out.indexOf("# 11. MAINTENANCE ANALYSIS");
    expect(maintIdx).toBeGreaterThan(0);
  });

  it("omits optional blocks when their inputs are absent", () => {
    const pb = new PromptBuilder("KB", MACHINE_COMPONENTS);
    const out = pb.build();
    expect(out).not.toContain("AUTHORITATIVE COMMERCIAL DATA");
    expect(out).not.toContain("LEARNER MEMORY");
    expect(out).not.toContain("MAINTENANCE ANALYSIS");
  });

  it("emits the visibility rules exactly once even with the spatial fallback branch", () => {
    // Both branches of buildLiveSceneContext (with and without spatial skill)
    // should produce a single CRITICAL VISIBILITY RULES block, not two.
    const withSkill = new PromptBuilder("KB", MACHINE_COMPONENTS);
    withSkill.updateSkillInputs({ spatial: SPATIAL_FIXTURE });
    expect(indexOfAll(withSkill.build(), "CRITICAL VISIBILITY RULES:")).toHaveLength(1);

    const withoutSkill = new PromptBuilder("KB", MACHINE_COMPONENTS);
    withoutSkill.updateSceneContext(SCENE_BASE);
    expect(indexOfAll(withoutSkill.build(), "CRITICAL VISIBILITY RULES:")).toHaveLength(1);
  });

  it("scenes with no runtime state still emit a sensible live-context block", () => {
    const pb = new PromptBuilder("KB", MACHINE_COMPONENTS);
    pb.updateSceneContext({});
    const out = pb.build();
    expect(out).toContain("# 8. LIVE SCENE CONTEXT");
    // The empty-scene branch emits SOURCE OF TRUTH + CONVERSATION HISTORY
    // anchor lines but no runtime state.
    expect(out).toContain("SOURCE OF TRUTH:");
    expect(out).toContain("CONVERSATION HISTORY:");
  });

  it("formats the sales block with the exact figures from the input (no fabrication)", () => {
    const pb = new PromptBuilder("KB", MACHINE_COMPONENTS);
    pb.updateSkillInputs({ sales: SALES_FIXTURE });
    const out = pb.build();
    expect(out).toContain("150,000€ – 220,000€");
    expect(out).toContain("15,000€ – 33,000€");
    expect(out).toContain("10–15%");
    expect(out).toContain("42 min");
    expect(out).toContain("±0.005mm");
    expect(out).toContain("3×");
    expect(out).toContain("up to 80%");
  });

  it("forbids emitting CLOSE_DOOR in the actions block when door is already closed", () => {
    const pb = new PromptBuilder("KB", MACHINE_COMPONENTS);
    pb.updateSceneContext({
      machineState: { doorOpen: false, doorSettled: true, spindleRunning: false },
    });
    const out = pb.build();
    expect(out).toContain("[ACTION:OPEN_DOOR]");
    expect(out).toContain("Do NOT emit [ACTION:CLOSE_DOOR]");
  });

  it("forbids emitting OPEN_DOOR in the actions block when door is already open", () => {
    const pb = new PromptBuilder("KB", MACHINE_COMPONENTS);
    pb.updateSceneContext({
      machineState: { doorOpen: true, doorSettled: true, spindleRunning: false },
    });
    const out = pb.build();
    expect(out).toContain("[ACTION:CLOSE_DOOR]");
    expect(out).toContain("Do NOT emit [ACTION:OPEN_DOOR]");
  });

  it("surfaces safety blocked-actions in the live scene context", () => {
    const pb = new PromptBuilder("KB", MACHINE_COMPONENTS);
    pb.updateSceneContext(SCENE_BASE);
    pb.updateSkillInputs({
      spatial: SPATIAL_FIXTURE,
      safety: SAFETY_FIXTURE,
    });
    const out = pb.build();
    // canOpenDoor is allowed in this fixture, so it must NOT appear as blocked.
    expect(out).not.toContain("OPEN_DOOR blocked");
    // canCloseDoor is blocked with a non-idempotent reason — must surface.
    // (The fixture uses "Door is already CLOSED" which the builder explicitly
    // suppresses as idempotent, so we instead use a custom reason to prove
    // the suppression logic, not the path.)
    // Re-test with a non-suppressed reason:
    const pb2 = new PromptBuilder("KB", MACHINE_COMPONENTS);
    pb2.updateSceneContext(SCENE_BASE);
    pb2.updateSkillInputs({
      spatial: SPATIAL_FIXTURE,
      safety: {
        ...SAFETY_FIXTURE,
        checks: {
          ...SAFETY_FIXTURE.checks,
          canOpenDoor: { allowed: false, reason: "Cannot open door while spindle is running" },
        },
      },
    });
    const out2 = pb2.build();
    expect(out2).toContain("OPEN_DOOR blocked");
    expect(out2).toContain("Cannot open door while spindle is running");
  });

  it("emits ISO 13850 safety rule in the behavior block", () => {
    const pb = new PromptBuilder("KB", MACHINE_COMPONENTS);
    const out = pb.build();
    expect(out).toContain("ISO 13850");
  });

  it("emits every component's HIGHLIGHT_* action token", () => {
    const pb = new PromptBuilder("KB", MACHINE_COMPONENTS);
    const out = pb.build();
    for (const c of MACHINE_COMPONENTS) {
      expect(out).toContain(`[ACTION:${c.highlightAction}]`);
    }
    expect(out).toContain("[ACTION:HIGHLIGHT_CLEAR]");
  });
});
