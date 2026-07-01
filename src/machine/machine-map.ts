/**
 * machine-map.ts
 * ==============
 * Single source of truth for the 6 CNC lathe components visible in the scene.
 *
 * Used by:
 *   - ExploreSystem  — wires panel cards and builds EdgesGeometry outlines
 *   - AssistantService — injects the component list into the system prompt
 *   - ActionRegistry  — generates HIGHLIGHT_* action tokens from IDs
 *   - SceneContext     — records which component is currently highlighted
 */

export interface MachineComponent {
  /** Stable identifier, also used to derive the action token (upper-snake) */
  id: string;
  /** Human-readable label shown in UI cards and spoken by the assistant */
  displayName: string;
  /** Object3D names inside the lathe GLB that belong to this component */
  meshNames: string[];
  /** Action token the AI can emit to highlight this component — derived from id */
  highlightAction: string;
  /** Short description injected into the system prompt */
  description: string;
  /** Element id of the card in explore-panel.uikitml */
  cardId: string;
  /** 3D position of component center in world space (for spatial awareness) */
  position: { x: number; y: number; z: number };
  /** Approximate radius for proximity detection (in meters) */
  proximityRadius: number;
}

export const MACHINE_COMPONENTS: MachineComponent[] = [
  {
    id: "chuck",
    displayName: "Chuck",
    meshNames: ["chuck"],
    highlightAction: "HIGHLIGHT_CHUCK",
    description: "Spindle clamping device — holds and rotates the workpiece at high speed.",
    cardId: "card-chuck",
    position: { x: -1.20, y: 1.00, z: -3.02 },
    proximityRadius: 1.07,
  },
  {
    id: "tailstock",
    displayName: "Tailstock",
    meshNames: ["tailstock"],
    highlightAction: "HIGHLIGHT_TAILSTOCK",
    description: "Supports long workpieces from the opposing end of the spindle; houses live centers and drill chucks.",
    cardId: "card-tailstock",
    position: { x: -0.34, y: 0.85, z: -3.06 },
    proximityRadius: 1.06,
  },
  {
    id: "door",
    displayName: "Safety Door",
    meshNames: ["door", "door_glass", "handle"],
    highlightAction: "HIGHLIGHT_DOOR",
    description: "Automatic sliding safety enclosure — prevents chip ejection and accidental contact during machining.",
    cardId: "card-door",
    position: { x: -0.84, y: 1.22, z: -2.88 },
    proximityRadius: 2.15,
  },
  {
    id: "control_panel",
    displayName: "Control Panel",
    meshNames: ["screen", "keyboard", "screen_joint"],
    highlightAction: "HIGHLIGHT_CONTROL_PANEL",
    description: "CNC operator interface — Fanuc-style keyboard, MDI panel, and the main status display.",
    cardId: "card-panel",
    position: { x: 0.23, y: 1.49, z: -1.97 },
    proximityRadius: 1.13,
  },
  {
    id: "tool_turret",
    displayName: "Tool Turret",
    meshNames: ["tool_turret_box", "tool_turret_desk"],
    highlightAction: "HIGHLIGHT_TOOL_TURRET",
    description: "12-station servo turret with 6 live-tool positions; indexes in under 0.2 s.",
    cardId: "card-tool-turret",
    position: { x: -0.24, y: 1.44, z: -3.45 },
    proximityRadius: 1.54,
  },
  {
    id: "chip_conveyor",
    displayName: "Chip Conveyor",
    meshNames: ["chip_conveyor"],
    highlightAction: "HIGHLIGHT_CHIP_CONVEYOR",
    description: "Automated swarf removal system — continuous belt carries chips to a collection bin.",
    cardId: "card-chip-conveyor",
    position: { x: 1.36, y: 1.03, z: -2.91 },
    proximityRadius: 2.68,
  },
];

/**
 * Build the action-token block injected into the system prompt.
 * Lists every HIGHLIGHT_* token with a one-line description.
 */
export function buildMachineMapActionBlock(): string {
  const lines = MACHINE_COMPONENTS.map(
    (c) =>
      `  - [ACTION:${c.highlightAction}]  — highlights the ${c.displayName} in the 3D scene`,
  );
  lines.push(
    "  - [ACTION:HIGHLIGHT_CLEAR]  — removes all active highlights",
    "  - [ACTION:DEMO_HOW_IT_WORKS]  — starts the automated component tour demo",
  );
  return lines.join("\n");
}
