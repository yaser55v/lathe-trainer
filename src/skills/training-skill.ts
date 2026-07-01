/**
 * TrainingSkill
 * =============
 * Tracks lesson progress and training state.
 * Provides deterministic facts so the LLM never guesses what the learner has covered.
 *
 * Currently provides a foundation for future guided learning.
 * Lesson completion is persisted via LearnerMemorySkill.
 */

export type LessonId =
  | "machine_intro"
  | "door_safety"
  | "spindle_operation"
  | "tool_turret"
  | "control_panel"
  | "chip_conveyor"
  | "tailstock";

export type SkillLevel = "beginner" | "intermediate" | "advanced";

export interface TrainingContext {
  currentLesson: LessonId | null;
  completedLessons: LessonId[];
  skillLevel: SkillLevel;
  safetyScore: number;       // 0–100
  totalLessons: number;
  progressPercent: number;
  /** Short summary for prompt injection */
  summary: string;
}

const ALL_LESSONS: LessonId[] = [
  "machine_intro",
  "door_safety",
  "spindle_operation",
  "tool_turret",
  "control_panel",
  "chip_conveyor",
  "tailstock",
];

export class TrainingSkill {
  /**
   * Build a training context snapshot from completed lessons and skill level.
   * Called by PromptBuilder — deterministic, no LLM involvement.
   */
  getContext(
    completedLessons: LessonId[],
    skillLevel: SkillLevel,
    safetyScore: number,
    currentLesson: LessonId | null = null,
  ): TrainingContext {
    const total = ALL_LESSONS.length;
    const completed = completedLessons.length;
    const progressPercent = Math.round((completed / total) * 100);

    const summaryParts: string[] = [
      `skill: ${skillLevel}`,
      `progress: ${completed}/${total} lessons`,
      `safety score: ${safetyScore}/100`,
    ];
    if (currentLesson) summaryParts.push(`current: ${currentLesson}`);

    return {
      currentLesson,
      completedLessons,
      skillLevel,
      safetyScore,
      totalLessons: total,
      progressPercent,
      summary: summaryParts.join(", "),
    };
  }

  /**
   * Build a compact prompt block for PromptBuilder.
   * Only injected when training context is meaningful.
   */
  buildPromptBlock(ctx: TrainingContext): string {
    if (ctx.completedLessons.length === 0 && ctx.skillLevel === "beginner") {
      return "Learner: new user, no completed lessons yet.";
    }

    const lines: string[] = [
      `Learner level: ${ctx.skillLevel}`,
      `Completed lessons: ${ctx.completedLessons.join(", ") || "none"}`,
      `Safety score: ${ctx.safetyScore}/100`,
      `Progress: ${ctx.progressPercent}%`,
    ];
    if (ctx.currentLesson) {
      lines.push(`Current lesson: ${ctx.currentLesson}`);
    }
    return lines.join("\n");
  }

  /** All available lesson IDs */
  get allLessons(): LessonId[] {
    return [...ALL_LESSONS];
  }
}
