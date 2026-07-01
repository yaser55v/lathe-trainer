/**
 * MaintenanceSkill
 * ================
 * Deterministic maintenance and troubleshooting analyser.
 * Scans user queries for known symptom keywords and maps them to
 * a structured MaintenanceAnalysis — no LLM involvement.
 *
 * Architecture: Skill First Principle
 *   - This skill is authoritative. The LLM explains but never overrides.
 *   - failureType, escalationLevel, safeToContinueOperation are immutable by LLM.
 *
 * Future extensions (architecture placeholders included):
 *   - Alarm code database
 *   - Maintenance manuals
 *   - OCR label/screen reading
 *   - Vibration / audio anomaly analysis
 *   - Predictive maintenance
 */

import type { SceneContext } from "../services/scene-context";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FailureType =
  | "mechanical"
  | "electrical"
  | "hydraulic"
  | "software"
  | "safety"
  | "unknown";

export type EscalationLevel =
  | "operator"       // Operator can self-resolve
  | "maintenance"    // In-house maintenance team required
  | "certified_service"; // OEM/certified service technician required

export interface MaintenanceAnalysis {
  /** Category of the likely failure */
  failureType: FailureType;
  /** Overall urgency */
  severity: "low" | "medium" | "high" | "critical";
  /** Most likely root causes, ranked by probability */
  probableCauses: string[];
  /** Who needs to act */
  escalationLevel: EscalationLevel;
  /** Whether continued production is safe */
  safeToContinueOperation: boolean;
  /** Rough repair time estimate if known */
  estimatedRepairTime?: string;
  /** Step-by-step operator guidance */
  recommendedActions: string[];
  /** Component IDs from machine-map that are involved */
  relatedComponents: string[];
  /** 0–1 confidence in the diagnosis */
  confidence: number;
}

export interface MaintenanceAnalysisInput {
  query: string;
  sceneContext: SceneContext;
  selectedComponent?: string;
  screenshot?: string | null;
  conversationHistory?: Array<{ role: string; content: string }>;
}

// ─── Alarm Code Placeholder (future extension) ────────────────────────────────

/**
 * Alarm code database — extend this map as you document your specific machine.
 * Key: alarm code string (e.g. "301", "E-301")
 * Value: partial analysis to merge into the result
 */
const ALARM_CODES: Record<string, Partial<MaintenanceAnalysis>> = {
  "300": { failureType: "mechanical", severity: "high", probableCauses: ["Spindle speed error", "Spindle drive fault"], escalationLevel: "certified_service", safeToContinueOperation: false },
  "301": { failureType: "mechanical", severity: "high", probableCauses: ["Spindle overload", "Spindle motor fault", "Excessive cutting force"], escalationLevel: "certified_service", safeToContinueOperation: false, recommendedActions: ["Stop machine immediately", "Check cutting parameters", "Inspect spindle motor and drive", "Contact certified service technician"] },
  "401": { failureType: "electrical", severity: "high", probableCauses: ["Servo axis overload", "Servo drive fault"], escalationLevel: "certified_service", safeToContinueOperation: false },
  "404": { failureType: "electrical", severity: "critical", probableCauses: ["Servo motor encoder fault", "Feedback signal lost"], escalationLevel: "certified_service", safeToContinueOperation: false },
  "700": { failureType: "electrical", severity: "high", probableCauses: ["Overheat in control unit", "Cooling fan failure"], escalationLevel: "maintenance", safeToContinueOperation: false, estimatedRepairTime: "1–2 hours" },
  "701": { failureType: "electrical", severity: "high", probableCauses: ["Overheat in spindle amplifier"], escalationLevel: "certified_service", safeToContinueOperation: false },
  "900": { failureType: "software", severity: "medium", probableCauses: ["ROM parity error", "CNC memory fault"], escalationLevel: "certified_service", safeToContinueOperation: false },
  "910": { failureType: "software", severity: "critical", probableCauses: ["DRAM parity error — memory corruption"], escalationLevel: "certified_service", safeToContinueOperation: false },
  "1": { failureType: "safety", severity: "critical", probableCauses: ["TH alarm — tape reader error or incorrect character"], escalationLevel: "operator", safeToContinueOperation: false },
  "5": { failureType: "software", severity: "medium", probableCauses: ["Too many digits in CNC block"], escalationLevel: "operator", safeToContinueOperation: false, recommendedActions: ["Check the active NC programme for syntax errors"] },
};

