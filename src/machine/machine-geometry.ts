/**
 * machine-geometry.ts
 * ====================
 * Shared geometric constants for the CNC lathe scene.
 * Single source of truth for machine center, safe-distance thresholds,
 * and spatial classification rules. Both spatial-analyzer.ts (raw
 * geometry) and spatial-skill.ts (prompt-friendly summary) consume
 * these values, so they stay in lockstep.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** World-space center of the lathe, used as the reference point
 *  for front/back/left/right classification. */
export const MACHINE_CENTER: Vec3 = {
  x: -0.34,
  y: 1.15,
  z: -2.88,
};

/** Z offset past which the user is considered "behind" the machine
 *  (used by both isUnusualPosition and the prompt's visibility rules). */
export const BEHIND_MACHINE_Z_OFFSET = 2.0;

/** Z threshold used by buildSpatialDescription to decide whether the
 *  user is viewing the actual back panel (userPos.z < MACHINE_CENTER.z - this). */
export const BACK_PANEL_Z_THRESHOLD = 1.0; // i.e. userPos.z < -3.88

/** Convenience: z value at which the user is considered to be
 *  standing in front of the machine (MACHINE_CENTER.z - 0.5 = -3.38). */
export const FRONT_COMPONENT_Z = MACHINE_CENTER.z - 0.5;

/** Convenience: z value used to filter "back side" components
 *  (MACHINE_CENTER.z - 0.3 = -3.18). */
export const BACK_COMPONENT_Z = MACHINE_CENTER.z - 0.3;

/** X offset past which the user is considered to be on the right side. */
export const RIGHT_SIDE_X_OFFSET = 0.3;
