// ============================================================================
// T6 — Document Summarization & Checklist Agent.
// Produces a concise briefing of uploaded documents, compares against the
// case-type checklist, flags missing/uncertain items, and SOURCES every
// material summary point to a document (provenance).
//
// Guardrails (case PDF):
//  - Unclear content must be surfaced, not guessed.
//  - The officer verifies the briefing (AI_INFERRED provenance).
// ============================================================================

import { aiChat, parseJsonLoose } from "@/lib/ai/zai";
import { compareWithChecklist, ChecklistGap } from "@/lib/checklist";

export interface BriefingPoint {
  point: string;
  sourceDocumentTitle: string; // every material point is sourced
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

export interface DocumentBriefing {
  summaryBn: string;
  points: BriefingPoint[];
  checklist: ChecklistGap[];
  aiAvailable: boolean;
  failureReason?: string;
  generatedAt: string;
}

const SYSTEM_PROMPT = `তুমি আইনি নথি-বিশ্লেষণ সহকারী (DLAS T6)। তুমি কর্মকর্তার জন্য সংক্ষিপ্ত ব্রিফিং তৈরি করো।
নিয়ম:
১. শুধু প্রদত্ত নথির পাঠ্য থেকে তথ্য নাও — কখনো অনুমান/পূরণ করো না।
২. অস্পষ্ট বা অপঠনযোগ্য অংশ থাকলে স্পষ্টভাবে "অস্পষ্ট" বলো।
৩. প্রতিটি গুরুত্বপূর্ণ বিন্দুর উৎস নথির শিরোনাম দাও।
৪. উত্তর শুধু এই JSON গঠনে দাও:
{"summary":"৩-৫ বাক্যের বাংলা সারাংশ","points":[{"point":"...","source":"নথির শিরোনাম","confidence":"HIGH|MEDIUM|LOW"}]}
৫. সর্বোচ্চ ৮টি বিন্দু।`;

export async function buildDocumentBriefing(
  caseType: string,
  documents: { id: string; title: string; docType: string; status: string; textContent?: string | null }[],
): Promise<DocumentBriefing> {
  const checklist = compareWithChecklist(
    caseType,
    documents.map((d) => ({ id: d.id, title: d.title, docType: d.docType, status: d.status })),
  );

  if (documents.length === 0) {
    return {
      summaryBn: "বিশ্লেষণের জন্য কোনো নথি জমা হয়নি। প্রয়োজনীয় নথি তালিকা নিচে দেখুন।",
      points: [],
      checklist,
      aiAvailable: true,
      generatedAt: new Date().toISOString(),
    };
  }

  const docText = documents
    .map((d) => {
      const unreadable = d.status === "UNCLEAR" || !d.textContent?.trim();
      return `=== নথি: ${d.title} (ধরন: ${d.docType}, অবস্থা: ${d.status}) ===\n${
        unreadable ? "[এই নথির পাঠ্য অপঠনযোগ্য/অনুপস্থিত — স্পষ্টভাবে অস্পষ্ট বলো, অনুমান করো না]" : d.textContent!.slice(0, 3000)
      }`;
    })
    .join("\n\n");

  const result = await aiChat(SYSTEM_PROMPT, `কেস-টাইপ: ${caseType}\n\nনথিসমূহ:\n${docText}`);

  if (!result.aiAvailable) {
    return {
      summaryBn:
        "এআই ব্রিফিং এই মুহূর্তে উপলব্ধ নয় (" +
        (result.failureReason ?? "AI_UNAVAILABLE") +
        ")। চেকলিস্ট তুলনাটি নিয়ম-ভিত্তিক ইঞ্জিন দিয়ে নিচে দেখানো হয়েছে — কর্মকর্তাকে নথি স্বয়ং পরীক্ষা করতে হবে।",
      points: [],
      checklist,
      aiAvailable: false,
      failureReason: result.failureReason,
      generatedAt: new Date().toISOString(),
    };
  }

  const parsed = parseJsonLoose<{ summary?: string; points?: { point?: string; source?: string; confidence?: string }[] }>(result.text);
  if (!parsed?.summary) {
    return {
      summaryBn: "এআই প্রতিক্রিয়া পড়া যায়নি (AI_JSON_UNPARSEABLE) — কোনো অনুমান করা হয়নি। নিচের নিয়ম-ভিত্তিক চেকলিস্ট দেখুন।",
      points: [],
      checklist,
      aiAvailable: false,
      failureReason: "AI_JSON_UNPARSEABLE",
      generatedAt: new Date().toISOString(),
    };
  }

  return {
    summaryBn: parsed.summary,
    points: (parsed.points ?? []).slice(0, 8).map((p) => ({
      point: p.point ?? "",
      sourceDocumentTitle: p.source ?? "উৎস উল্লেখ নেই",
      confidence: (["HIGH", "MEDIUM", "LOW"].includes(p.confidence ?? "") ? p.confidence : "MEDIUM") as BriefingPoint["confidence"],
    })),
    checklist,
    aiAvailable: true,
    generatedAt: new Date().toISOString(),
  };
}
