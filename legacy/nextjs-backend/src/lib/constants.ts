// ============================================================================
// DLAS shared constants — the single source of allowed state values.
// Every field stored as String in SQLite is validated against these lists
// at the API boundary. Legal/procedural vocabulary follows the ADLASB case
// PDF and the published DBLA workflow (Annex B1) — nothing invented.
// ============================================================================

export const ROLES = {
  CITIZEN: "CITIZEN",
  REPRESENTATIVE: "REPRESENTATIVE",
  UDC: "UDC",
  HELPLINE: "HELPLINE",
  DLAO_OFFICER: "DLAO_OFFICER",
  MEDIATOR: "MEDIATOR",
  LAWYER: "LAWYER",
  RECEIVING_DLAO: "RECEIVING_DLAO",
  CASE_SUPPORT: "CASE_SUPPORT",
  ADMIN: "ADMIN",
} as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];

export const STAFF_ROLES: string[] = [
  ROLES.UDC,
  ROLES.HELPLINE,
  ROLES.DLAO_OFFICER,
  ROLES.MEDIATOR,
  ROLES.LAWYER,
  ROLES.RECEIVING_DLAO,
  ROLES.CASE_SUPPORT,
  ROLES.ADMIN,
];

/// Roles allowed to view restricted material (A3: role-restricted access).
export const RESTRICTED_ACCESS_ROLES: string[] = [
  ROLES.DLAO_OFFICER,
  ROLES.MEDIATOR,
  ROLES.RECEIVING_DLAO,
  ROLES.CASE_SUPPORT,
  ROLES.ADMIN,
];

export const CHANNELS = {
  WEB: "WEB",
  VOICE_IVR: "VOICE_IVR",
  USSD_SMS: "USSD_SMS",
  ASSISTED_UDC: "ASSISTED_UDC",
  HELPLINE: "HELPLINE",
  DLAO_WALKIN: "DLAO_WALKIN",
} as const;
export const CHANNEL_LIST = Object.values(CHANNELS);

export const PROVENANCE = {
  APPLICANT_CONFIRMED: "APPLICANT_CONFIRMED",
  REPRESENTATIVE_REPORTED: "REPRESENTATIVE_REPORTED",
  INTERMEDIARY_TRANSLATED: "INTERMEDIARY_TRANSLATED",
  STAFF_ENTERED: "STAFF_ENTERED",
  AI_INFERRED: "AI_INFERRED",
} as const;
export const PROVENANCE_LIST = Object.values(PROVENANCE);

export const APPLICATION_STATUSES = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "MORE_INFO_NEEDED",
  "ACCEPTED",
  "REJECTED",
  "CONVERTED_TO_CASE",
];

export const CASE_STATUSES = [
  "OPEN",
  "UNDER_REVIEW",
  "IN_MEDIATION",
  "LAWYER_ASSIGNED",
  "IN_SERVICE",
  "CLOSED",
];

export const CASE_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export const CASE_SENSITIVITIES = ["NORMAL", "SENSITIVE", "RESTRICTED"];

/// Published case-type list (DBLA legal-aid scope; used by intake, T5, T8).
/// These are service categories of the District Legal Aid Office — illustrative,
/// aligned with the personas in the case PDF.
export const CASE_TYPES = [
  { id: "MAINTENANCE", label: "ভরণপোষণ / Maintenance", labelEn: "Maintenance" },
  { id: "DOMESTIC_VIOLENCE", label: "পারিবারিক সহিংসতা / Domestic violence", labelEn: "Domestic Violence" },
  { id: "DOWRY", label: "যৌতুক / Dowry", labelEn: "Dowry" },
  { id: "LAND_DISPUTE", label: "ভূমি বিরোধ / Land dispute", labelEn: "Land Dispute" },
  { id: "LABOUR_WAGES", label: "শ্রম ও মজুরি / Labour & wages", labelEn: "Labour & Wages" },
  { id: "CYBER_HARASSMENT", label: "অনলাইন হয়রানি / Cyber harassment", labelEn: "Cyber Harassment" },
  { id: "FRAUD", label: "প্রতারণা / Fraud", labelEn: "Fraud" },
  { id: "OTHER", label: "অন্যান্য / Other", labelEn: "Other" },
] as const;
export const CASE_TYPE_IDS = CASE_TYPES.map((c) => c.id);

export const JURISDICTIONS = [
  { id: "DISTRICT_DLAO", label: "জেলা আইনি সহায়তা কার্যালয়" },
  { id: "LABOUR_LEGAL_AID_CELL", label: "শ্রম আইনি সহায়তা সেল" },
  { id: "CYBER_TRIBUNAL_ROUTE", label: "সাইবার ট্রাইব্যুনাল পথ (রেফারেল)" },
  { id: "OTHER_AUTHORITY", label: "অন্য সক্ষম কর্তৃপক্ষ (রেফারেল)" },
];

