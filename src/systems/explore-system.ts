/**
 * ExploreSystem
 * =============
 * Drives the in-world machine explorer panel (explore-panel.json).
 *
 * Responsibilities:
 *   - Wire panel card clicks → highlight a machine component
 *   - Manage EdgesGeometry cyan-outline overlays for each component
 *   - Expose public highlightComponent(id) + clearHighlights() so the AI /
 *     demos can drive highlights without touching the panel UI
 *   - Implement HighlightChannel so RobotPresenter can route highlight events
 *
 * Component definitions live in machine-map.ts — this file never hard-codes
 * mesh names or card IDs.
 */

import {
  Color,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  Object3D,
  PanelDocument,
  PanelUI,
  Types,
  createComponent,
  createSystem,
  eq,
} from "@iwsdk/core";
import type { UIKitDocument } from "@iwsdk/core";
import { signal } from "@preact/signals-core";
import type { Signal } from "@preact/signals-core";

import { MACHINE_COMPONENTS } from "../machine/machine-map";
import type { HighlightChannel } from "../robot/robot-presenter";

// ---------------------------------------------------------------------------
// Outline constants
// ---------------------------------------------------------------------------
const OUTLINE_COLOR = new Color(0x00d4ff);
const EDGE_THRESHOLD_DEG = 15; // degrees — skip micro-facet edges below this

// ---------------------------------------------------------------------------
// Unused component kept for potential future use
// ---------------------------------------------------------------------------
export const ExplorePanel = createComponent("ExplorePanel", {
  selectedCardIndex: { type: Types.Int32, default: -1 },
});

// ---------------------------------------------------------------------------
// Per-component EdgesGeometry cache entry
// ---------------------------------------------------------------------------
interface OutlineCache {
  lines: LineSegments[];
}

