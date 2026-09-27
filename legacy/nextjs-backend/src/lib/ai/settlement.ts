// ============================================================================
// T7 — Settlement Agreement Drafting Assistant.
// Turns mediator notes into a draft grounded in an APPROVED template,
// marks AI-filled/inferred sections, flags internal inconsistencies, and
// requires explicit human review.
//
// Guardrails (case PDF): the output is a DRAFT. Human legal review, party
// understanding/consent and applicable formalities remain mandatory.
// ============================================================================

import { aiChat, parseJsonLoose } from "@/lib/ai/zai";
import { SETTLEMENT_TEMPLATES } from "@/lib/constants";

export interface AiSegment {
  text: string; // exact span that is AI-inferred
  reason: string;
}
export interface DraftWarning {
  warning: string;
  severity: "HIGH" | "MEDIUM";
}

export interface SettlementDraftResult {
  draftText: string;
  aiSegments: AiSegment[];
  warnings: DraftWarning[];
  templateType: string;
  aiAvailable: boolean;
  failureReason?: string;
}

/** Approved templates (illustrative, aligned with the case PDF's three
 *  scenarios: maintenance, property, labour). These are the ONLY bases. */
export const TEMPLATE_STORE: Record<string, { titleBn: string; clauses: string[] }> = {
  MAINTENANCE: {
    titleBn: "ভরণপোষণ চুক্তি (প্যাটার্ন)",
    clauses: [
      "পক্ষগণের পূর্ণ নাম, ঠিকানা ও পরিচয়",
      "সন্তানের ভরণপোষণের মাসিক পরিমাণ ও পরিশোধের তারিখ",
      "পরিশোধের মাধ্যম (নগদ/বিকাশ/ব্যাংক) ও রসিদ সংরক্ষণ",
      "বকেয়ার ক্ষেত্রে পুনর্বিবেচনার পদ্ধতি",
      "পক্ষগণের স্বাক্ষর ও তারিখ; মধ্যস্থতাকারীর প্রত্যক্ষদর্শী স্বাক্ষর",
    ],
  },
  PROPERTY: {
    titleBn: "সম্পত্তি বিরোধ নিষ্পত্তি চুক্তি (প্যাটার্ন)",
    clauses: [
      "সম্পত্তির বিবরণ (দাগ নম্বর, খতিয়ান, পরিমাণ)",
      "পক্ষগণের সম্মতি ও অধিকারের ভিত্তি",
      "সীমানা নির্ধারণ ও দখল হস্তান্তরের সময়সীমা",
      "দলিল সংশোধন/রেজিস্ট্রেশন ব্যয়ভার",
      "পক্ষগণের স্বাক্ষর ও তারিখ; মধ্যস্থতাকারীর প্রত্যক্ষদর্শী স্বাক্ষর",
    ],
  },
  LABOUR: {
    titleBn: "শ্রম/মজুরি নিষ্পত্তি চুক্তি (প্যাটার্ন)",
    clauses: [
      "শ্রমিকের পরিচয় ও নিয়োগের বিবরণ",
      "বকেয়া মজুরি/ক্ষতিপূরণের মোট পরিমাণ ও হিসাবভিত্তি",
      "পরিশোধের সময়সীমা ও কিস্তি",
      "উভয় পক্ষের দাবি নিষ্পত্তির ঘোষণা",
      "পক্ষগণের স্বাক্ষর ও তারিখ; মধ্যস্থতাকারীর প্রত্যক্ষদর্শী স্বাক্ষর",
    ],
  },
};

const SYSTEM_PROMPT = `তুমি DLAS T7 নিষ্পত্তি-খসড়া সহকারী। মধ্যস্থতাকারীর নোট থেকে অনুমোদিত টেমপ্লেটের ভিত্তিতে খসড়া তৈরি করো।
নিয়ম:
১. শুধু নোটে দেওয়া তথ্য ব্যবহার করো; অনুপস্থিত তথ্যের জায়গায় [স্থানধারক: বর্ণনা] রাখো।
২. যে অংশ তুমি নিজে যুক্ত করেছ/অনুমান করেছ সেটি AI-অনুমিত তালিকায় হুবহু টেক্সটসহ দাও।
৩. নোটের মধ্যে অন্তর্নিহিত অসামঞ্জস্য (যেমন পরিমাণ ভিন্ন, তারিখ ভিন্ন, পক্ষ ভিন্ন) থাকলে সতর্কতা তালিকায় দাও।
৪. উত্তর শুধু এই JSON দাও:
{"draft":"...","aiSegments":[{"text":"...","reason":"..."}],"warnings":[{"warning":"...","severity":"HIGH|MEDIUM"}]}
৫. খসড়ার শেষে এই লাইনটি অবশ্যই থাকবে: "এই দলিল একটি খসড়া — মানব আইনি পর্যালোচনা, পক্ষের বোঝাপড়া ও সম্মতি ছাড়া চূড়ান্ত নয়।"`;

