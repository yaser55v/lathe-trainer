/**
 * SceneContext
 * ============
 * A live snapshot of world-state that can be injected into every AI request.
 *
 * This is intentionally a plain mutable object — any system can write into it
 * at any time. AssistantService reads it when building the request payload, so
 * the AI always has current awareness of the user's environment.
 *
 * How to extend later:
 *   - User position:       sceneContext.userPosition = { x, y, z }
 *   - Selected component:  sceneContext.selectedComponent = "tool_turret"
 *   - Machine state:       sceneContext.machineState = { doorOpen: true, spindle: false }
 *   - Camera mode:         sceneContext.viewMode = "explore"
 *
 * The context is formatted into the system prompt by buildContextBlock().
 * If all fields are empty, no context block is injected (zero token waste).
 */

export interface MachineState {
  doorOpen?: boolean;
  doorSettled?: boolean; // true = animation finished, false = still moving
  spindleRunning?: boolean;
  activeMode?: string;
}

export interface UserPosition {
  x: number;
  y: number;
  z: number;
}

export interface SceneContext {
  /** Current XR world position of the user's head, in meters */
  userPosition?: UserPosition;
  /** User's forward-facing direction vector (for "what am I looking at?") */
  userForward?: { x: number; y: number; z: number };
  /** Name of the 3D component the user is currently focused on / selected */
  selectedComponent?: string;
  /** Live machine state fields */
  machineState?: MachineState;
  /** Current navigation / experience mode */
  viewMode?: string;
  /** Computed spatial analysis (updated every frame) */
  spatialAnalysis?: string;
}

/**
 * Creates a blank scene context object.
 * Stored in world.globals so any system can write to it.
 */
export function createSceneContext(): SceneContext {
  return {};
}

/**
 * Serializes the context into a compact natural-language block for injection
 * into the system prompt. Returns empty string if nothing is populated.
 */
export function buildContextBlock(ctx: SceneContext): string {
  const lines: string[] = [];

  if (ctx.userPosition) {
    const { x, y, z } = ctx.userPosition;
    lines.push(`User position in scene: x=${x.toFixed(2)}, y=${y.toFixed(2)}, z=${z.toFixed(2)} (meters)`);
  }

  if (ctx.selectedComponent) {
    lines.push(`User is currently focused on: "${ctx.selectedComponent}" — if asked "what is this" or "what am I looking at", answer about this component`);
  }

  if (ctx.machineState) {
    const parts: string[] = [];
    if (ctx.machineState.doorOpen !== undefined) {
      const settled = ctx.machineState.doorSettled !== false;
      const state = ctx.machineState.doorOpen
        ? (settled ? "OPEN" : "OPENING (in motion)")
        : (settled ? "CLOSED" : "CLOSING (in motion)");
      parts.push(`safety door is ${state}`);
    }
    if (ctx.machineState.spindleRunning !== undefined) {
      parts.push(`spindle ${ctx.machineState.spindleRunning ? "RUNNING" : "OFF"}`);
    }
    if (ctx.machineState.activeMode) {
      parts.push(`machine mode: ${ctx.machineState.activeMode}`);
    }
    if (parts.length > 0) {
      lines.push(`Machine state: ${parts.join(", ")}`);
    }
  }

  if (ctx.viewMode) {
    lines.push(`Current experience mode: ${ctx.viewMode}`);
  }

  if (lines.length === 0) return "";

  return [
    "=========================================",
    "LIVE SCENE CONTEXT (injected at request time)",
    "=========================================",
    ...lines,
  ].join("\n");
}