// ---------------------------------------------------------------------------
// ExploreSystem
// ---------------------------------------------------------------------------
export class ExploreSystem
  extends createSystem({
    explorePanels: {
      required: [PanelUI, PanelDocument],
      where: [eq(PanelUI, "config", "./ui/explore-panel.json")],
    },
  })
  implements HighlightChannel
{
  readonly panelVisible: Signal<boolean> = signal(false);

  /** LineSegments currently displayed — cleared on clearHighlights() */
  private outlineLines: LineSegments[] = [];

  /** Pre-built cache: componentId → array of LineSegments (hidden by default) */
  private outlineCache = new Map<string, OutlineCache>();

  /** Shared line material */
  private lineMat!: LineBasicMaterial;

  /** Currently highlighted component id, or null */
  private activeComponentId: string | null = null;

  private cacheBuilt = false;

  // ─── HighlightChannel interface ──────────────────────────────────────────

  highlight(componentId: string): void {
    this.highlightComponent(componentId);
  }

  clearAll(): void {
    this.clearHighlights();
  }

  // ─── Public API (called by ActionRegistry / demo runner) ─────────────────

  /** Highlight a component by its machine-map id */
  highlightComponent(id: string): void {
    this.clearHighlights();
    const component = MACHINE_COMPONENTS.find((c) => c.id === id);
    if (!component) {
      console.warn(`[ExploreSystem] Unknown component id: "${id}"`);
      return;
    }
    const idx = MACHINE_COMPONENTS.indexOf(component);

    // Use cache if ready, otherwise build on demand
    if (this.cacheBuilt) {
      this.showCached(id);
    } else {
      this.buildOutlineFromDefs(component.meshNames);
    }

    this.activeComponentId = id;

    // Update scene context
    const ctx = (this.world.globals as any).sceneContext;
    if (ctx) ctx.selectedComponent = component.displayName;

    // Sync panel card selection if panel is visible
    this.syncPanelSelection(idx);
  }

  /** Remove all active highlights */
  clearHighlights(): void {
    // If cache is built, just hide cached lines instead of disposing
    if (this.cacheBuilt) {
      for (const entry of this.outlineCache.values()) {
        for (const ls of entry.lines) ls.visible = false;
      }
    } else {
      // Legacy path: dispose ad-hoc lines
      for (const lines of this.outlineLines) {
        (lines.geometry as EdgesGeometry).dispose();
        this.scene.remove(lines);
      }
      this.outlineLines = [];
    }

    this.activeComponentId = null;

    // Clear scene context
    const ctx = (this.world.globals as any).sceneContext;
    if (ctx) ctx.selectedComponent = undefined;

    // Deselect panel cards
    this.syncPanelSelection(-1);
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  init() {
    this.lineMat = new LineBasicMaterial({
      color: OUTLINE_COLOR,
      depthTest: true,
      transparent: true,
      opacity: 0.9,
    });

    this.cleanupFuncs.push(
      this.panelVisible.subscribe((visible: boolean) => {
        const explorePanelObj = (this.world.globals as any)
          .vmExplorePanelObject3D as Object3D | undefined;
        if (explorePanelObj) explorePanelObj.visible = visible;

        for (const entity of this.queries.explorePanels.entities) {
          if (entity.object3D) entity.object3D.visible = visible;
        }
        if (!visible) this.clearHighlights();
      }),
    );

    this.queries.explorePanels.subscribe("qualify", (entity) => {
      this.wirePanel(entity.index);
    });
    for (const entity of this.queries.explorePanels.entities) {
      this.wirePanel(entity.index);
    }

    // Pre-compute outline cache once latheMachine is in globals
    // (it's set synchronously before registerSystem — should be ready in init)
    this.tryBuildCache();
  }

  // ─── Cache pre-computation ────────────────────────────────────────────────

  private tryBuildCache(): void {
    const latheMachine = (this.world.globals as any).latheMachine as
      | Object3D
      | undefined;
    if (!latheMachine) return;

    for (const component of MACHINE_COMPONENTS) {
      const lines: LineSegments[] = [];

      for (const meshName of component.meshNames) {
        const obj = latheMachine.getObjectByName(meshName);
        if (!obj) continue;

        obj.traverse((child: any) => {
          if (!child.isMesh || !child.geometry) return;

          const edges = new EdgesGeometry(child.geometry, EDGE_THRESHOLD_DEG);
          const ls = new LineSegments(edges, this.lineMat);

          ls.matrixAutoUpdate = false;
          child.updateWorldMatrix(true, false);
          ls.matrix.copy(child.matrixWorld);
          ls.matrixWorld.copy(child.matrixWorld);
          ls.visible = false; // hidden until requested

          this.scene.add(ls);
          lines.push(ls);
        });
      }

      this.outlineCache.set(component.id, { lines });
    }

    this.cacheBuilt = true;
    console.log(`[ExploreSystem] EdgesGeometry cache built for ${MACHINE_COMPONENTS.length} components.`);
  }

  // ─── Show/hide cached outlines ────────────────────────────────────────────

  private showCached(id: string): void {
    const entry = this.outlineCache.get(id);
    if (!entry) return;
    for (const ls of entry.lines) ls.visible = true;
  }

  // ─── Ad-hoc outline build (fallback before cache) ─────────────────────────

  private buildOutlineFromDefs(meshNames: string[]): void {
    const latheMachine = (this.world.globals as any).latheMachine as
      | Object3D
      | undefined;
    if (!latheMachine) return;

    for (const meshName of meshNames) {
      const obj = latheMachine.getObjectByName(meshName);
      if (!obj) continue;

      obj.traverse((child: any) => {
        if (!child.isMesh || !child.geometry) return;

        const edges = new EdgesGeometry(child.geometry, EDGE_THRESHOLD_DEG);
        const ls = new LineSegments(edges, this.lineMat);

        ls.matrixAutoUpdate = false;
        child.updateWorldMatrix(true, false);
        ls.matrix.copy(child.matrixWorld);
        ls.matrixWorld.copy(child.matrixWorld);

        this.scene.add(ls);
        this.outlineLines.push(ls);
      });
    }
  }

  // ─── Panel wiring ─────────────────────────────────────────────────────────

  private wirePanel(entityIndex: number): void {
    const doc = PanelDocument.data.document[entityIndex] as
      | UIKitDocument
      | undefined;
    if (!doc) return;

    doc.getElementById("explore-close")?.addEventListener("click", () => {
      this.panelVisible.value = false;
      this.clearHighlights();
    });

    MACHINE_COMPONENTS.forEach((component, index) => {
      doc.getElementById(component.cardId)?.addEventListener(
        "click",
        () => {
          if (this.activeComponentId === component.id) {
            this.clearHighlights();
          } else {
            this.highlightComponent(component.id);
          }
        },
      );
    });
  }

  // ─── Panel card sync ──────────────────────────────────────────────────────

  private syncPanelSelection(activeIndex: number): void {
    // Find any active panel doc
    for (const entity of this.queries.explorePanels.entities) {
      const doc = PanelDocument.data.document[entity.index] as
        | UIKitDocument
        | undefined;
      if (!doc) continue;
      this.setCardSelected(doc, activeIndex);
    }
  }

  // ---------------------------------------------------------------------------
  // Card selected-state styling — Meta Horizon check indicator pattern
  // ---------------------------------------------------------------------------
  private setCardSelected(doc: UIKitDocument, activeIndex: number): void {
    const checkIds = [
      "check-chuck",
      "check-tailstock",
      "check-door",
      "check-panel",
      "check-tool-turret",
      "check-chip-conveyor",
    ];

    MACHINE_COMPONENTS.forEach((component, index) => {
      const active = index === activeIndex;

      doc.getElementById(component.cardId)?.setProperties(
        active
          ? {
              borderColor: "#ffffff",
              borderOpacity: 0.35 as any,
              backgroundColor: "#444444",
              backgroundOpacity: 1,
            }
          : {
              borderColor: "#ffffff",
              borderOpacity: 0.08 as any,
              backgroundColor: "#373737",
              backgroundOpacity: 1,
            },
      );

      doc.getElementById(checkIds[index])?.setProperties(
        active
          ? { backgroundColor: "#ffffff", backgroundOpacity: 0.92 }
          : { backgroundColor: undefined, backgroundOpacity: 0 },
      );
    });
  }
}