export async function draftSettlement(input: {
  templateType: string;
  mediatorNotes: string;
  caseId: string;
}): Promise<SettlementDraftResult> {
  const templateType = SETTLEMENT_TEMPLATES.includes(input.templateType as never)
    ? input.templateType
    : "MAINTENANCE";
  const template = TEMPLATE_STORE[templateType];

  const userPrompt = `কেস আইডি: ${input.caseId}
অনুমোদিত টেমপ্লেট: ${template.titleBn}
টেমপ্লেট ধারাসমূহ:
${template.clauses.map((c, i) => `${i + 1}. ${c}`).join("\n")}

মধ্যস্থতাকারীর নোট:
"""
${input.mediatorNotes.slice(0, 4000)}
"""`;

  const result = await aiChat(SYSTEM_PROMPT, userPrompt);

  if (!result.aiAvailable) {
    // Fail visibly: produce a template skeleton with explicit placeholders,
    // never silently fabricate agreed terms.
    return {
      draftText: `${template.titleBn}\n\n[এআই সহায়তা অনুপলব্ধ: ${result.failureReason ?? "AI_UNAVAILABLE"} — নিচে টেমপ্লেট কাঠামো ও মধ্যস্থতাকারীর নোট স্থাপন করা হয়েছে; কোনো শর্ত অনুমান করা হয়নি।]\n\nটেমপ্লেট ধারা:\n${template.clauses
        .map((c, i) => `${i + 1}. [স্থানধারক প্রয়োজন] — ${c}`)
        .join("\n")}\n\nমধ্যস্থতাকারীর নোট (হুবহু):\n${input.mediatorNotes}\n\nএই দলিল একটি খসড়া — মানব আইনি পর্যালোচনা, পক্ষের বোঝাপড়া ও সম্মতি ছাড়া চূড়ান্ত নয়।`,
      aiSegments: [],
      warnings: [
        {
          warning: `এআই অনুপলব্ধ (${result.failureReason ?? "AI_UNAVAILABLE"}) — খসড়া টেমপ্লেট-কাঠামোতে সীমাবদ্ধ; মানব-প্রণীত সম্পাদনা অপরিহার্য।`,
          severity: "HIGH",
        },
      ],
      templateType,
      aiAvailable: false,
      failureReason: result.failureReason,
    };
  }

  const parsed = parseJsonLoose<{ draft?: string; aiSegments?: AiSegment[]; warnings?: DraftWarning[] }>(result.text);
  if (!parsed?.draft) {
    return {
      draftText: `[এআই প্রতিক্রিয়া পার্স করা যায়নি (AI_JSON_UNPARSEABLE) — অনুমান করা হয়নি।]\n\nটেমপ্লেট ধারা:\n${template.clauses
        .map((c, i) => `${i + 1}. [স্থানধারক প্রয়োজন] — ${c}`)
        .join("\n")}\n\nএই দলিল একটি খসড়া — মানব আইনি পর্যালোচনা, পক্ষের বোঝাপড়া ও সম্মতি ছাড়া চূড়ান্ত নয়।`,
      aiSegments: [],
      warnings: [{ warning: "এআই প্রতিক্রিয়া অবিশ্বস্ত ছিল — খসড়া টেমপ্লেট-কাঠামোতে সীমাবদ্ধ।", severity: "HIGH" }],
      templateType,
      aiAvailable: false,
      failureReason: "AI_JSON_UNPARSEABLE",
    };
  }

  // Deterministic inconsistency spot-checks on top of the model's own warnings
  const warnings: DraftWarning[] = (parsed.warnings ?? []).map((w) => ({
    warning: w.warning,
    severity: w.severity === "HIGH" ? "HIGH" : "MEDIUM",
  }));
  const amountMatches = input.mediatorNotes.match(/(\d[\d,\.]*)\s*(টাকা|taka|৳)/gi);
  if (amountMatches && amountMatches.length > 1) {
    const unique = new Set(amountMatches.map((m) => m));
    if (unique.size > 1) {
      warnings.push({
        warning: `নোটে ভিন্ন ভিন্ন অর্থের পরিমাণ পাওয়া গেছে (${[...unique].join(" vs ")}) — চূড়ান্ত করার আগে নিশ্চিত করুন।`,
        severity: "HIGH",
      });
    }
  }
  if (!input.mediatorNotes.includes("তারিখ") && !/\d{2}\/\d{2}\/\d{4}/.test(input.mediatorNotes)) {
    warnings.push({ warning: "মধ্যস্থতার তারিখ নোটে পাওয়া যায়নি — চুক্তিতে তারিখ যোগ করতে হবে।", severity: "MEDIUM" });
  }

  return {
    draftText: parsed.draft,
    aiSegments: parsed.aiSegments ?? [],
    warnings,
    templateType,
    aiAvailable: true,
  };
}