// ─── Symptom Table ────────────────────────────────────────────────────────────

interface SymptomRule {
  keywords: string[];
  analysis: Omit<MaintenanceAnalysis, "relatedComponents" | "confidence">;
}

const SYMPTOM_RULES: SymptomRule[] = [
  // 1. HYDRAULIC
  {
    keywords: ["hydraulic", "oil pressure", "hydraulic pressure", "oil leak", "hydraulic leak", "oil level"],
    analysis: {
      failureType: "hydraulic",
      severity: "high",
      probableCauses: [
        "Low hydraulic oil level",
        "Hydraulic pressure sensor fault",
        "Hydraulic pump failure",
        "Oil leak in hydraulic circuit",
      ],
      escalationLevel: "certified_service",
      safeToContinueOperation: false,
      estimatedRepairTime: "2–4 hours",
      recommendedActions: [
        "Stop machine immediately",
        "Inspect hydraulic oil reservoir level",
        "Check for visible oil leaks around the machine base",
        "Check alarm history on control panel",
        "Do not restart until technician inspects hydraulic circuit",
      ],
    },
  },

  // 2. SPINDLE
  {
    keywords: ["spindle fault", "spindle vibration", "spindle noise", "spindle alarm", "spindle error", "spindle stopped"],
    analysis: {
      failureType: "mechanical",
      severity: "high",
      probableCauses: [
        "Spindle bearing wear or failure",
        "Spindle motor overload",
        "Imbalanced workpiece or tooling",
        "Spindle drive fault",
      ],
      escalationLevel: "certified_service",
      safeToContinueOperation: false,
      estimatedRepairTime: "4–8 hours",
      recommendedActions: [
        "Stop spindle and do not restart",
        "Check if workpiece or tool is correctly balanced",
        "Inspect alarm code on control panel",
        "Contact certified service technician",
      ],
    },
  },

  // 3. EMERGENCY STOP / SAFETY CIRCUIT
  {
    keywords: ["emergency stop", "e-stop", "estop", "safety circuit", "safety interlock", "safety fault"],
    analysis: {
      failureType: "safety",
      severity: "critical",
      probableCauses: [
        "E-Stop button physically pressed",
        "Safety door interlock fault",
        "Safety relay failure",
        "Wiring fault in safety circuit",
      ],
      escalationLevel: "certified_service",
      safeToContinueOperation: false,
      recommendedActions: [
        "Do NOT attempt to bypass the safety circuit",
        "Verify E-Stop button is physically released (twist and pull)",
        "Inspect safety door is fully closed and latched",
        "Check alarm history for root cause",
        "If E-Stop was not manually triggered, call certified service technician immediately",
      ],
    },
  },

  // 4. DOOR INTERLOCK
  {
    keywords: ["door interlock", "door alarm", "door fault", "door sensor", "door open alarm"],
    analysis: {
      failureType: "safety",
      severity: "high",
      probableCauses: [
        "Safety door sensor misaligned or dirty",
        "Door latch mechanism faulty",
        "Safety relay or wiring fault",
      ],
      escalationLevel: "maintenance",
      safeToContinueOperation: false,
      estimatedRepairTime: "1–2 hours",
      recommendedActions: [
        "Ensure door is fully closed and latched",
        "Clean door sensor area of chips and debris",
        "Inspect door sensor alignment",
        "If fault persists, call maintenance team",
      ],
    },
  },

  // 5. COOLANT / CHIP CONVEYOR
  {
    keywords: ["coolant", "chip conveyor", "chips", "swarf", "coolant level", "coolant alarm", "conveyor jam"],
    analysis: {
      failureType: "mechanical",
      severity: "low",
      probableCauses: [
        "Low coolant level",
        "Chip conveyor jam",
        "Coolant filter clogged",
        "Coolant pump fault",
      ],
      escalationLevel: "operator",
      safeToContinueOperation: true,
      estimatedRepairTime: "15–30 minutes",
      recommendedActions: [
        "Pause production and open coolant access panel",
        "Check coolant reservoir level and refill if needed",
        "Inspect chip conveyor for blockages — clear with appropriate tool",
        "Check coolant filter and clean or replace if required",
        "Restart conveyor from control panel",
      ],
    },
  },

  // 6. SCREEN / DISPLAY
  {
    keywords: ["screen black", "black screen", "display off", "monitor off", "screen not working", "panel dark"],
    analysis: {
      failureType: "electrical",
      severity: "medium",
      probableCauses: [
        "Display power supply issue",
        "E-Stop active — machine in safe hold",
        "Screen saver or power-save mode active",
        "Display cable or backlight fault",
      ],
      escalationLevel: "operator",
      safeToContinueOperation: false,
      estimatedRepairTime: "15–60 minutes",
      recommendedActions: [
        "Check if E-Stop button is engaged — release if so",
        "Touch control panel screen to wake from power-save mode",
        "Verify main power supply is on",
        "Check display cable connections at back of panel",
        "If screen is still off, call maintenance team",
      ],
    },
  },

  // 7. GENERIC ALARM / ERROR
  {
    keywords: ["alarm", "error", "fault", "error code", "alarm code"],
    analysis: {
      failureType: "unknown",
      severity: "medium",
      probableCauses: [
        "Machine-specific alarm — check alarm number on control panel",
        "Possible overload, sensor fault, or programme error",
      ],
      escalationLevel: "maintenance",
      safeToContinueOperation: false,
      recommendedActions: [
        "Note the exact alarm code displayed on the control panel",
        "Check alarm history log on the CNC controller",
        "Consult machine alarm manual for the specific code",
        "Do not attempt to reset and continue without understanding the cause",
        "Contact maintenance team if cause is unclear",
      ],
    },
  },

  // 8. TOOL WEAR / BROKEN TOOL
  {
    keywords: ["tool wear", "tool broken", "tool chipped", "broken tool", "tool damage", "insert worn", "cutting tool"],
    analysis: {
      failureType: "mechanical",
      severity: "medium",
      probableCauses: [
        "Tool insert has reached end of life",
        "Incorrect cutting parameters (speed, feed, depth)",
        "Workpiece material harder than expected",
        "Tool collision or crash",
      ],
      escalationLevel: "operator",
      safeToContinueOperation: false,
      estimatedRepairTime: "10–30 minutes",
      recommendedActions: [
        "Stop the programme and retract the tool",
        "Inspect tool visually for damage or wear",
        "Replace insert or tool if worn or broken",
        "Verify cutting parameters match workpiece material",
        "Check workpiece surface for damage before restarting",
      ],
    },
  },

  // 9. TEMPERATURE / OVERHEATING
  {
    keywords: ["temperature", "overheat", "overheating", "thermal alarm", "hot", "heat alarm", "temperature alarm"],
    analysis: {
      failureType: "mechanical",
      severity: "high",
      probableCauses: [
        "Inadequate coolant flow to cutting zone",
        "Spindle or axis motor overload",
        "Electrical cabinet cooling fan failure",
        "Ambient temperature too high",
      ],
      escalationLevel: "certified_service",
      safeToContinueOperation: false,
      estimatedRepairTime: "1–4 hours",
      recommendedActions: [
        "Stop machine and allow to cool down",
        "Check coolant flow rate and direction",
        "Inspect electrical cabinet cooling fans",
        "Verify ambient workshop temperature is within machine specification",
        "Do not restart until temperature is within normal range",
        "Call certified service if overheating repeats",
      ],
    },
  },

  // 10. POWER LOSS
  {
    keywords: ["no power", "power loss", "power failure", "power cut", "machine off", "power outage", "power down"],
    analysis: {
      failureType: "electrical",
      severity: "critical",
      probableCauses: [
        "Main power supply interrupted",
        "Main circuit breaker tripped",
        "UPS failure",
        "Internal electrical fault",
      ],
      escalationLevel: "certified_service",
      safeToContinueOperation: false,
      recommendedActions: [
        "Do NOT attempt to manually reset electrical cabinet components",
        "Check if main circuit breaker has tripped at distribution panel",
        "Verify workshop power supply is stable",
        "Contact certified electrical technician before restoring power",
        "Inspect machine for visible damage before restart",
      ],
    },
  },
];

