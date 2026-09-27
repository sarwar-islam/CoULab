// ============================================================================
// DLAS shared constants — single source of truth for allowed state values.
// ============================================================================
'use strict';

const ROLES = {
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
};

const STAFF_ROLES = [
  ROLES.UDC,
  ROLES.HELPLINE,
  ROLES.DLAO_OFFICER,
  ROLES.MEDIATOR,
  ROLES.LAWYER,
  ROLES.RECEIVING_DLAO,
  ROLES.CASE_SUPPORT,
  ROLES.ADMIN,
];

const RESTRICTED_ACCESS_ROLES = [
  ROLES.DLAO_OFFICER,
  ROLES.MEDIATOR,
  ROLES.RECEIVING_DLAO,
  ROLES.CASE_SUPPORT,
  ROLES.ADMIN,
];

const CHANNELS = {
  WEB: "WEB",
  VOICE_IVR: "VOICE_IVR",
  USSD_SMS: "USSD_SMS",
  ASSISTED_UDC: "ASSISTED_UDC",
  HELPLINE: "HELPLINE",
  DLAO_WALKIN: "DLAO_WALKIN",
};
const CHANNEL_LIST = Object.values(CHANNELS);

const PROVENANCE = {
  APPLICANT_CONFIRMED: "APPLICANT_CONFIRMED",
  REPRESENTATIVE_REPORTED: "REPRESENTATIVE_REPORTED",
  INTERMEDIARY_TRANSLATED: "INTERMEDIARY_TRANSLATED",
  STAFF_ENTERED: "STAFF_ENTERED",
  AI_INFERRED: "AI_INFERRED",
};
const PROVENANCE_LIST = Object.values(PROVENANCE);

const APPLICATION_STATUSES = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "MORE_INFO_NEEDED",
  "ACCEPTED",
  "REJECTED",
  "CONVERTED_TO_CASE",
];

const CASE_STATUSES = [
  "OPEN",
  "UNDER_REVIEW",
  "IN_MEDIATION",
  "LAWYER_ASSIGNED",
  "IN_SERVICE",
  "CLOSED",
];

const CASE_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const CASE_SENSITIVITIES = ["NORMAL", "SENSITIVE", "RESTRICTED"];

const CASE_TYPES = [
  { id: "MAINTENANCE", label: "ভরণপোষণ / Maintenance", labelEn: "Maintenance" },
  { id: "DOMESTIC_VIOLENCE", label: "পারিবারিক সহিংসতা / Domestic violence", labelEn: "Domestic Violence" },
  { id: "DOWRY", label: "যৌতুক / Dowry", labelEn: "Dowry" },
  { id: "LAND_DISPUTE", label: "ভূমি বিরোধ / Land dispute", labelEn: "Land Dispute" },
  { id: "LABOUR_WAGES", label: "শ্রম ও মজুরি / Labour & wages", labelEn: "Labour & Wages" },
  { id: "CYBER_HARASSMENT", label: "অনলাইন হয়রানি / Cyber harassment", labelEn: "Cyber Harassment" },
  { id: "FRAUD", label: "প্রতারণা / Fraud", labelEn: "Fraud" },
  { id: "OTHER", label: "অন্যান্য / Other", labelEn: "Other" },
];
const CASE_TYPE_IDS = CASE_TYPES.map((c) => c.id);

const JURISDICTIONS = [
  { id: "DISTRICT_DLAO", label: "জেলা আইনি সহায়তা কার্যালয়" },
  { id: "LABOUR_LEGAL_AID_CELL", label: "শ্রম আইনি সহায়তা সেল" },
  { id: "CYBER_TRIBUNAL_ROUTE", label: "সাইবার ট্রাইব্যুনাল পথ (রেফারেল)" },
  { id: "OTHER_AUTHORITY", label: "অন্য সক্ষম কর্তৃপক্ষ (রেফারেল)" },
];

const REFERRAL_ACK_STATUSES = [
  "SENT", "ACKNOWLEDGED", "ACCEPTED", "RETURNED", "ESCALATED", "ROUTED", "COMPLETED",
];

const TASK_STATUSES = ["OPEN", "IN_PROGRESS", "DONE", "OVERDUE", "CANCELLED"];

const LAWYER_ASSIGNMENT_STATUSES = [
  "PROPOSED", "ACCEPTED", "DECLINED", "REASSIGNED", "RELEASED", "COMPLETED",
];

const PAYMENT_STATUSES = ["NOT_DUE", "PENDING_REVIEW", "APPROVED", "HOLD", "PAID"];
const MEDIATION_MODES = ["IN_PERSON", "REMOTE", "HYBRID"];
const SETTLEMENT_TEMPLATES = ["MAINTENANCE", "PROPERTY", "LABOUR"];

const INACTIVITY_PATTERN_THRESHOLD = 2;
const JURISDICTION_RETURN_ESCALATION_THRESHOLD = 2;

const PUBLISHED_RULES = [
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

const CHECKLISTS = {
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
    { label: "চুক্তিপত্র / লেনদেন রসিদ (receipts / contracts)", required: true },
  ],
  OTHER: [
    { label: "আবেদনপত্র (signed application)", required: true },
    { label: "জাতীয় পরিচয়পত্র (identity)", required: true },
  ],
};

module.exports = {
  ROLES,
  STAFF_ROLES,
  RESTRICTED_ACCESS_ROLES,
  CHANNELS,
  CHANNEL_LIST,
  PROVENANCE,
  PROVENANCE_LIST,
  APPLICATION_STATUSES,
  CASE_STATUSES,
  CASE_PRIORITIES,
  CASE_SENSITIVITIES,
  CASE_TYPES,
  CASE_TYPE_IDS,
  JURISDICTIONS,
  REFERRAL_ACK_STATUSES,
  TASK_STATUSES,
  LAWYER_ASSIGNMENT_STATUSES,
  PAYMENT_STATUSES,
  MEDIATION_MODES,
  SETTLEMENT_TEMPLATES,
  INACTIVITY_PATTERN_THRESHOLD,
  JURISDICTION_RETURN_ESCALATION_THRESHOLD,
  PUBLISHED_RULES,
  CHECKLISTS,
};
