// ============================================================================
// T8 — Multi-agent case-triage pipeline.
// At least three specialised components (per case PDF):
//   A1 CategorisationAgent — case type + applicable service path
//   A2 ComplianceAgent    — process/jurisdiction/document checks
//   A3 OrchestratorAgent  — priority + routing recommendation, conflict surfacing
//
// GUARDRAILS: explainability = concise structured reasons/evidence (no hidden
// chain-of-thought); final priority/routing remains human-reviewable; the
// system never makes the eligibility decision.
// ============================================================================

import { CASE_TYPES, CASE_TYPE_IDS, JURISDICTIONS } from "@/lib/constants";

export interface TriageEvidence {
  reason: string;
  evidence: string;
}

export interface AgentResult {
  agent: string;
  output: string;
  evidence: TriageEvidence[];
  confidence: number; // 0-100
}

export interface OrchestrationResult extends AgentResult {
  recommendedPriority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  recommendedJurisdiction: string;
  conflicts: string[]; // surfaced disagreements between agents
}

const URGENCY_CASE_TYPES = ["DOMESTIC_VIOLENCE", "CYBER_HARASSMENT", "DOWRY"];

/** Agent 1 — categorisation: maps the narrative to the published case-type list. */
export function categorisationAgent(input: {
  caseType: string;
  narrative: string;
  applicantDistrict: string;
}): AgentResult {
  const evidence: TriageEvidence[] = [];
  const knownType = CASE_TYPE_IDS.includes(input.caseType as never);
  evidence.push({
    reason: "প্রকাশিত কেস-টাইপ তালিকার সাথে মিল",
    evidence: `caseType=${input.caseType}${knownType ? "" : " (তালিকাভুক্ত নয় — মানুষের পর্যালোচনা প্রয়োজন)"}`,
  });
  const urgencySignal = URGENCY_CASE_TYPES.includes(input.caseType);
  if (urgencySignal) {
    evidence.push({
      reason: "এই কেস-টাইপে জরুরি হস্তক্ষেপের ঝুঁকি-সংকেত",
      evidence: `${input.caseType} শ্রেণি সাধারণত দ্রুত মানব-পর্যালোচনার প্রয়োজন হয়`,
    });
  }
  const sensitiveWords = ["ছবি", "image", "photo", "ভিডিও", "video", "spread", "ছড়া"];
  const hit = sensitiveWords.filter((w) => input.narrative.toLowerCase().includes(w));
  if (hit.length > 0) {
    evidence.push({
      reason: "সংবেদনশীল উপাদানের সংকেত ন্যারেটিভে পাওয়া গেছে",
      evidence: `উল্লিখিত শব্দ: ${hit.join(", ")}`,
    });
  }
  return {
    agent: "CategorisationAgent",
    output: knownType ? input.caseType : "REVIEW_REQUIRED",
    evidence,
    confidence: knownType ? (urgencySignal ? 72 : 85) : 30,
  };
}

/** Agent 2 — compliance/process: jurisdiction fit, docs, procedural checks. */
export function complianceAgent(input: {
  caseType: string;
  officeDistrict: string;
  applicantDistrict: string;
  requiredDocsPresent: number;
  requiredDocsTotal: number;
}): AgentResult {
  const evidence: TriageEvidence[] = [];
  // Jurisdiction suggestion from the published routing list
  let jurisdiction = "DISTRICT_DLAO";
  if (input.caseType === "LABOUR_WAGES") jurisdiction = "LABOUR_LEGAL_AID_CELL";
  if (input.caseType === "CYBER_HARASSMENT") jurisdiction = "CYBER_TRIBUNAL_ROUTE";
  evidence.push({
    reason: "প্রকাশিত রাউটিং তালিকা অনুযায়ী এখতিয়ার-প্রস্তাব",
    evidence: `${input.caseType} -> ${jurisdiction} (${JURISDICTIONS.find((j) => j.id === jurisdiction)?.label ?? jurisdiction})`,
  });

  if (input.officeDistrict !== input.applicantDistrict) {
    evidence.push({
      reason: "আবেদনকারীর জেলা ও কার্যালয়ের জেলা ভিন্ন — রেফারেল প্রয়োজন হতে পারে",
      evidence: `office=${input.officeDistrict}, applicant=${input.applicantDistrict}`,
    });
  }
  const docsOk = input.requiredDocsTotal === 0 || input.requiredDocsPresent >= input.requiredDocsTotal;
  evidence.push({
    reason: docsOk ? "প্রয়োজনীয় নথি সম্পূর্ণ বলে মনে হচ্ছে" : "প্রয়োজনীয় নথি অসম্পূর্ণ",
    evidence: `${input.requiredDocsPresent}/${input.requiredDocsTotal} প্রয়োজনীয় নথি পাওয়া গেছে`,
  });
  return {
    agent: "ComplianceAgent",
    output: docsOk ? "PROCESS_OK" : "DOCS_INCOMPLETE",
    evidence,
    confidence: docsOk ? 80 : 55,
  };
}