// ─── Maintenance keywords for query gating ───────────────────────────────────

const MAINTENANCE_KEYWORDS = [
  "alarm", "fault", "error", "vibration", "noise", "broken", "pressure",
  "overheat", "leak", "smoke", "black screen", "power", "spindle", "hydraulic",
  "coolant", "conveyor", "tool wear", "temperature", "e-stop", "estop",
  "interlock", "display", "stopped", "crash", "problem", "issue", "trouble",
  "warning", "not working", "failed", "failure",
];

// ─── MaintenanceSkill ─────────────────────────────────────────────────────────

export class MaintenanceSkill {
  /**
   * Returns true if the query likely relates to a maintenance issue.
   * Used by AssistantContext to gate skill execution (token-efficient).
   */
  isMaintenanceQuery(query: string): boolean {
    const lower = query.toLowerCase();
    return MAINTENANCE_KEYWORDS.some((kw) => lower.includes(kw));
  }

  /**
   * Main entry point — deterministic symptom analysis.
   * Pure computation. No LLM. No side effects.
   */
  analyze(input: MaintenanceAnalysisInput): MaintenanceAnalysis | null {
    if (!this.isMaintenanceQuery(input.query)) return null;

    const lower = input.query.toLowerCase();

    // 1. Try alarm code extraction first (future-ready)
    const alarmMatch = lower.match(/alarm\s*(\d+)|error\s*(\d+)|code\s*(\d+)/);
    if (alarmMatch) {
      const code = alarmMatch[1] ?? alarmMatch[2] ?? alarmMatch[3];
      const knownAlarm = ALARM_CODES[code];
      if (knownAlarm) {
        return this.buildResult(knownAlarm, input.selectedComponent, 0.9);
      }
    }

    // 2. Scan symptom rules
    for (const rule of SYMPTOM_RULES) {
      if (rule.keywords.some((kw) => lower.includes(kw))) {
        return this.buildResult(rule.analysis, input.selectedComponent, 0.75);
      }
    }

    // 3. Generic fallback — unknown symptom
    return {
      failureType: "unknown",
      severity: "medium",
      probableCauses: ["Unknown symptom — manual inspection required"],
      escalationLevel: "maintenance",
      safeToContinueOperation: false,
      recommendedActions: [
        "Stop production and document the symptom carefully",
        "Check alarm history on the control panel",
        "Contact maintenance team for inspection",
      ],
      relatedComponents: [],
      confidence: 0.3,
    };
  }

