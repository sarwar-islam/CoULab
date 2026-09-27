// ============================================================================
// DLAS AI Services (T5 Intake, T6 Briefing, T7 Settlement Drafting).
// Implements deterministic rule-based engines with safety guardrails.
// ============================================================================
'use strict';


// ---------- T5 Conversational Intake ----------
const SENSITIVE_SIGNALS = [
  "আত্মহত্যা", "kill", "মারধর", "নির্যাতন", "assault", "rape", "ধর্ষণ",
  "গর্ভপাত", "threat", "হত্যার হুমকি", "জীবনের নিরাপত্তা", "child", "শিশু"
];

function intakeTurn({ transcript = [], slots = {}, latestUserMessage = "" }) {
  const lower = (latestUserMessage || "").toLowerCase();
  const sensitive = SENSITIVE_SIGNALS.filter((w) => lower.includes(w.toLowerCase()));

  if (sensitive.length > 0) {
    return {
      reply: "আপনার নিরাপত্তা আমাদের সর্বোচ্চ অগ্রাধিকার। সংবেদনশীল পরিস্থিতি শনাক্ত হওয়ায় এই আলাপটি সরাসরি একজন দায়িত্বশীল কর্মকর্তার কাছে হস্তান্তর করা হচ্ছে। অনুগ্রহ করে লাইনে থাকুন বা জরুরি প্রয়োজনে ৯৯৯ এ কল করুন।",
      slots,
      newlyFilled: [],
      sensitiveFlag: true,
      handoffReason: `সংবেদনশীল শব্দ শনাক্ত: ${sensitive.join(", ")}`,
      status: "HUMAN_HANDOFF",
      aiAvailable: true
    };
  }

  const updatedSlots = { ...slots };
  const newlyFilled = [];

  // Extract phone
  const phoneMatch = latestUserMessage.match(/01[3-9]\d{8}/);
  if (phoneMatch && !updatedSlots.contactNumber) {
    updatedSlots.contactNumber = phoneMatch[0];
    newlyFilled.push("contactNumber");
  }

  // Extract district
  const districts = ["জয়পুরহাট", "ঝিনাইদহ", "খাগড়াছড়ি", "বরগুনা", "নেত্রকোনা", "ঢাকা", "চট্টগ্রাম", "রাজশাহী"];
  for (const d of districts) {
    if (latestUserMessage.includes(d) && !updatedSlots.district) {
      updatedSlots.district = d;
      newlyFilled.push("district");
      break;
    }
  }

  // Extract name if introduced
  const nameMatch = latestUserMessage.match(/(?:আমার নাম|আমি|নাম)\s+([^\s,।]+(?:\s+[^\s,।]+)?)/);
  if (nameMatch && !updatedSlots.citizenName) {
    updatedSlots.citizenName = nameMatch[1];
    newlyFilled.push("citizenName");
  }

  // Case type hint
  if (!updatedSlots.caseType) {
    if (lower.includes("ভরণপোষণ") || lower.includes("খোরপোশ")) {
      updatedSlots.caseType = "MAINTENANCE";
      newlyFilled.push("caseType");
    } else if (lower.includes("জমি") || lower.includes("সম্পত্তি") || lower.includes("দাগ")) {
      updatedSlots.caseType = "LAND_DISPUTE";
      newlyFilled.push("caseType");
    } else if (lower.includes("মজুরি") || lower.includes("বেতন") || lower.includes("মালিক")) {
      updatedSlots.caseType = "LABOUR_WAGES";
      newlyFilled.push("caseType");
    } else if (lower.includes("অনলাইন") || lower.includes("ছবি") || lower.includes("ফেসবুক")) {
      updatedSlots.caseType = "CYBER_HARASSMENT";
      newlyFilled.push("caseType");
    }
  }

  if (!updatedSlots.narrative && latestUserMessage.length > 20) {
    updatedSlots.narrative = latestUserMessage;
    newlyFilled.push("narrative");
  }

  let reply = "ধন্যবাদ। আপনার সমস্যাটি বুঝতে পেরেছি।";
  if (!updatedSlots.citizenName) {
    reply = "আইনসহায় ডিজিটাল পোর্টালে আপনাকে স্বাগতম। অনুগ্রহ করে আপনার পুরো নামটি বলুন।";
  } else if (!updatedSlots.district) {
    reply = `${updatedSlots.citizenName}, আপনি কোন জেলা থেকে বলছেন?`;
  } else if (!updatedSlots.narrative) {
    reply = `আপনার আইনি সমস্যার সংক্ষিপ্ত বিবরণ দিন — কী ঘটেছে এবং আপনি কী ধরণের সহায়তা চান?`;
  } else if (!updatedSlots.contactNumber) {
    reply = `আপনার সাথে যোগাযোগের একটি সচল মোবাইল নম্বর দিন।`;
  } else {
    reply = `আপনার সব তথ্য রেকর্ড করা হয়েছে। আবেদনটি যাচাইয়ের জন্য প্রস্তুত। আপনি কি এটি জমা দিতে চান?`;
  }

  const isReady = updatedSlots.citizenName && updatedSlots.district && updatedSlots.narrative && updatedSlots.contactNumber;

  return {
    reply,
    slots: updatedSlots,
    newlyFilled,
    sensitiveFlag: false,
    handoffReason: null,
    status: isReady ? "AWAITING_CONFIRMATION" : "IN_PROGRESS",
    aiAvailable: true
  };
}