export const REFERRAL_ACK_STATUSES = [
  "SENT", "ACKNOWLEDGED", "ACCEPTED", "RETURNED", "ESCALATED", "ROUTED", "COMPLETED",
];

export const TASK_STATUSES = ["OPEN", "IN_PROGRESS", "DONE", "OVERDUE", "CANCELLED"];

export const LAWYER_ASSIGNMENT_STATUSES = [
  "PROPOSED", "ACCEPTED", "DECLINED", "REASSIGNED", "RELEASED", "COMPLETED",
];

export const PAYMENT_STATUSES = ["NOT_DUE", "PENDING_REVIEW", "APPROVED", "HOLD", "PAID"];

export const MEDIATION_MODES = ["IN_PERSON", "REMOTE", "HYBRID"];

export const SETTLEMENT_TEMPLATES = ["MAINTENANCE", "PROPERTY", "LABOUR"];

/// T1 guardrail threshold: "similar inactivity on two other cases" per the PDF.
export const INACTIVITY_PATTERN_THRESHOLD = 2;
/// T2 escalation: after two rejected/returned transfers the system escalates.
export const JURISDICTION_RETURN_ESCALATION_THRESHOLD = 2;

// ---------------------------------------------------------------------------
// Published procedural rules the AI may explain (T5 guardrail: "AI may
// explain/check published rules; it does not decide eligibility").
// These come from the DBLA public application workflow (case PDF Annex B1).
// ---------------------------------------------------------------------------

export const PUBLISHED_RULES = [
  {
    id: "FREE_SERVICE",
    textBn: "জেলা আইনি সহায়তা কার্যালয়ে আবেদন করা ও আইনি সহায়তা পাওয়া সম্পূর্ণ বিনামূল্যে।",
    textEn: "Applying to the District Legal Aid Office and receiving legal aid is completely free of cost.",
  },
  {
    id: "APPLICATION_CHANNEL",
    textBn: "আবেদন অনলাইন, ১৬৬৯৯ হেল্পলাইন, ইউনিয়ন ডিজিটাল সেন্টার অথবা জেলা কার্যালয়ে সরাসরি করা যায়।",
    textEn: "An application can be filed online, via the 16699 helpline, through a Union Digital Centre, or in person at the district office.",
  },
  {
    id: "REVIEW_STEP",
    textBn: "আবেদন জমা দেওয়ার পর কার্যালয় যোগ্যতা ও সংশ্লিষ্ট কেস টাইপ যাচাই করে; অনুমোদন হলে কেস রেকর্ড খোলা হয়।",
    textEn: "After submission the office verifies eligibility and case type; on approval a case record is opened.",
  },
  {
    id: "LAWYER_STEP",
    textBn: "অনুমোদিত হলে প্যানেল আইনজীবী নিয়োগ করা হয় এবং আবেদনকারীকে জানানো হয়।",
    textEn: "On approval a panel lawyer is assigned and the applicant is informed.",
  },
  {
    id: "MEDIATION_STEP",
    textBn: "আদালতের বাইরে পালামধ্যস্থতা প্রযোজ্য ক্ষেত্রে প্রথমে চেষ্টা করা হয়; উভয় পক্ষের সম্মতি থাকে।",
    textEn: "Pre-case mediation is attempted first where applicable, with consent of both parties.",
  },
];

// ---------------------------------------------------------------------------
// Document checklists per case type (B4 checklist, T6 comparison baseline).
// Defined per case PDF guidance (deeds, medical reports, photos, court papers).
// ---------------------------------------------------------------------------