  /**
   * Serialize a MaintenanceAnalysis into a compact prompt block.
   * The LLM receives this as ground truth — it must NOT override it.
   */
  buildPromptBlock(analysis: MaintenanceAnalysis): string {
    const lines: string[] = [
      `Failure type: ${analysis.failureType.toUpperCase()}`,
      `Severity: ${analysis.severity.toUpperCase()}`,
      `Escalation: ${analysis.escalationLevel}`,
      `Safe to continue operation: ${analysis.safeToContinueOperation ? "YES" : "NO — STOP MACHINE"}`,
    ];

    if (analysis.estimatedRepairTime) {
      lines.push(`Estimated repair time: ${analysis.estimatedRepairTime}`);
    }

    lines.push(`Confidence: ${Math.round(analysis.confidence * 100)}%`);

    lines.push("Probable causes:");
    for (const cause of analysis.probableCauses) {
      lines.push(`  - ${cause}`);
    }

    lines.push("Recommended actions:");
    analysis.recommendedActions.forEach((action, i) => {
      lines.push(`  ${i + 1}. ${action}`);
    });

    lines.push("");
    lines.push("AUTHORITY RULE: The LLM must explain these findings in natural language but must NEVER");
    lines.push("override failureType, severity, escalationLevel, or safeToContinueOperation.");
    lines.push("Physical repairs remain the responsibility of certified personnel.");

    return lines.join("\n");
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private buildResult(
    partial: Partial<MaintenanceAnalysis>,
    selectedComponent?: string,
    confidence = 0.75,
  ): MaintenanceAnalysis {
    const related: string[] = [];
    if (selectedComponent) related.push(selectedComponent);

    return {
      failureType: partial.failureType ?? "unknown",
      severity: partial.severity ?? "medium",
      probableCauses: partial.probableCauses ?? [],
      escalationLevel: partial.escalationLevel ?? "maintenance",
      safeToContinueOperation: partial.safeToContinueOperation ?? false,
      estimatedRepairTime: partial.estimatedRepairTime,
      recommendedActions: partial.recommendedActions ?? [],
      relatedComponents: related,
      confidence,
    };
  }
}