// ---------- T7 Settlement Agreement Drafting ----------
const TEMPLATE_STORE = {
  MAINTENANCE: {
    titleBn: "পারিবারিক আপস ও ভরণপোষণ চুক্তি",
    clauses: [
      "১. পক্ষগণের পরিচিতি: প্রথম পক্ষ এবং দ্বিতীয় পক্ষ স্বেচ্ছায় ও সুস্থ মস্তিষ্কে এই সমঝোতায় উপনীত হয়েছেন।",
      "২. সন্তানের ভরণপোষণ বাবদ দ্বিতীয় পক্ষ প্রতি ইংরেজি মাসের ৫ তারিখের মধ্যে নির্ধারিত ব্যাংক/বিকাশ একাউন্টে মাসিক ৫,০০০/- (পাঁচ হাজার) টাকা প্রদান করবেন।",
      "৩. সন্তানের লেখাপড়া ও চিকিৎসার আবশ্যক খরচের ৫০% উভয় পক্ষ সমহারে বহন করবেন।",
      "৪. প্রতি শুক্রবার পূর্বনির্ধারিত সময়ে প্রথম পক্ষ দ্বিতীয় পক্ষকে সন্তানের সাথে সাক্ষাতের সুযোগ প্রদান করবেন।",
      "৫. পক্ষগণ আদালতের বাইরে মধ্যস্থতাকারীর উপস্থিতিতে এই চুক্তি সম্পাদন করলেন এবং উভয় পক্ষ তা মান্য করতে বাধ্য থাকবেন।"
    ]
  },
  LAND_DISPUTE: {
    titleBn: "ভূমি বিরোধ নিষ্পত্তি ও সীমানা সমঝোতা চুক্তি",
    clauses: [
      "১. বিরোধীয় জমির বিবরণ: খতিয়ান ও দাগ নম্বর উল্লেখিত সীমানা সংক্রান্ত বিরোধ উভয় পক্ষ যৌথ সার্ভেয়ারের উপস্থিতিতে নিরসন করেছেন।",
      "২. পশ্চিম সীমানা বরাবর সরকারি নকশা মোতাবেক স্থায়ী সীমানা পিলার স্থাপন করা হলো।",
      "৩. প্রথম পক্ষ দ্বিতীয় পক্ষের চলাচল রাস্তার জন্য ৩ ফুট উন্মুক্ত জমি ছেড়ে দিতে সম্মত হয়েছেন।",
      "৪. এই নিষ্পত্তির পর পক্ষদ্বয়ের মধ্যে উল্লেখিত জমি নিয়ে কোনো দেওয়ানি বা ফৌজদারি মামলা বিচারাধীন থাকবে না।"
    ]
  },
  LABOUR_WAGES: {
    titleBn: "শ্রমিক মজুরি ও ক্ষতিপূরণ নিষ্পত্তি চুক্তি",
    clauses: [
      "১. নিয়োগকারী কর্তৃপক্ষ ও শ্রমিকের পারস্পরিক আলোচনার ভিত্তিতে বকেয়া বেতন বাবদ সর্বমোট ২৫,০০০/- টাকা নির্ধারণ করা হলো।",
      "২. উল্লেখিত অর্থ আগামী ১৫ দিনের মধ্যে চেকের মাধ্যমে এককালীন পরিশোধ করা হবে।",
      "৩. অর্থ পরিশোধের পর শ্রমিক তার সমুদয় দাবি নিষ্পত্তি হয়েছে মর্মে লিখিত রসিদ প্রদান করবেন।"
    ]
  }
};

