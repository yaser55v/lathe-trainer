/**
 * AssistantContext
 * ================
 * Context manager that delegates prompt building to PromptBuilder.
 * Wires Skill outputs into PromptBuilder before each request.
 * Provides query methods for scene state and component information.
 */

import type { SceneContext } from "./scene-context";
import { MACHINE_COMPONENTS } from "../machine/machine-map";
import { PromptBuilder } from "./prompt-builder";
import { SpatialSkill } from "../skills/spatial-skill";
import { SafetySkill } from "../skills/safety-skill";
import { MachineSkill } from "../skills/machine-skill";
import { SalesSkill } from "../skills/sales-skill";
import { TrainingSkill } from "../skills/training-skill";
import { LearnerMemorySkill } from "../skills/learner-memory-skill";
import { MaintenanceSkill } from "../skills/maintenance-skill";

export interface AssistantContextOptions {
  /** Raw knowledge base text loaded from CNC_Knowledge.md */
  knowledgeBase: string;
  /** Live scene state reference — any ECS system can update this */
  sceneContext: SceneContext;
}

export class AssistantContext {
  private promptBuilder: PromptBuilder;
  private sceneContext: SceneContext;

  // ─── Skills ────────────────────────────────────────────────────────────────
  private spatialSkill = new SpatialSkill();
  private safetySkill = new SafetySkill();
  private machineSkill = new MachineSkill();
  private salesSkill = new SalesSkill();
  private trainingSkill = new TrainingSkill();
  readonly learnerMemory = new LearnerMemorySkill();
  private maintenanceSkill = new MaintenanceSkill();

  /** Last user query — set by AssistantService before getSystemPrompt() */
  private lastQuery = "";

  constructor(opts: AssistantContextOptions) {
    this.promptBuilder = new PromptBuilder(opts.knowledgeBase, MACHINE_COMPONENTS);
    this.sceneContext = opts.sceneContext;
  }

  /**
   * Called by AssistantService before building the payload so the
   * MaintenanceSkill can analyse the current query deterministically.
   */
  setLastQuery(query: string): void {
    this.lastQuery = query;
  }

  /**
   * Build the complete system prompt using PromptBuilder.
   * Skills compute deterministic facts first — LLM receives results, not raw data.
   * Conversation history is handled separately in the messages array.
   */
  getSystemPrompt(): string {
    this.promptBuilder.updateSceneContext(this.sceneContext);

    // Compute skill outputs — all synchronous, no LLM involvement
    const spatial = this.spatialSkill.getContext(this.sceneContext);
    const safety = this.safetySkill.getContext(this.sceneContext, spatial);
    const sales = this.salesSkill.getContext();
    const learnerProfile = this.learnerMemory.getProfile();
    const training = this.trainingSkill.getContext(
      learnerProfile.completedLessons,
      learnerProfile.skillLevel,
      learnerProfile.safetyScore,
    );
    const learnerMemoryBlock = this.learnerMemory.buildPromptBlock();

    // Maintenance — keyword-gated, only runs on relevant queries
    const maintenance = this.maintenanceSkill.analyze({
      query: this.lastQuery,
      sceneContext: this.sceneContext,
      selectedComponent: this.sceneContext.selectedComponent,
    });

    // Inject into PromptBuilder
    this.promptBuilder.updateSkillInputs({
      spatial,
      safety,
      sales,
      training,
      learnerMemoryBlock,
      preferredLanguage: learnerProfile.language,
      maintenance,
    });

    return this.promptBuilder.build();
  }

  /**
   * Get information about a specific component by ID.
   */
  getComponentInfo(componentId: string) {
    return MACHINE_COMPONENTS.find((c) => c.id === componentId);
  }

  /**
   * Get the currently highlighted component from scene state.
   */
  getCurrentlyHighlighted(): string | undefined {
    return this.sceneContext.selectedComponent;
  }

  /**
   * Check if an action is valid and can be performed.
   * Delegates to SafetySkill for deterministic evaluation.
   */
  canPerformAction(actionName: string): boolean {
    const spatial = this.spatialSkill.getContext(this.sceneContext);
    const check = this.safetySkill.evaluateOperation(actionName, this.sceneContext, spatial);
    return check.allowed;
  }

  /**
   * Get current machine state summary.
   */
  getMachineState() {
    return this.machineSkill.getContext(this.sceneContext);
  }

  /**
   * Get user position.
   */
  getUserPosition() {
    return this.sceneContext.userPosition;
  }
}