export const CHECKLISTS: Record<string, { label: string; required: boolean; note?: string }[]> = {
  MAINTENANCE: [
    { label: "আবেদনপত্র (signed application)", required: true },
    { label: "জাতীয় পরিচয়পত্র / জন্মনিবন্ধন (identity)", required: true },
    { label: "বিবাহ নিবন্ধন (marriage registration)", required: true },
    { label: "আয়ের প্রমাণ (income evidence)", required: false },
  ],
  DOMESTIC_VIOLENCE: [
    { label: "আবেদনপত্র (signed application)", required: true },
    { label: "জাতীয় পরিচয়পত্র / জন্মনিবন্ধন (identity)", required: true },
    { label: "চিকিৎসা প্রতিবেদন (medical report, if any)", required: false, note: "যদি থাকে" },
    { label: "নিরাপদ যোগাযোগ নম্বর (safe contact number)", required: true },
  ],
  DOWRY: [
    { label: "আবেদনপত্র (signed application)", required: true },
    { label: "জাতীয় পরিচয়পত্র / জন্মনিবন্ধন (identity)", required: true },
    { label: "বিবাহ নিবন্ধন (marriage registration)", required: true },
    { label: "যৌতুক তালিকা / প্রমাণ (dowry list/evidence)", required: false },
  ],
  LAND_DISPUTE: [
    { label: "আবেদনপত্র (signed application)", required: true },
    { label: "জাতীয় পরিচয়পত্র (identity)", required: true },
    { label: "দলিল / খতিয়ান (deed / khatian)", required: true },
    { label: "জরিপ মানচিত্র (survey map)", required: false },
  ],
  LABOUR_WAGES: [
    { label: "আবেদনপত্র (signed application)", required: true },
    { label: "জাতীয় পরিচয়পত্র (identity)", required: true },
    { label: "কর্মসংস্থান/নিয়োগ প্রমাণ (employment proof)", required: false },
    { label: "বকেয়া মজুরির হিসাব (wage calculation)", required: false },
  ],
  CYBER_HARASSMENT: [
    { label: "আবেদনপত্র (signed application)", required: true },
    { label: "জাতীয় পরিচয়পত্র (identity)", required: true },
    { label: "স্ক্রিনশট / প্রমাণ সংগ্রহ তালিকা (evidence list)", required: true, note: "সংবেদনশীল — সীমিত প্রবেশাধিকার" },
    { label: "সংশ্লিষ্ট অ্যাকাউন্ট/লিংক তথ্য (account/link info)", required: false },
  ],
  FRAUD: [
    { label: "আবেদনপত্র (signed application)", required: true },
    { label: "জাতীয় পরিচয়পত্র (identity)", required: true },
    { label: "লেনদেন/প্রতারণার প্রমাণ (transaction evidence)", required: false },
  ],
  OTHER: [
    { label: "আবেদনপত্র (signed application)", required: true },
    { label: "জাতীয় পরিচয়পত্র (identity)", required: true },
  ],
};

// ---------------------------------------------------------------------------
// Districts appearing in the case personas (illustrative sample data only)
// ---------------------------------------------------------------------------

export const DISTRICTS = [
  "Joypurhat", "Jhenaidah", "Khagrachari", "Barguna", "Dhaka", "Chattogram",
  "Rajshahi", "Khulna", "Barishal", "Sylhet", "Rangpur", "Mymensingh",
];

// ---------------------------------------------------------------------------
// Bangla labels for provenance badges (G2 — rendered everywhere)
// ---------------------------------------------------------------------------

export const PROVENANCE_LABELS_BN: Record<string, string> = {
  APPLICANT_CONFIRMED: "আবেদনকারীর নিজের নিশ্চিতকৃত",
  REPRESENTATIVE_REPORTED: "প্রতিনিধির জানানো",
  INTERMEDIARY_TRANSLATED: "মধ্যস্থকারীর অনূদিত/টাইপকৃত",
  STAFF_ENTERED: "কর্মকর্তার প্রবেশকৃত",
  AI_INFERRED: "এআই-অনুমিত (যাচাই প্রয়োজন)",
};

export const PROVENANCE_LABELS_EN: Record<string, string> = {
  APPLICANT_CONFIRMED: "Applicant-confirmed",
  REPRESENTATIVE_REPORTED: "Representative-reported",
  INTERMEDIARY_TRANSLATED: "Intermediary-translated/typed",
  STAFF_ENTERED: "Staff-entered",
  AI_INFERRED: "AI-inferred (needs verification)",
};

export const CHANNEL_LABELS_BN: Record<string, string> = {
  WEB: "ওয়েব",
  VOICE_IVR: "ভয়েস / ১৬৬৯৯",
  USSD_SMS: "ইউএসএসডি / এসএমএস",
  ASSISTED_UDC: "ইউডিসি সহায়তায়",
  HELPLINE: "হেল্পলাইন ১৬৬৯৯",
  DLAO_WALKIN: "কার্যালয়ে সরাসরি",
};

export const ROLE_LABELS_BN: Record<string, string> = {
  CITIZEN: "নাগরিক",
  REPRESENTATIVE: "মনোনীত প্রতিনিধি",
  UDC: "ইউডিসি উদ্যোক্তা",
  HELPLINE: "১৬৬৯৯ হেল্পলাইন এজেন্ট",
  DLAO_OFFICER: "ডিএলএও কর্মকর্তা",
  MEDIATOR: "আইনি সহায়তা কর্মকর্তা / মধ্যস্থতাকারী",
  LAWYER: "প্যানেল আইনজীবী",
  RECEIVING_DLAO: "গ্রহণকারী ডিএলএও",
  CASE_SUPPORT: "প্রশাসনিক / কেস-সহায়তা কর্মী",
  ADMIN: "প্রশাসক",
};

/// Illustrative-data banner text (Responsible-Design rule: sample data only)
export const ILLUSTRATIVE_BANNER =
  "শুধুমাত্র উদাহরণ তথ্য ব্যবহার করা হয়েছে — কোনো প্রকৃত এনআইডি, প্রকৃত মামলা বা প্রকৃত উপভোক্তার রেকর্ড নয়।";
