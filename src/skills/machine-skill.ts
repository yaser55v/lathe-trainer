/**
 * MachineSkill
 * ============
 * Single source of runtime truth for machine state.
 * Provides clean, structured facts so the LLM never guesses machine status.
 */

import type { SceneContext } from "../services/scene-context";
import { MACHINE_COMPONENTS } from "../machine/machine-map";

export interface MachineContext {
  doorOpen: boolean | undefined;
  doorSettled: boolean;
  spindleRunning: boolean;
  activeMode: string | undefined;
  selectedComponent: string | undefined;
  /** Total number of registered components */
  componentCount: number;
  /** Formatted one-line summary for prompt injection */
  summary: string;
}

export class MachineSkill {
  /**
   * Extract clean machine state from SceneContext.
   * Returns deterministic facts — no LLM reasoning required.
   */
  getContext(sceneContext: SceneContext): MachineContext {
    const state = sceneContext.machineState ?? {};
    const doorOpen = state.doorOpen;
    const doorSettled = state.doorSettled !== false;
    const spindleRunning = state.spindleRunning ?? false;
    const activeMode = state.activeMode;
    const selectedComponent = sceneContext.selectedComponent;

    const parts: string[] = [];
    if (doorOpen !== undefined) {
      const doorStatus = doorOpen ? (doorSettled ? "OPEN" : "OPENING") : (doorSettled ? "CLOSED" : "CLOSING");
      parts.push(`door: ${doorStatus}`);
    }
    parts.push(`spindle: ${spindleRunning ? "RUNNING" : "OFF"}`);
    if (activeMode) parts.push(`mode: ${activeMode}`);
    if (selectedComponent) parts.push(`focused: ${selectedComponent}`);

    return {
      doorOpen,
      doorSettled,
      spindleRunning,
      activeMode,
      selectedComponent,
      componentCount: MACHINE_COMPONENTS.length,
      summary: parts.length > 0 ? parts.join(", ") : "state unknown",
    };
  }

  /**
   * Get a component by its display name or ID.
   * Deterministic lookup — no LLM inference needed.
   */
  getComponent(nameOrId: string) {
    const lower = nameOrId.toLowerCase();
    return (
      MACHINE_COMPONENTS.find(
        (c) => c.id === lower || c.displayName.toLowerCase() === lower,
      ) ?? null
    );
  }
}
