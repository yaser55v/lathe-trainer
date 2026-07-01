/**
 * LearnerMemorySkill
 * ==================
 * Lightweight persistent learner profile stored in localStorage.
 * This is NOT chat history. It is TRAINING MEMORY — structured facts only.
 *
 * Storage budget: < 50KB per learner (enforced by capping mistake history).
 * Never stores full conversations. Facts only.
 *
 * Quest 3 constraints:
 * - localStorage only (no IndexedDB, no server, no embeddings)
 * - Synchronous reads/writes
 * - Minimal memory footprint
 */

import type { LessonId, SkillLevel } from "./training-skill";

export type SupportedLang = "en" | "it" | "ar" | "fr" | "de" | "es" | "pt" | "ja" | "zh" | "hi" | "ru";

export interface LearnerProfile {
  /** Explicitly selected or detected language */
  language: SupportedLang;
  skillLevel: SkillLevel;
  completedLessons: LessonId[];
  /** Short fact strings — e.g. "struggled with tool offsets" */
  commonMistakes: string[];
  /** 0–100 safety compliance score */
  safetyScore: number;
  /** ISO date string of last session */
  lastSession: string;
  /** Session count — used to infer engagement level */
  sessionCount: number;
}

const STORAGE_KEY = "xr_learner_profile";
const MAX_MISTAKES = 10; // cap to keep storage under 50KB

const DEFAULT_PROFILE: LearnerProfile = {
  language: "en",
  skillLevel: "beginner",
  completedLessons: [],
  commonMistakes: [],
  safetyScore: 100,
  lastSession: "",
  sessionCount: 0,
};

export class LearnerMemorySkill {
  private profile: LearnerProfile;

  constructor() {
    this.profile = this.load();
  }

  // ─── Read ────────────────────────────────────────────────────────────────

  getProfile(): LearnerProfile {
    return { ...this.profile };
  }

  /**
   * Build a compact prompt block for PromptBuilder injection.
   * Only includes fields that are meaningful — no noise on first session.
   */
  buildPromptBlock(): string {
    const p = this.profile;
    if (p.sessionCount === 0) return "";

    const lines: string[] = ["LEARNER MEMORY (from previous sessions):"];
    lines.push(`Language: ${p.language}`);
    lines.push(`Level: ${p.skillLevel}`);
    if (p.completedLessons.length > 0) {
      lines.push(`Completed: ${p.completedLessons.join(", ")}`);
    }
    if (p.commonMistakes.length > 0) {
      lines.push(`Known struggles: ${p.commonMistakes.join("; ")}`);
    }
    lines.push(`Safety score: ${p.safetyScore}/100`);
    lines.push(`Sessions: ${p.sessionCount}`);
    return lines.join("\n");
  }

  // ─── Write ───────────────────────────────────────────────────────────────

  /** Call at the start of each session to update timestamp and counter */
  startSession(detectedLanguage?: SupportedLang): void {
    this.profile.sessionCount += 1;
    this.profile.lastSession = new Date().toISOString();
    this.save();
  }

  setLanguage(lang: SupportedLang): void {
    this.profile.language = lang;
    this.save();
  }

  markLessonComplete(lessonId: LessonId): void {
    if (!this.profile.completedLessons.includes(lessonId)) {
      this.profile.completedLessons.push(lessonId);
      this.save();
    }
  }

  recordMistake(fact: string): void {
    // Deduplicate and cap
    if (!this.profile.commonMistakes.includes(fact)) {
      this.profile.commonMistakes.push(fact);
      if (this.profile.commonMistakes.length > MAX_MISTAKES) {
        // Drop oldest mistake
        this.profile.commonMistakes.shift();
      }
      this.save();
    }
  }

  updateSafetyScore(score: number): void {
    this.profile.safetyScore = Math.max(0, Math.min(100, score));
    this.save();
  }

  updateSkillLevel(level: SkillLevel): void {
    this.profile.skillLevel = level;
    this.save();
  }

  /** Wipe all learner data — call on explicit user request only */
  reset(): void {
    this.profile = { ...DEFAULT_PROFILE };
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // localStorage not available (Quest 3 private mode etc.) — silent fail
    }
  }

  // ─── Persistence ─────────────────────────────────────────────────────────

  private load(): LearnerProfile {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_PROFILE };
      const parsed = JSON.parse(raw) as Partial<LearnerProfile>;
      // Merge with defaults to handle schema evolution
      return { ...DEFAULT_PROFILE, ...parsed };
    } catch {
      return { ...DEFAULT_PROFILE };
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
    } catch {
      // Storage full or unavailable — silent fail, no crash
    }
  }
}