/** Agent 3 — orchestrator: merges both agents, surfaces disagreements, recommends. */
export function orchestrate(input: {
  categorisation: AgentResult;
  compliance: AgentResult;
  urgencyFlag: boolean;
  sensitiveFlag: boolean;
}): OrchestrationResult {
  const conflicts: string[] = [];
  const ev: TriageEvidence[] = [];

  // Example of surfaced disagreement: urgency signal vs low process confidence
  const urgencySignal = URGENCY_CASE_TYPES.includes(input.categorisation.output);
  if (urgencySignal && input.compliance.output === "DOCS_INCOMPLETE") {
    conflicts.push(
      "CategorisationAgent জরুরি প্রক্রিয়াকরণের সংকেত দিয়েছে, কিন্তু ComplianceAgent নথি অসম্পূর্ণ জানিয়েছে — মানব-পর্যালোচনা প্রয়োজন।",
    );
  }
  if (input.sensitiveFlag && input.compliance.output === "PROCESS_OK") {
    conflicts.push(
      "সংবেদনশীল-উপাদান পতাকা রয়েছে, তবু ComplianceAgent প্রক্রিয়া স্বাভাবিক জানিয়েছে — প্রবেশাধিকার সীমিতকরণ যাচাই করুন।",
    );
  }

  let priority: OrchestrationResult["recommendedPriority"] = "MEDIUM";
  if (input.urgencyFlag || input.sensitiveFlag) priority = "URGENT";
  else if (urgencySignal) priority = "HIGH";
  ev.push({
    reason: "অগ্রাধিকার-সুপারিশের ভিত্তি",
    evidence: `urgencyFlag=${input.urgencyFlag}, sensitiveFlag=${input.sensitiveFlag}, caseTypeSignal=${urgencySignal}`,
  });

  const jurisdiction =
    input.categorisation.output === "LABOUR_WAGES"
      ? "LABOUR_LEGAL_AID_CELL"
      : input.categorisation.output === "CYBER_HARASSMENT"
        ? "CYBER_TRIBUNAL_ROUTE"
        : "DISTRICT_DLAO";

  return {
    agent: "OrchestratorAgent",
    output: `প্রস্তাবিত অগ্রাধিকার: ${priority}; প্রস্তাবিত এখতিয়ার: ${jurisdiction}`,
    evidence: [...ev, ...input.categorisation.evidence.slice(0, 2), ...input.compliance.evidence.slice(0, 2)],
    confidence: Math.min(input.categorisation.confidence, input.compliance.confidence),
    recommendedPriority: priority,
    recommendedJurisdiction: jurisdiction,
    conflicts,
  };
}

/** Full pipeline run (rule-based components; deterministic + auditable). */
export function runTriagePipeline(input: {
  caseType: string;
  narrative: string;
  applicantDistrict: string;
  officeDistrict: string;
  requiredDocsPresent: number;
  requiredDocsTotal: number;
  urgencyFlag: boolean;
  sensitiveFlag: boolean;
}): { categorisation: AgentResult; compliance: AgentResult; orchestration: OrchestrationResult } {
  const categorisation = categorisationAgent(input);
  const compliance = complianceAgent(input);
  const orchestration = orchestrate({
    categorisation,
    compliance,
    urgencyFlag: input.urgencyFlag,
    sensitiveFlag: input.sensitiveFlag,
  });
  return { categorisation, compliance, orchestration };
}
