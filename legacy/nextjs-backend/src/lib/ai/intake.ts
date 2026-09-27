// ============================================================================
// T5 — Conversational Bangla Intake Agent.
// Natural Bangla multi-turn intake; slot-fills APPROVED fields only; asks
// clarifying questions; preserves provenance; hands sensitive/ambiguous cases
// to a human WITH context.
//
// Guardrails (case PDF):
//  - AI may explain/check published rules; it does NOT decide eligibility.
//  - Extracted facts must remain traceable and confirmable.
//  - Sensitive or ambiguous signals -> HUMAN_HANDOFF with full context.
// ============================================================================

import { aiChat, parseJsonLoose } from "@/lib/ai/zai";
import { CASE_TYPE_IDS, PUBLISHED_RULES } from "@/lib/constants";

export const APPROVED_SLOTS = [
  "citizenName",
  "district",
  "caseType",
  "narrative",
  "contactNumber",
] as const;
export type SlotKey = (typeof APPROVED_SLOTS)[number];
export type Slots = Partial<Record<SlotKey, string>>;

export interface IntakeTurnInput {
  transcript: { role: "user" | "agent"; text: string }[];
  slots: Slots;
  latestUserMessage: string;
}

export interface IntakeTurnOutput {
  reply: string; // Bangla reply shown/speaked to the citizen
  slots: Slots;
  newlyFilled: SlotKey[];
  sensitiveFlag: boolean;
  handoffReason: string | null;
  status: "IN_PROGRESS" | "AWAITING_CONFIRMATION" | "HUMAN_HANDOFF";
  aiAvailable: boolean;
}

const SENSITIVE_SIGNALS = [
  "আত্মহত্যা", "kill", "মারধর", "নির্যাতন", "assault", "rap", "ধর্ষণ",
  "গর্ভপাত", "threat", "হত্যার হুমকি", "জীবনের নিরাপত্তা", "child", "শিশু",
];

const AMBIGUOUS_SIGNALS = ["সম্ভবত", "মনে হয়", "নিশ্চিত নই", "পুলিশ নাকি", "হয়তো"];

function detectSignals(text: string) {
  const lower = text.toLowerCase();
  const sensitive = SENSITIVE_SIGNALS.filter((w) => lower.includes(w.toLowerCase()));
  const ambiguous = AMBIGUOUS_SIGNALS.filter((w) => lower.includes(w));
  return { sensitive, ambiguous };
}

const SYSTEM_PROMPT = `তুমি "দ্বার" — বাংলাদেশের জেলা আইনি সহায়তা কার্যালয়ের কথোপকথনমূলক ইনটেক সহকারী।
নিয়ম:
১. শুধু অনুমোদিত তথ্য-ক্ষেত্র বসাও: citizenName, district, caseType, narrative, contactNumber।
২. একবারে একটি স্পষ্ট প্রশ্ন করো, সহজ বাংলায়, সম্মানজনক ও নিরাপদ ভাষায়।
৩. যোগ্যতা যাচাই বা আইনি সিদ্ধান্ত কখনো নিও না; প্রকাশিত নিয়ম ব্যাখ্যা করতে পারো।
৪. প্রকাশিত নিয়ম: ${PUBLISHED_RULES.map((r) => r.textBn).join(" ")}
৫. উত্তর অবশ্যই এই JSON গঠনে দেবে, অন্য কিছু নয়:
{"reply":"...","slots":{"citizenName":"...","district":"...","caseType":"...","narrative":"...","contactNumber":"..."},"clarifyingQuestionNeeded":true|false}
কেস-টাইপ অবশ্যই এই তালিকা থেকে: ${CASE_TYPE_IDS.join(", ")}`;

/** One conversational turn. Never throws for AI failure — returns fallback. */
export async function intakeTurn(input: IntakeTurnInput): Promise<IntakeTurnOutput> {
  const { sensitive, ambiguous } = detectSignals(input.latestUserMessage);

  // Rule-first safety net: sensitive/ambiguous content hands off to a human
  // with context REGARDLESS of what the model says (deterministic guardrail).
  const mustHandoff = sensitive.length > 0 || ambiguous.length >= 2;

  const transcriptText = input.transcript
    .slice(-8)
    .map((m) => `${m.role === "user" ? "নাগরিক" : "সহকারী"}: ${m.text}`)
    .join("\n");

  const userPrompt = `কথোপকথন এ পর্যন্ত:
${transcriptText}

ইতিমধ্যে পাওয়া তথ্য: ${JSON.stringify(input.slots)}
নাগরিকের সর্বশেষ কথা: "${input.latestUserMessage}"

কাজ: অনুপস্থিত ক্ষেত্র চিহ্নিত করে পরবর্তী একটি প্রশ্ন করো; যা বলা হয়েছে তা slots-এ যোগ করো। সব ক্ষেত্র পূর্ণ হলে সারাংশ নিশ্চিত করতে বলো এবং clarifyingQuestionNeeded=false দাও। JSON-এই উত্তর দাও।`;

  const result = await aiChat(SYSTEM_PROMPT, userPrompt);
  let reply = "";
  let slots = { ...input.slots };
  let clarifying = true;

  if (result.aiAvailable) {
    const parsed = parseJsonLoose<{ reply?: string; slots?: Slots; clarifyingQuestionNeeded?: boolean }>(result.text);
    if (parsed?.reply) {
      reply = parsed.reply;
      // Only approved slots are ever merged — nothing else is persisted.
      const proposed = parsed.slots ?? {};
      for (const key of APPROVED_SLOTS) {
        if (proposed[key] && typeof proposed[key] === "string") slots[key] = proposed[key]!.slice(0, 2000);
      }
      clarifying = parsed.clarifyingQuestionNeeded !== false;
    } else {
      // Model output unparseable — treat as AI failure (fail visibly, not silently)
      return fallbackTurn(input, "AI_JSON_UNPARSEABLE");
    }
  } else {
    return fallbackTurn(input, result.failureReason ?? "AI_UNAVAILABLE");
  }

  const newlyFilled = (Object.keys(slots) as SlotKey[]).filter(
    (k) => slots[k] && !input.slots[k],
  );
  const complete = APPROVED_SLOTS.every((k) => slots[k]);

  return {
    reply,
    slots,
    newlyFilled,
    sensitiveFlag: sensitive.length > 0,
    handoffReason: mustHandoff
      ? `সংবেদনশীল/অস্পষ্ট সংকেত: ${[...sensitive, ...ambiguous].join(", ")} — প্রসঙ্গসহ মানব-হস্তান্তর`
      : null,
    status: mustHandoff ? "HUMAN_HANDOFF" : complete && !clarifying ? "AWAITING_CONFIRMATION" : "IN_PROGRESS",
    aiAvailable: true,
  };
}

