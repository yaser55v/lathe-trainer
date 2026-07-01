/**
 * SalesSkill
 * ==========
 * Authoritative source for all commercial and financial data.
 * The LLM must NEVER calculate ROI, invent pricing, or estimate costs from scratch.
 * All numbers come from here — deterministic, auditable, zero hallucination risk.
 */

export interface SalesContext {
  basePriceRange: [number, number];
  currency: "EUR";
  maintenancePercent: [number, number];
  estimatedAnnualMaintenance: [number, number];
  efficiencyGains: {
    setupTimeSavedMinutes: number;
    toolChangeSub05s: boolean;
    precisionMm: number;
    throughputIncreaseFactor: number;
    scratchRateReductionPercent: number;
  };
  roiExamples: {
    dailyTimeSavedMinutes: number;
    annualHoursSaved: number;
    costPerPartReduction: string;
  };
  commercialArguments: {
    tcoVsCheapAlternative: string;
    downtimeCostAdvantage: string;
    precisionValueProp: string;
  };
  disclaimer: string;
}

/** Hardcoded commercial data — update this object when official figures change */
const SALES_DATA: SalesContext = {
  basePriceRange: [150_000, 220_000],
  currency: "EUR",
  maintenancePercent: [10, 15],
  // 10% of low end, 15% of high end → annual maintenance band
  estimatedAnnualMaintenance: [15_000, 33_000],
  efficiencyGains: {
    setupTimeSavedMinutes: 42,       // vs. manual lathe per shift
    toolChangeSub05s: true,          // turret index time < 0.5s
    precisionMm: 0.005,              // ±0.005mm dimensional tolerance
    throughputIncreaseFactor: 3,     // 3× part throughput vs. manual lathe
    scratchRateReductionPercent: 80, // typical scrap reduction after CNC adoption
  },
  roiExamples: {
    dailyTimeSavedMinutes: 42,
    annualHoursSaved: Math.round((42 / 60) * 250), // 250 working days
    costPerPartReduction: "up to 60% reduction in cost-per-part at volume",
  },
  commercialArguments: {
    tcoVsCheapAlternative:
      "Lower-priced alternatives typically require 2× more maintenance and have 3× higher unplanned downtime costs over a 5-year period, offsetting the initial price difference.",
    downtimeCostAdvantage:
      "One unplanned downtime event on a manual lathe can cost 4–8 hours of production. This machine's predictive maintenance architecture targets less than 0.5% unplanned downtime annually.",
    precisionValueProp:
      "At ±0.005mm tolerance, one avoided scrap run on a high-value aerospace or medical component can recover weeks of machine lease cost.",
  },
  disclaimer:
    "Final integration costs depend on factory options. Request a formal quote at [website]/quote. ROI examples are estimates based on industry benchmarks.",
};

export class SalesSkill {
  /**
   * Return the full sales context object.
   * Consumed by PromptBuilder to inject authoritative commercial data.
   */
  getContext(): SalesContext {
    return SALES_DATA;
  }

  /**
   * Build a compact prompt block with key financial facts.
   * Keeps token count low while preventing hallucination on numbers.
   */
  buildPromptBlock(): string {
    const d = SALES_DATA;
    const lines: string[] = [
      "AUTHORITATIVE COMMERCIAL DATA (use these exact figures — never invent your own):",
      `Base price range: ${d.basePriceRange[0].toLocaleString()}€ – ${d.basePriceRange[1].toLocaleString()}€`,
      `Annual maintenance: ${d.estimatedAnnualMaintenance[0].toLocaleString()}€ – ${d.estimatedAnnualMaintenance[1].toLocaleString()}€ (${d.maintenancePercent[0]}–${d.maintenancePercent[1]}% of equipment value)`,
      `Setup time saved per shift vs manual lathe: ${d.efficiencyGains.setupTimeSavedMinutes} minutes`,
      `Tool change time: under 0.5 seconds`,
      `Dimensional precision: ±${d.efficiencyGains.precisionMm}mm`,
      `Throughput increase vs manual lathe: ${d.efficiencyGains.throughputIncreaseFactor}×`,
      `Scrap rate reduction: up to ${d.efficiencyGains.scratchRateReductionPercent}%`,
      `Annual hours saved: ~${d.roiExamples.annualHoursSaved}h (based on ${d.roiExamples.dailyTimeSavedMinutes} min/day, 250 working days)`,
      `Disclaimer: ${d.disclaimer}`,
    ];
    return lines.join("\n");
  }
}
