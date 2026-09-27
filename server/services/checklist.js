// ============================================================================
// Document Checklist Comparison (B4 assisted intake, T6 document agent).
// ============================================================================
'use strict';

const { CHECKLISTS } = require('../constants');

function buildChecklist(caseType) {
  return CHECKLISTS[caseType] || CHECKLISTS.OTHER;
}

function extractKeywords(label) {
  const prefix = label.replace(/\([^)]*\)/g, " ");
  const inside = label.match(/\(([^)]+)\)/)?.[1] || "";
  const parts = `${prefix} ${inside}`
    .split(/[\s,/]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3);
  return [...new Set(parts)];
}

function compareWithChecklist(caseType, documents) {
  const checklist = buildChecklist(caseType);
  const active = (documents || []).filter((d) => d.status !== "SUPERSEDED");

  return checklist.map((item) => {
    const keywords = extractKeywords(item.label);
    const match = active.find((d) => {
      const hay = `${d.title || ''} ${d.docType || ''}`.toLowerCase();
      return keywords.some((k) => hay.includes(k.toLowerCase()));
    });

    if (!match) {
      return { label: item.label, required: item.required, state: "MISSING", note: item.note };
    }
    if (match.status === "UNCLEAR") {
      return {
        label: item.label,
        required: item.required,
        state: "UNCLEAR",
        matchedDocumentId: match.id,
        note: "নথিটি পড়া যায়নি / অস্পষ্ট — অনুমান করা হয়নি (T6 guardrail)",
      };
    }
    return {
      label: item.label,
      required: item.required,
      state: "PRESENT",
      matchedDocumentId: match.id,
      note: item.note,
    };
  });
}

module.exports = {
  buildChecklist,
  compareWithChecklist,
};