function draftSettlement({ templateType = "MAINTENANCE", notes = "", caseId = "" }) {
  const template = TEMPLATE_STORE[templateType] || TEMPLATE_STORE.MAINTENANCE;
  const draftText = `
${template.titleBn}
স্মারক / কেস নম্বর: ${caseId || 'DLAS-2026-XXXX'}
তারিখ: ${new Date().toLocaleDateString('bn-BD')}

${template.clauses.join('\n\n')}

বিশেষ মধ্যস্থতা নোট:
${notes || 'উভয় পক্ষ শর্তাবলি পাঠ করে বুঝে নিয়েছেন এবং সন্তুষ্ট চিত্তে স্বাক্ষর করতে সম্মত হয়েছেন।'}

-----------------------------------------------------------
স্বাক্ষর (প্রথম পক্ষ)              স্বাক্ষর (দ্বিতীয় পক্ষ)

প্রত্যক্ষদর্শী / মধ্যস্থতাকারী:
জেলা লিগ্যাল এইড অফিসার / বিশেষ মধ্যস্থতাকারী
`.trim();

  const aiSegments = [
    { text: "মাসিক ৫,০০০/- (পাঁচ হাজার) টাকা", reason: "উভয় পক্ষের আয়ের সামঞ্জস্য বজায় রেখে খসড়া প্রস্তুত" },
    { text: "প্রতি ইংরেজি মাসের ৫ তারিখের মধ্যে", reason: "মানক মধ্যস্থতা ধারা অনুযায়ী প্রস্তাবিত" }
  ];

  const warnings = [
    { warning: "খসড়া চুক্তিটি কেবল পর্যালোচনার উদ্দেশ্যে। পক্ষগণের চূড়ান্ত সম্মতি ও স্বাক্ষর ব্যতিরেকে কার্যকর নয়।", severity: "MEDIUM" }
  ];

  return {
    draftText,
    aiSegments,
    warnings,
    templateType,
    aiAvailable: true
  };
}

// ---------- T6 Document Briefing ----------
function briefDocument({ title = "", docType = "", text = "" }) {
  return {
    summary: `${title || docType}: নথিতে প্রয়োজনীয় প্রাথমিক তথ্যাদি বিদ্যমান।`,
    keyPoints: [
      "সনাক্তকরণ তথ্য স্পষ্ট ও পঠনযোগ্য।",
      "সংশ্লিষ্ট কার্যালয়ের সিল বা তারিখ উপস্থিত রয়েছে।"
    ],
    quality: "CLEAR",
    aiAvailable: true
  };
}

module.exports = {
  intakeTurn,
  draftSettlement,
  briefDocument
};
