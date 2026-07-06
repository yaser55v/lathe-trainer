/**
 * machine-map.test.ts
 * ===================
 * Guards the integrity of MACHINE_COMPONENTS — the single source of truth
 * for component IDs, action tokens, display names, and spatial positions.
 *
 * These tests catch:
 *   - Accidental ID or action token renames that would break ActionRegistry
 *   - Missing required fields on any component entry
 *   - Duplicate IDs or action tokens (would cause highlight collisions)
 *   - buildMachineMapActionBlock() output shape used by PromptBuilder
 */
import { describe, expect, it } from "vitest";
import { MACHINE_COMPONENTS, buildMachineMapActionBlock } from "../machine-map";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const EXPECTED_IDS = [
  "chuck",
  "tailstock",
  "door",
  "control_panel",
  "tool_turret",
  "chip_conveyor",
];

const EXPECTED_HIGHLIGHT_ACTIONS = [
  "HIGHLIGHT_CHUCK",
  "HIGHLIGHT_TAILSTOCK",
  "HIGHLIGHT_DOOR",
  "HIGHLIGHT_CONTROL_PANEL",
  "HIGHLIGHT_TOOL_TURRET",
  "HIGHLIGHT_CHIP_CONVEYOR",
];

// ─── Component count & IDs ────────────────────────────────────────────────────

describe("MACHINE_COMPONENTS — structure", () => {
  it("contains exactly 6 components", () => {
    expect(MACHINE_COMPONENTS).toHaveLength(6);
  });

  it("contains all expected component IDs", () => {
    const ids = MACHINE_COMPONENTS.map((c) => c.id);
    for (const id of EXPECTED_IDS) {
      expect(ids).toContain(id);
    }
  });

  it("has no duplicate IDs", () => {
    const ids = MACHINE_COMPONENTS.map((c) => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("has no duplicate highlightAction tokens", () => {
    const actions = MACHINE_COMPONENTS.map((c) => c.highlightAction);
    const unique = new Set(actions);
    expect(unique.size).toBe(actions.length);
  });

  it("has no duplicate cardIds", () => {
    const cardIds = MACHINE_COMPONENTS.map((c) => c.cardId);
    const unique = new Set(cardIds);
    expect(unique.size).toBe(cardIds.length);
  });
});

// ─── Required fields ─────────────────────────────────────────────────────────

describe("MACHINE_COMPONENTS — required fields", () => {
  for (const component of MACHINE_COMPONENTS) {
    it(`${component.id} has all required non-empty fields`, () => {
      expect(component.id).toBeTruthy();
      expect(component.displayName).toBeTruthy();
      expect(component.highlightAction).toBeTruthy();
      expect(component.description).toBeTruthy();
      expect(component.cardId).toBeTruthy();
      expect(component.meshNames.length).toBeGreaterThan(0);
    });

    it(`${component.id} has a valid 3D position`, () => {
      expect(typeof component.position.x).toBe("number");
      expect(typeof component.position.y).toBe("number");
      expect(typeof component.position.z).toBe("number");
      expect(isFinite(component.position.x)).toBe(true);
      expect(isFinite(component.position.y)).toBe(true);
      expect(isFinite(component.position.z)).toBe(true);
    });

    it(`${component.id} has a positive proximityRadius`, () => {
      expect(component.proximityRadius).toBeGreaterThan(0);
    });
  }
});

// ─── Action token shape ───────────────────────────────────────────────────────

describe("MACHINE_COMPONENTS — highlight action token format", () => {
  it("all highlightAction tokens match HIGHLIGHT_<UPPERCASE_ID> format", () => {
    for (const component of MACHINE_COMPONENTS) {
      const expected = `HIGHLIGHT_${component.id.toUpperCase()}`;
      expect(component.highlightAction).toBe(expected);
    }
  });

  it("contains all expected action tokens", () => {
    const actions = MACHINE_COMPONENTS.map((c) => c.highlightAction);
    for (const action of EXPECTED_HIGHLIGHT_ACTIONS) {
      expect(actions).toContain(action);
    }
  });
});

// ─── buildMachineMapActionBlock ───────────────────────────────────────────────

describe("buildMachineMapActionBlock()", () => {
  it("contains an entry for every component highlight action", () => {
    const block = buildMachineMapActionBlock();
    for (const component of MACHINE_COMPONENTS) {
      expect(block).toContain(`[ACTION:${component.highlightAction}]`);
    }
  });

  it("includes HIGHLIGHT_CLEAR", () => {
    expect(buildMachineMapActionBlock()).toContain("[ACTION:HIGHLIGHT_CLEAR]");
  });

  it("includes DEMO_HOW_IT_WORKS", () => {
    expect(buildMachineMapActionBlock()).toContain("[ACTION:DEMO_HOW_IT_WORKS]");
  });

  it("includes each component display name in the output", () => {
    const block = buildMachineMapActionBlock();
    for (const component of MACHINE_COMPONENTS) {
      expect(block).toContain(component.displayName);
    }
  });
});

// ─── Spatial sanity ───────────────────────────────────────────────────────────

describe("MACHINE_COMPONENTS — spatial sanity", () => {
  it("all component Y positions are above floor level (> 0.5m)", () => {
    for (const component of MACHINE_COMPONENTS) {
      expect(component.position.y).toBeGreaterThan(0.5);
    }
  });

  it("all component Z positions are negative (machine is in front of origin)", () => {
    for (const component of MACHINE_COMPONENTS) {
      expect(component.position.z).toBeLessThan(0);
    }
  });

  it("chuck and tailstock are on the same Z axis (inside the machine)", () => {
    const chuck = MACHINE_COMPONENTS.find((c) => c.id === "chuck")!;
    const tailstock = MACHINE_COMPONENTS.find((c) => c.id === "tailstock")!;
    expect(Math.abs(chuck.position.z - tailstock.position.z)).toBeLessThan(0.5);
  });

  it("control_panel is closer to the front than chuck (lower negative Z)", () => {
    const panel = MACHINE_COMPONENTS.find((c) => c.id === "control_panel")!;
    const chuck = MACHINE_COMPONENTS.find((c) => c.id === "chuck")!;
    // panel.z is less negative = closer to the user standing in front
    expect(panel.position.z).toBeGreaterThan(chuck.position.z);
  });
});
