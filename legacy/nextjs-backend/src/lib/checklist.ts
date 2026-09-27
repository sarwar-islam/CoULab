// ============================================================================
// Document checklist comparison (B4 assisted intake, T6 document agent).
// The checklist baseline comes from constants.CHECKLISTS (published case-type
// requirements). Unclear content is SURFACED, never guessed (T6 guardrail).
// ============================================================================

import { CHECKLISTS } from "@/lib/constants";

export interface ChecklistGap {
  label: string;
  required: boolean;
  state: "MISSING" | "PRESENT" | "UNCLEAR";
  matchedDocumentId?: string;
  note?: string;
}

export function buildChecklist(caseType: string) {
  return CHECKLISTS[caseType] ?? CHECKLISTS.OTHER;
}

/**
 * Compare uploaded documents against the case-type checklist.
 * A document "covers" a checklist item when its title/docType matches the
 * item's keyword mapping. Items explicitly flagged UNCLEAR stay UNCLEAR.
 */
export function compareWithChecklist(
  caseType: string,
  documents: { id: string; title: string; docType: string; status: string }[],
): ChecklistGap[] {
  const checklist = buildChecklist(caseType);
  const active = documents.filter((d) => d.status !== "SUPERSEDED");
  return checklist.map((item) => {
    // keyword mapping: first parenthesis group holds the English/Bangla hint
    const keywords = extractKeywords(item.label);
    const match = active.find((d) => {
      const hay = `${d.title} ${d.docType}`.toLowerCase();
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
    return { label: item.label, required: item.required, state: "PRESENT", matchedDocumentId: match.id, note: item.note };
  });
}

function extractKeywords(label: string): string[] {
  // Label format: "বাংলা-বর্ণনা (english hint)" — keywords are drawn from BOTH
  // the Bangla prefix (before the parenthesis) and the hints inside it, so a
  // document titled in either language matches.
  const prefix = label.replace(/\([^)]*\)/g, " ");
  const inside = label.match(/\(([^)]+)\)/)?.[1] ?? "";
  const parts = [...prefix.split(/[/,]/), ...inside.split(/[/,]/)];
  return parts
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}
