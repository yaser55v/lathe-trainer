/**
 * ActionRegistry
 * ==============
 * Maps action token strings (from the AI) to callable world functions.
 *
 * This is intentionally minimal — a plain Map with a safe execute() method.
 * Actions are registered from index.ts after all systems are initialized.
 *
 * To add a future action:
 *   registry.register("HIGHLIGHT_TURRET", () => highlightSystem.highlight("turret"));
 */

export class ActionRegistry {
  private readonly actions = new Map<string, () => void>();

  /** Register an action by its token name */
  register(name: string, fn: () => void): void {
    this.actions.set(name, fn);
  }

  /** Execute an action by name. Silently ignores unknown actions. */
  execute(name: string): void {
    const fn = this.actions.get(name);
    if (fn) {
      console.log(`[ActionRegistry] Executing: "${name}"`);
      try {
        fn();
      } catch (e) {
        console.error(`[ActionRegistry] Error executing action "${name}":`, e);
      }
    } else {
      console.warn(`[ActionRegistry] Unknown action: "${name}". Registered: [${[...this.actions.keys()].join(", ")}]`);
    }
  }

  has(name: string): boolean {
    return this.actions.has(name);
  }
}
