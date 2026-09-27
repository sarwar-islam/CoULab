"use client";

/** Client API helper — uniform error surfacing (never silent). */
export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? (options.body ? "POST" : "GET"),
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({ error: "INVALID_RESPONSE" }));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `HTTP_${res.status}`);
  }
  return data as T;
}

export const ERROR_LABELS_BN: Record<string, string> = {
  // সেশন ও অনুমতি
  UNAUTHENTICATED: "সেশন শেষ — আবার লগইন করুন",
  FORBIDDEN: "এই কাজের অনুমতি নেই",
  FORBIDDEN_SCOPE: "এই রেকর্ড দেখার অনুমতি নেই",
  FORBIDDEN_ONLY_LAWYER: "এই কাজ শুধু নিয়োজিত আইনজীবী করতে পারেন",
  FORBIDDEN_ONLY_RECEIVER: "এই কাজ শুধু গ্রহণকারী কার্যালয় করতে পারে",
  FORBIDDEN_ONLY_AUTHORISED_HUMAN: "এই চূড়ান্ত সিদ্ধান্ত শুধু অনুমোদিত মানুষ নিতে পারেন",
  INVALID_CREDENTIALS: "ব্যবহারকারী নাম বা পিন মেলেনি",
  // যাচাই / ভ্যালিডেশন
  VALIDATION_REFERENCE_REQUIRED: "আবেদন/কেস আইডি দিন — রেফারেন্স ছাড়া অনুসন্ধান করা যায় না",
  VALIDATION_REFERENCE_FORMAT: "রেফারেন্স আইডি APP-… বা CASE-… আকারে দিন",
  VALIDATION_REASON_REQUIRED: "কারণ লেখা বাধ্যতামূলক",
  VALIDATION_RETURN_REASON_REQUIRED: "ফেরত পাঠানোর কারণ লেখা বাধ্যতামূলক",
  VALIDATION_REVIEW_NOTES_REQUIRED: "পর্যালোচনা-নোট লেখা বাধ্যতামূলক",
  VALIDATION_UPDATE_TEXT_REQUIRED: "আপডেটের বিবরণ লেখা বাধ্যতামূলক",
  VALIDATION_EDITED_TEXT_REQUIRED: "সম্পাদিত লেখা রাখা বাধ্যতামূলক",
  VALIDATION_OUTCOME_REQUIRED: "ফলাফল নির্বাচন করুন",
  VALIDATION_ATTENDANCE_REQUIRED: "উপস্থিতি নির্বাচন করুন",
  VALIDATION_TARGET_REQUIRED: "গন্তব্য কার্যালয় নির্বাচন করুন",
  VALIDATION_CASEID_REQUIRED: "কেস আইডি প্রয়োজন",
  VALIDATION_VIEW_REQUIRED: "ভিউ নির্বাচন করুন",
  VALIDATION_REMOTE_REQUIRES_LINK_OR_LOCATION: "দূরবর্তী সেশনের লিংক বা স্থান দিন",
  VALIDATION_DRAFT_MUST_BE_FINALIZED_BY_HUMAN_REVIEW_FIRST: "খসড়া চূড়ান্ত করতে আগে মানব-পর্যালোচনা প্রয়োজন",
  INVALID_JSON_BODY: "অনুরোধের ফরম্যাট সঠিক নয় — আবার চেষ্টা করুন",
  INVALID_ACTION: "এই কাজটি এখানে প্রযোজ্য নয়",
  // রেকর্ড
  APPLICATION_NOT_FOUND: "আবেদন পাওয়া যায়নি",
  CASE_NOT_FOUND: "কেস রেকর্ড পাওয়া যায়নি",
  DOCUMENT_NOT_FOUND: "নথি পাওয়া যায়নি",
  DRAFT_NOT_FOUND: "খসড়া পাওয়া যায়নি",
  NOT_FOUND: "রেকর্ড পাওয়া যায়নি",
  INVALID_TARGET_SAME_OFFICE: "একই কার্যালয়ে রেফারেল করা যায় না — অন্য কার্যালয় দিন",
  VERIFICATION_FAILED: "যাচাইকরণ ব্যর্থ — সঠিক তথ্য দিন",
  // স্বাক্ষর / এআই
  SIGNATURE_HASH_MISMATCH: "স্বাক্ষর-হ্যাশ মেলেনি — আবার চেষ্টা করুন",
  SIGNATURE_RECORD_NOT_FOUND: "স্বাক্ষর-রেকর্ড পাওয়া যায়নি",
  ALREADY_SIGNED: "এই দলিলে স্বাক্ষর ইতোমধ্যে রেকর্ড হয়েছে",
  AI_UNAVAILABLE: "এআই সহায়তা এখন অনুপলব্ধ — পরে চেষ্টা করুন বা কর্মী সহায়তা নিন",
  AI_JSON_UNPARSEABLE: "এআই-উত্তর প্রক্রিয়া করা যায়নি — আবার চেষ্টা করুন",
  CITIZEN_USE_STATUS_DOOR: "এই দেখাটি নাগরিক দরজার জন্য নয় — অবস্থা-দরজা ব্যবহার করুন",
};

export function errorLabelBn(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const known = ERROR_LABELS_BN[msg];
  if (known) return known;
  // অজানা কোড (যেমন FORBIDDEN_FOR_ROLE_LAWYER / HTTP_500) — পাঠযোগ্য বাংলায় ফলব্যাক
  if (msg.startsWith("FORBIDDEN_FOR_ROLE_")) return "এই রেকর্ড দেখার অনুমতি নেই (ভূমিকা: " + msg.replace("FORBIDDEN_FOR_ROLE_", "") + ")";
  if (msg.startsWith("HTTP_")) return "সার্ভার ত্রুটি — পরে আবার চেষ্টা করুন";
  return msg;
}