/**
 * Deterministic fallback flow when the AI service is unavailable.
 * Fails VISIBLY: the reply states the limitation; slot-filling continues
 * through simple keyword heuristics so the citizen is never silently dropped.
 */
function fallbackTurn(input: IntakeTurnInput, reason: string): IntakeTurnOutput {
  const { sensitive, ambiguous } = detectSignals(input.latestUserMessage);
  const slots = { ...input.slots };
  const msg = input.latestUserMessage.trim();

  // Minimal deterministic slot extraction
  if (!slots.citizenName && msg.length <= 40 && !msg.includes("?")) slots.citizenName = msg;
  const districtHit = ["জয়পুরহাট", "ঝিনাইদহ", "খাগড়াছড়ি", "বরগুনা", "ঢাকা", "চট্টগ্রাম", "রাজশাহী", "খুলনা", "বরিশাল", "সিলেট", "রংপুর", "ময়মনসিংহ"]
    .find((d) => msg.includes(d));
  if (districtHit) slots.district = districtHit;

  const newlyFilled = (Object.keys(slots) as SlotKey[]).filter((k) => slots[k] && !input.slots[k]);
  const nextMissing = APPROVED_SLOTS.find((k) => !slots[k]);
  const mustHandoff = sensitive.length > 0 || ambiguous.length >= 2;

  const reply = mustHandoff
    ? "আপনার কথা থেকে গুরুত্বপূর্ণ বিষয় ধরা পড়েছে। আপনার তথ্য একজন অভিজ্ঞ কর্মকর্তার কাছে সরাসরি পাঠানো হচ্ছে — অনুগ্রহ করে অপেক্ষা করুন।"
    : nextMissing
      ? `এআই সহায়তা এখন সীমিত (${reason})। আমি মৌলিক প্রশ্নগুলো ঠিক রেখেছি। পরবর্তী তথ্য দিন — ${slotQuestionBn(nextMissing)}`
      : "ধন্যবাদ। আপনার তথ্য নিশ্চিত করার জন্য একজন কর্মকর্তা শীঘ্রই যোগাযোগ করবেন।";

  return {
    reply,
    slots,
    newlyFilled,
    sensitiveFlag: sensitive.length > 0,
    handoffReason: mustHandoff
      ? `সংবেদনশীল/অস্পষ্ট সংকেত: ${[...sensitive, ...ambiguous].join(", ")} (fallback guardrail)`
      : null,
    status: mustHandoff ? "HUMAN_HANDOFF" : nextMissing ? "IN_PROGRESS" : "AWAITING_CONFIRMATION",
    aiAvailable: false,
  };
}

function slotQuestionBn(slot: SlotKey): string {
  switch (slot) {
    case "citizenName": return "আপনার নাম কী?";
    case "district": return "আপনি কোন জেলায় থাকেন?";
    case "caseType": return "সমস্যাটি কোন ধরনের — ভরণপোষণ, পারিবারিক সহিংসতা, যৌতুক, ভূমি, শ্রম, অনলাইন হয়রানি, প্রতারণা নাকি অন্য কিছু?";
    case "narrative": return "সংক্ষেপে বলুন কী ঘটেছে?";
    case "contactNumber": return "আপনার নিরাপদ যোগাযোগ নম্বর কী?";
  }
}

/** Convert filled slots into the approved intake fields for the Application. */
export function slotsToApplicationFields(slots: Slots) {
  return {
    applicantName: slots.citizenName ?? "অজানা",
    district: slots.district ?? "ঢাকা",
    caseType: CASE_TYPE_IDS.includes((slots.caseType ?? "") as never) ? slots.caseType! : "OTHER",
    narrative: slots.narrative ?? "(কথোপকথনে বিবরণ পাওয়া যায়নি)",
    contactNumber: slots.contactNumber ?? null,
  };
}
