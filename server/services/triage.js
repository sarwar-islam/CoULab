// ============================================================================
// T8 — Multi-agent Case-Triage Pipeline.
//   1. CategorisationAgent — case type + applicable service path
//   2. ComplianceAgent     — process/jurisdiction/document checks
//   3. OrchestratorAgent   — priority + routing recommendation, conflict surfacing
// ============================================================================
'use strict';

const { CASE_TYPE_IDS, JURISDICTIONS } = require('../constants');

const URGENCY_CASE_TYPES = ["DOMESTIC_VIOLENCE", "CYBER_HARASSMENT", "DOWRY"];

function categorisationAgent(input) {
  const evidence = [];
  const knownType = CASE_TYPE_IDS.includes(input.caseType);
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
  const sensitiveWords = ["ছবি", "image", "photo", "ভিডিও", "video", "spread", "ছড়া", "হুমকি", "মারধর"];
  const text = (input.narrative || "").toLowerCase();
  const hit = sensitiveWords.filter((w) => text.includes(w));
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

function complianceAgent(input) {
  const evidence = [];
  let jurisdiction = "DISTRICT_DLAO";
  if (input.caseType === "LABOUR_WAGES") jurisdiction = "LABOUR_LEGAL_AID_CELL";
  if (input.caseType === "CYBER_HARASSMENT") jurisdiction = "CYBER_TRIBUNAL_ROUTE";
  evidence.push({
    reason: "প্রকাশিত রাউটিং তালিকা অনুযায়ী এখতিয়ার-প্রস্তাব",
    evidence: `${input.caseType} -> ${jurisdiction} (${JURISDICTIONS.find((j) => j.id === jurisdiction)?.label || jurisdiction})`,
  });

  if (input.officeDistrict && input.applicantDistrict && input.officeDistrict !== input.applicantDistrict) {
    evidence.push({
      reason: "আবেদনকারীর জেলা ও কার্যালয়ের জেলা ভিন্ন — রেফারেল প্রয়োজন হতে পারে",
      evidence: `office=${input.officeDistrict}, applicant=${input.applicantDistrict}`,
    });
  }
  const docsOk = !input.requiredDocsTotal || input.requiredDocsPresent >= input.requiredDocsTotal;
  evidence.push({
    reason: docsOk ? "প্রয়োজনীয় নথি সম্পূর্ণ বলে মনে হচ্ছে" : "প্রয়োজনীয় নথি অসম্পূর্ণ",
    evidence: `${input.requiredDocsPresent || 0}/${input.requiredDocsTotal || 0} প্রয়োজনীয় নথি পাওয়া গেছে`,
  });
  return {
    agent: "ComplianceAgent",
    output: docsOk ? "PROCESS_OK" : "DOCS_INCOMPLETE",
    evidence,
    confidence: docsOk ? 80 : 55,
  };
}

function orchestrate(input) {
  const conflicts = [];
  const ev = [];

  const urgencySignal = URGENCY_CASE_TYPES.includes(input.categorisation.output);
  if (urgencySignal && input.compliance.output === "DOCS_INCOMPLETE") {
    conflicts.push(
      "CategorisationAgent জরুরি প্রক্রিয়াকরণের সংকেত দিয়েছে, কিন্তু ComplianceAgent নথি অসম্পূর্ণ জানিয়েছে — মানব-পর্যালোচনা প্রয়োজন।"
    );
  }
  if (input.sensitiveFlag && input.compliance.output === "PROCESS_OK") {
    conflicts.push(
      "সংবেদনশীল-উপাদান পতাকা রয়েছে, তবু ComplianceAgent প্রক্রিয়া স্বাভাবিক জানিয়েছে — প্রবেশাধিকার সীমিতকরণ যাচাই করুন।"
    );
  }

  let priority = "MEDIUM";
  if (input.urgencyFlag || input.sensitiveFlag) priority = "URGENT";
  else if (urgencySignal) priority = "HIGH";
  ev.push({
    reason: "অগ্রাধিকার-সুপারিশের ভিত্তি",
    evidence: `urgencyFlag=${!!input.urgencyFlag}, sensitiveFlag=${!!input.sensitiveFlag}, caseTypeSignal=${urgencySignal}`,
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

function runTriagePipeline(input) {
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

module.exports = {
  categorisationAgent,
  complianceAgent,
  orchestrate,
  runTriagePipeline,
};
