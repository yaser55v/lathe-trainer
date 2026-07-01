/**
 * SpatialSkill
 * ============
 * Deterministic wrapper around SpatialAnalyzer.
 * Computes all geometry outside the LLM — the AI receives facts, not raw coords.
 *
 * The LLM must never recalculate distances, proximity, or machine sides.
 */

import { analyzeSpatialContext } from "../services/spatial-analyzer";
import type { SceneContext } from "../services/scene-context";
import { MACHINE_CENTER, BEHIND_MACHINE_Z_OFFSET } from "../machine/machine-geometry";

export interface SpatialContext {
  /** Which side of the machine the user is on */
  side: "front" | "back" | "left" | "right" | "unknown";
  /** Display name of nearest component */
  nearest: string;
  /** Distance to nearest component in meters */
  distance: number;
  /** Display names of components within interaction range */
  visibleComponents: string[];
  /** Human-readable description for prompt injection */
  description: string;
  /** Whether user is in an unusual/potentially unsafe position */
  unusualPosition: boolean;
}

export class SpatialSkill {
  /**
   * Compute spatial context from live SceneContext.
   * Returns structured data ready for PromptBuilder to consume.
   * Pure computation — no LLM involvement.
   */
  getContext(sceneContext: SceneContext): SpatialContext | null {
    if (!sceneContext.userPosition) return null;

    const analysis = analyzeSpatialContext(
      sceneContext.userPosition,
      sceneContext.userForward,
    );

    const side = this.deriveSide(analysis.relativePosition);

    return {
      side,
      nearest: analysis.nearestComponent?.displayName ?? "unknown",
      distance: Math.round(analysis.nearestDistance * 10) / 10,
      visibleComponents: analysis.nearbyComponents.map((n) => n.component.displayName),
      description: sceneContext.spatialAnalysis ?? analysis.description,
      unusualPosition: this.isUnusual(sceneContext.userPosition),
    };
  }

  /**
   * Build a compact prompt block from spatial context.
   * Returns empty string if no position available.
   */
  buildPromptBlock(ctx: SpatialContext | null): string {
    if (!ctx) return "";

    const lines: string[] = [];
    lines.push(`Side: ${ctx.side}`);
    lines.push(`Nearest component: ${ctx.nearest} (${ctx.distance}m)`);
    if (ctx.visibleComponents.length > 0) {
      lines.push(`Components in range: ${ctx.visibleComponents.join(", ")}`);
    }
    if (ctx.unusualPosition) {
      lines.push("WARNING: User is in an unusual position (behind or very close to moving parts)");
    }
    lines.push(ctx.description);
    return lines.join("\n");
  }

  private deriveSide(relativePosition: string): SpatialContext["side"] {
    if (relativePosition.includes("in front of")) return "front";
    if (relativePosition.includes("behind")) return "back";
    if (relativePosition.includes("to the right of")) return "right";
    if (relativePosition.includes("to the left of")) return "left";
    return "unknown";
  }

  private isUnusual(pos: { x: number; y: number; z: number }): boolean {
    // Behind machine
    if (pos.z < MACHINE_CENTER.z - BEHIND_MACHINE_Z_OFFSET) return true;
    return false;
  }
}
