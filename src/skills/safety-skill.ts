/**
 * SafetySkill
 * ===========
 * Deterministic ISO 13850 safety checks.
 * The LLM receives pass/fail facts — it never reasons about safety rules from scratch.
 *
 * All safety logic lives here. If a rule changes, change it once here.
 */

import type { SceneContext } from "../services/scene-context";
import type { SpatialContext } from "./spatial-skill";

export interface OperationCheck {
  allowed: boolean;
  reason?: string;
  isoReference?: string;
}

export interface SafetyContext {
  doorState: "OPEN" | "CLOSED" | "OPENING" | "CLOSING" | "UNKNOWN";
  spindleRunning: boolean;
  /** Pre-evaluated permission checks for common operations */
  checks: {
    canOpenDoor: OperationCheck;
    canCloseDoor: OperationCheck;
    canRunSpindle: OperationCheck;
    canStartCycle: OperationCheck;
  };
  /** Safety warnings active right now */
  activeWarnings: string[];
}

export class SafetySkill {
  /**
   * Evaluate current safety state from live SceneContext.
   * Returns structured facts — no reasoning required from LLM.
   */
  getContext(sceneContext: SceneContext, spatialContext?: SpatialContext | null): SafetyContext {
    const machineState = sceneContext.machineState ?? {};
    const doorOpen = machineState.doorOpen;
    const doorSettled = machineState.doorSettled !== false;
    const spindleRunning = machineState.spindleRunning ?? false;

    const doorState = this.deriveDoorState(doorOpen, doorSettled);
    const activeWarnings: string[] = [];

    if (doorOpen && spindleRunning) {
      activeWarnings.push("CRITICAL: Door is open while spindle is running — ISO 13850 violation");
    }

    const userSide = spatialContext?.side;
    const userDistance = spatialContext?.distance;

    return {
      doorState,
      spindleRunning,
      checks: {
        canOpenDoor: this.evaluateOpenDoor(doorOpen, spindleRunning, userSide, userDistance),
        canCloseDoor: this.evaluateCloseDoor(doorOpen, userSide, userDistance),
        canRunSpindle: this.evaluateRunSpindle(doorOpen),
        canStartCycle: this.evaluateStartCycle(doorOpen, spindleRunning),
      },
      activeWarnings,
    };
  }

  /**
   * Evaluate a named operation by token string.
   * Used by AssistantContext.canPerformAction().
   */
  evaluateOperation(operation: string, sceneContext: SceneContext, spatialContext?: SpatialContext | null): OperationCheck {
    const ctx = this.getContext(sceneContext, spatialContext);
    switch (operation) {
      case "OPEN_DOOR":  return ctx.checks.canOpenDoor;
      case "CLOSE_DOOR": return ctx.checks.canCloseDoor;
      default:           return { allowed: true };
    }
  }

  /**
   * Build a compact prompt block for PromptBuilder to inject.
   */
  buildPromptBlock(ctx: SafetyContext): string {
    const lines: string[] = [];
    lines.push(`Door: ${ctx.doorState}`);
    lines.push(`Spindle: ${ctx.spindleRunning ? "RUNNING" : "OFF"}`);

    if (!ctx.checks.canOpenDoor.allowed) {
      lines.push(`OPEN_DOOR blocked: ${ctx.checks.canOpenDoor.reason}`);
    }
    if (!ctx.checks.canCloseDoor.allowed) {
      lines.push(`CLOSE_DOOR blocked: ${ctx.checks.canCloseDoor.reason}`);
    }
    if (!ctx.checks.canRunSpindle.allowed) {
      lines.push(`Spindle start blocked: ${ctx.checks.canRunSpindle.reason}`);
    }
    for (const warning of ctx.activeWarnings) {
      lines.push(`⚠ ${warning}`);
    }
    return lines.join("\n");
  }

  // ─── Private evaluators ───────────────────────────────────────────────────

  private deriveDoorState(
    doorOpen: boolean | undefined,
    settled: boolean,
  ): SafetyContext["doorState"] {
    if (doorOpen === undefined) return "UNKNOWN";
    if (doorOpen) return settled ? "OPEN" : "OPENING";
    return settled ? "CLOSED" : "CLOSING";
  }

  private evaluateOpenDoor(
    doorOpen: boolean | undefined,
    spindleRunning: boolean,
    userSide?: string,
    userDistance?: number
  ): OperationCheck {
    if (doorOpen === true) {
      return { allowed: false, reason: "Door is already OPEN" };
    }
    if (spindleRunning) {
      return {
        allowed: false,
        reason: "Cannot open door while spindle is running",
        isoReference: "ISO 13850",
      };
    }
    if (userDistance !== undefined && userDistance > 3.0) {
      return {
        allowed: false,
        reason: `Cannot open door because you are too far from the machine (${userDistance} meters away)`,
      };
    }
    if (userSide === "back") {
      return {
        allowed: false,
        reason: "Cannot open door from behind the machine",
      };
    }
    return { allowed: true };
  }

  private evaluateCloseDoor(doorOpen: boolean | undefined, userSide?: string, userDistance?: number): OperationCheck {
    if (doorOpen === false) {
      return { allowed: false, reason: "Door is already CLOSED" };
    }
    if (userDistance !== undefined && userDistance > 3.0) {
      return {
        allowed: false,
        reason: `Cannot close door because you are too far from the machine (${userDistance} meters away)`,
      };
    }
    if (userSide === "back") {
      return {
        allowed: false,
        reason: "Cannot close door from behind the machine",
      };
    }
    return { allowed: true };
  }

  private evaluateRunSpindle(doorOpen: boolean | undefined): OperationCheck {
    if (doorOpen === true) {
      return {
        allowed: false,
        reason: "Cannot run spindle with door open",
        isoReference: "ISO 13850",
      };
    }
    return { allowed: true };
  }

  private evaluateStartCycle(doorOpen: boolean | undefined, spindleRunning: boolean): OperationCheck {
    if (doorOpen === true) {
      return {
        allowed: false,
        reason: "Cannot start machining cycle with door open — ISO 13850",
        isoReference: "ISO 13850",
      };
    }
    return { allowed: true };
  }
}
