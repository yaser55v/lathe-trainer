/**
 * machine-geometry.test.ts
 * ========================
 * Guards the single source of truth for the lathe's geometric constants.
 * Prevents silent drift in MACHINE_CENTER or threshold values that would
 * cause SpatialSkill and SpatialAnalyzer to disagree.
 */
import { describe, expect, it } from "vitest";
import {
  MACHINE_CENTER,
  BEHIND_MACHINE_Z_OFFSET,
  BACK_PANEL_Z_THRESHOLD,
  FRONT_COMPONENT_Z,
  BACK_COMPONENT_Z,
  RIGHT_SIDE_X_OFFSET,
} from "../machine-geometry";

describe("machine-geometry constants", () => {
  it("MACHINE_CENTER.z matches the historical fixed value (single source of truth)", () => {
    // This value is hard-coded in many derived thresholds across the codebase.
    // Changing it here will propagate everywhere; if a test breaks, that's the
    // signal to verify the geometry change is intentional.
    expect(MACHINE_CENTER.z).toBe(-2.88);
  });

  it("derived thresholds are consistent with MACHINE_CENTER", () => {
    expect(FRONT_COMPONENT_Z).toBeCloseTo(MACHINE_CENTER.z - 0.5, 5);
    expect(BACK_COMPONENT_Z).toBeCloseTo(MACHINE_CENTER.z - 0.3, 5);
  });

  it("threshold values are positive and within sensible spatial ranges", () => {
    expect(BEHIND_MACHINE_Z_OFFSET).toBeGreaterThan(0);
    expect(BACK_PANEL_Z_THRESHOLD).toBeGreaterThan(0);
    expect(RIGHT_SIDE_X_OFFSET).toBeGreaterThan(0);
  });
});
