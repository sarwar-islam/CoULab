// ============================================================================
// DLAS seed — illustrative data ONLY (Responsible-Design rule: no real NIDs,
// no real cases, no real beneficiary records, no live payments/calls).
//
// Seeds all 5 Part A citizens, 7 Part B providers' working context, and the
// Part C fixtures including the failure-test states the case PDF demands.
// ============================================================================

import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

const db = new PrismaClient();
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const PIN = sha("dlas-demo:1234"); // demo PIN 1234 for every seeded account
const day = 86_400_000;
const now = Date.now();

let appSeq = 0;
let caseSeq = 0;
const year = new Date().getFullYear();
const nextAppId = () => `APP-${year}-${String(++appSeq).padStart(4, "0")}`;
const nextCaseId = () => `CASE-${year}-${String(++caseSeq).padStart(4, "0")}`;

async function main() {
  console.log("Seeding DLAS illustrative data…");
  await db.auditEntry.deleteMany();
  await db.$transaction([
    db.counter.deleteMany(), db.offlineSyncRecord.deleteMany(), db.intakeSession.deleteMany(),
    db.triageRun.deleteMany(), db.duplicateCandidate.deleteMany(), db.incidentGroup.deleteMany(),
    db.signatureRecord.deleteMany(), db.signatureSession.deleteMany(), db.settlementDraft.deleteMany(),
    db.mediationSession.deleteMany(), db.lawyerUpdate.deleteMany(), db.hearing.deleteMany(),
    db.lawyerChangeRequest.deleteMany(), db.lawyerAssignment.deleteMany(), db.referral.deleteMany(),
    db.sensitiveAccessLog.deleteMany(), db.notification.deleteMany(), db.task.deleteMany(),
    db.contactAttempt.deleteMany(), db.contactRule.deleteMany(), db.consent.deleteMany(),
    db.recordEntry.deleteMany(), db.documentRecord.deleteMany(), db.checklistTemplate.deleteMany(),
    db.case.deleteMany(), db.application.deleteMany(), db.applicant.deleteMany(),
    db.session.deleteMany(), db.user.deleteMany(),
  ]);

  // ------------------------------------------------------------------
  // Users (B1–B7 provider roles + representative)
  // ------------------------------------------------------------------
  const mkUser = (username: string, name: string, nameBn: string, role: string, office?: string) =>
    db.user.create({ data: { username, name, nameBn, role, office, pinHash: PIN } });

  const officer = await mkUser("officer.joypurhat", "Rahima Khatun", "রহিমা খাতুন", "DLAO_OFFICER", "জেলা আইনি সহায়তা কার্যালয়, জয়পুরহাট");
  const officerJhenaidah = await mkUser("officer.jhenaidah", "Mahmudul Hasan", "মাহমুদুল হাসান", "DLAO_OFFICER", "জেলা আইনি সহায়তা কার্যালয়, ঝিনাইদহ");
  const mediator = await mkUser("mediator.joypurhat", "Nasrin Sultana", "নাসরিন সুলতানা", "MEDIATOR", "জেলা আইনি সহায়তা কার্যালয়, জয়পুরহাট");
  const helpline = await mkUser("helpline.agent1", "Farid Mia", "ফরিদ মিয়া", "HELPLINE", "১৬৬৯৯ হেল্পলাইন");
  const udc = await mkUser("udc.khagrachari", "Joyonto Chakma", "জয়ন্ত চাকমা", "UDC", "ইউনিয়ন ডিজিটাল সেন্টার, খাগড়াছড়ি");
  const lawyerShahana = await mkUser("lawyer.shahana", "Adv. Shahana Akter", "অ্যাডভোকেট শাহানা আক্তার", "LAWYER", "জয়পুরহাট জেলা আদালত");
  const lawyerKabir = await mkUser("lawyer.kabir", "Adv. Kabir Hossain", "অ্যাডভোকেট কবির হোসেন", "LAWYER", "বরগুনা জেলা আদালত");
  const receiving = await mkUser("receiving.dhaka", "Tanvir Ahmed", "তানভীর আহমেদ", "RECEIVING_DLAO", "জেলা আইনি সহায়তা কার্যালয়, ঢাকা");
  const support = await mkUser("support.staff1", "Salma Parvin", "সালমা পারভীন", "CASE_SUPPORT", "জেলা আইনি সহায়তা কার্যালয়, জয়পুরহাট");
  const admin = await mkUser("admin", "System Administrator", "সিস্টেম প্রশাসক", "ADMIN", "ডিবিএলএ");
  const ripon = await mkUser("ripon.rep", "Ripon Akter", "রিপন আক্তার", "REPRESENTATIVE", "জয়পুরহাট");
  await mkUser("officer.barguna", "Arif Chowdhury", "আরিফ চৌধুরী", "DLAO_OFFICER", "জেলা আইনি সহায়তা কার্যালয়, বরগুনা");

  const seedActor = { userId: admin.id, name: "সিস্টেম প্রশাসক (seed)", role: "ADMIN" };
  const audit = (action: string, entity: string, id: string, extra: Record<string, unknown> = {}) =>
    db.auditEntry.create({
      data: {
        actorUserId: seedActor.userId, actorName: seedActor.name, actorRole: seedActor.role,
        channel: "SYSTEM", action, entityType: entity, entityId: id, ...extra,
      },
    });

  // Helper to create a full application
  async function mkApplication(opts: {
    applicantName: string; district: string; phone?: string; nidRef?: string; contactNote?: string;
    channel: string; caseType: string; narrative: string; provenance: string;
    originalText?: string; statedByName?: string; status?: string; urgencyFlag?: boolean; sensitiveFlag?: boolean;
    assistedByUserId?: string; helplineOperatorUserId?: string; createdAtDaysAgo?: number;
  }) {
    const applicant = await db.applicant.create({
      data: {
        fullName: opts.applicantName, district: opts.district, nidRef: opts.nidRef ?? null,
        primaryPhone: opts.phone ?? null, contactNote: opts.contactNote ?? null,
      },
    });
    const application = await db.application.create({
      data: {
        id: nextAppId(),
        applicantId: applicant.id,
        channel: opts.channel,
        status: opts.status ?? "SUBMITTED",
        caseType: opts.caseType,
        narrative: opts.narrative,
        district: opts.district,
        office: `জেলা আইনি সহায়তা কার্যালয়, ${opts.district}`,
        urgencyFlag: opts.urgencyFlag ?? false,
        sensitiveFlag: opts.sensitiveFlag ?? false,
        freeServiceNoticeShown: opts.channel === "ASSISTED_UDC" || opts.channel === "HELPLINE",
        assistedByUserId: opts.assistedByUserId ?? null,
        helplineOperatorUserId: opts.helplineOperatorUserId ?? null,
        createdAt: new Date(now - (opts.createdAtDaysAgo ?? 2) * day),
      },
    });
    await db.recordEntry.create({
      data: {
        applicationId: application.id,
        provenance: opts.provenance,
        text: opts.narrative,
        originalText: opts.originalText ?? null,
        language: opts.originalText ? "mar" : "bn",
        statedByName: opts.statedByName ?? opts.applicantName,
        statedByRole: opts.provenance === "APPLICANT_CONFIRMED" ? "APPLICANT" : opts.provenance === "REPRESENTATIVE_REPORTED" ? "REPRESENTATIVE" : opts.provenance === "INTERMEDIARY_TRANSLATED" ? "INTERMEDIARY" : "STAFF",
        channel: opts.channel,
        kind: "STATEMENT",
      },
    });
    await audit("APPLICATION_SUBMITTED", "Application", application.id, { applicationId: application.id, after: "SUBMITTED", metadataJson: JSON.stringify({ provenance: opts.provenance, channel: opts.channel }) });
    return application;
  }

  // Accept an application into a Case
  async function mkCase(applicationId: string, opts: { priority?: string; sensitivity?: string; createdAtDaysAgo?: number; office?: string; acceptedByUserId?: string } = {}) {
    const app = await db.application.findUnique({ where: { id: applicationId } });
    if (!app) throw new Error("no app");
    await db.application.update({
      where: { id: applicationId },
      data: { status: "CONVERTED_TO_CASE" },
    });
    const kase = await db.case.create({
      data: {
        id: nextCaseId(),
        applicationId,
        status: "OPEN",
        caseType: app.caseType,
        office: opts.office ?? app.office,
        district: app.district,
        priority: opts.priority ?? "MEDIUM",
        priorityReason: "গ্রহণের সময় কর্মকর্তার প্রাথমিক মূল্যায়ন",
        prioritySource: "OFFICER_DECISION",
        sensitivity: opts.sensitivity ?? "NORMAL",
        acceptedByUserId: opts.acceptedByUserId ?? officer.id,
        createdAt: new Date(now - (opts.createdAtDaysAgo ?? 30) * day),
      },
    });
    await db.application.update({ where: { id: applicationId }, data: { caseId: kase.id } });
    await audit("APPLICATION_ACCEPTED_CASE_MINTED", "Application", applicationId, { caseId: kase.id, applicationId, after: "CONVERTED_TO_CASE" });
    await audit("CASE_CREATED", "Case", kase.id, { caseId: kase.id, after: "OPEN" });
    return kase;
  }

  // ==================================================================
  // A1 — Moyuri (Joypurhat): safe contact, identity gap, representation
  // ==================================================================
  console.log("A1 Moyuri…");
  const moyuriApp = await mkApplication({
    applicantName: "Moyuri Akter",
    district: "Joypurhat",
    phone: "01711223344", // her button phone (checked by husband in daytime)
    contactNote: "আবেদনকারীর নিজের বাটন-ফোন; দিনে স্বামী ফোন নিয়ন্ত্রণ করেন",
    channel: "HELPLINE",
    caseType: "DOMESTIC_VIOLENCE",
    narrative: "স্বামী দিনের বেলা তাঁর ফোন নিয়ন্ত্রণ করেন ও হুমকি দেন। তাঁর নিজের ভাষায় এখনো কার্যালয় শোনেনি — ভাই ১৬৬৯৯-এ কথা বলেছেন।",
    provenance: "REPRESENTATIVE_REPORTED",
    statedByName: "রিপন আক্তার (ভাই, প্রতিনিধি)",
    helplineOperatorUserId: helpline.id,
    sensitiveFlag: true,
    urgencyFlag: true,
    status: "SUBMITTED",
  });
  const moyuriCase = await mkCase(moyuriApp.id, { priority: "URGENT", sensitivity: "SENSITIVE", createdAtDaysAgo: 5 });

  // Safe-contact rule (G3/A1): only her number, only in the safe window
  await db.contactRule.create({
    data: {
      caseId: moyuriCase.id,
      mode: "ALLOW_ONLY",
      safeNumber: "01711223344",
      safeTimeWindow: "14:00-17:00",
      blockedNumbers: JSON.stringify(["01899887766"]), // husband's number (illustrative)
      neutralWording: true,
      reason: "স্বামী অনিরাপদ ব্যক্তি — শুধু আবেদনকারীর নিজের নম্বরে, বিকাল ২টা–৫টার নিরাপদ সময়ে, নিরপেক্ষ বার্তায় যোগাযোগ করা যাবে",
      createdByUserId: officer.id,
    },
  });
  await audit("CONTACT_RULE_SET", "ContactRule", "moyuri-rule", { caseId: moyuriCase.id, reason: "নিরাপদ যোগাযোগ নিয়ম (A1)" });

  // Contact attempts incl. the FAILURE TEST: unsafe person answered
  await db.contactAttempt.create({ data: { caseId: moyuriCase.id, attemptedNumber: "01899887766", attemptType: "CALL", claimedIdentity: "স্বামী (অনিরাপদ)", outcome: "BLOCKED_UNSAFE", notes: "নিরাপদ যোগাযোগ নিয়ম অনুযায়ী প্রতিহত — কারণ লগে সংরক্ষিত" } });
  await db.contactAttempt.create({ data: { caseId: moyuriCase.id, attemptedNumber: "01711223344", attemptType: "IVR", claimedIdentity: "ময়ূরী আক্তার", outcome: "COMPLETED", notes: "নিরাপদ সময়সীমার মধ্যে সফল যোগাযোগ; রিড-ব্যাক নিশ্চিত" } });
  await db.notification.create({ data: { caseId: moyuriCase.id, targetRole: "DLAO_OFFICER", channel: "IN_APP", message: "অনিরাপদ যোগাযোগ প্রতিহত করা হয়েছে — কারণ লগে সংরক্ষিত", neutralWording: true, relatedModule: "SAFE_CONTACT" } });

  // Ripon's report is distinct from Moyuri's own confirmation (G2)
  await db.recordEntry.create({
    data: {
      caseId: moyuriCase.id,
      provenance: "APPLICANT_CONFIRMED",
      text: "আমি নিজে নিশ্চিত করছি — বিকালের সময়ে ভয়েস রুটে বলা বিবরণ সঠিক। স্বামীর নম্বরে কল করা যাবে না।",
      language: "bn",
      statedByName: "ময়ূরী আক্তার",
      statedByRole: "APPLICANT",
      recordedByUserId: helpline.id,
      channel: "VOICE_IVR",
      kind: "STATEMENT",
    },
  });
  // Representation consent (A2 link)
  await db.consent.create({
    data: {
      applicationId: moyuriApp.id,
      grantedByApplicantId: moyuriApp.applicantId,
      scope: "REPRESENTATION",
      scopeDetail: "ভাই রিপন শুধুমাত্র আবেদন জানাতে ও অবস্থা জানতে পারবেন; সিদ্ধান্ত নেবেন না; ময়ূরীর নিজের নিশ্চিতকরণ ছাড়া তথ্য চূড়ান্ত নয়",
      authorityStatus: "ACTIVE",
      representativeUserId: ripon.id,
      representativeName: "রিপন আক্তার (ভাই)",
      relationship: "ভাই",
      channel: "VOICE_IVR",
      recordedByUserId: helpline.id,
    },
  });
  await db.task.create({ data: { caseId: moyuriCase.id, title: "নিরাপদ যোগাযোগ নিয়ম পর্যালোচনা (A1)", type: "SAFETY_REVIEW", ownerRole: "DLAO_OFFICER", priority: "HIGH", reason: "সংবেদনশীল কেস — নিরাপদ যোগাযোগ সক্রিয়", sourceModule: "SAFE_CONTACT" } });

  // ==================================================================
  // A3 — Nabila (Jhenaidah): urgency, sensitive access, tracked referral
  // ==================================================================
  console.log("A3 Nabila…");
  const nabilaApp = await mkApplication({
    applicantName: "Nabila Khatun",
    district: "Jhenaidah",
    phone: "01822334455",
    channel: "WEB",
    caseType: "CYBER_HARASSMENT",
    narrative: "পুরাতন সহপাঠী ভুয়া/পরিবর্তিত ছবি ছড়িয়ে চাপ সৃষ্টি করছে। ক্ষতি বিস্তার লাভ করছে; কিছু প্রতিকারের জন্য অন্য সক্ষম কর্তৃপক্ষের প্রয়োজন হতে পারে।",
    provenance: "APPLICANT_CONFIRMED",
    urgencyFlag: true,
    sensitiveFlag: true,
    status: "SUBMITTED",
  });
  const nabilaCase = await mkCase(nabilaApp.id, { priority: "URGENT", sensitivity: "RESTRICTED", createdAtDaysAgo: 3, office: "জেলা আইনি সহায়তা কার্যালয়, ঝিনাইদহ", acceptedByUserId: officerJhenaidah.id });
  await db.application.update({ where: { id: nabilaApp.id }, data: { status: "SUBMITTED" } });
  // Restricted evidence — role-limited, every access logged
  await db.documentRecord.create({
    data: {
      caseId: nabilaCase.id,
      title: "প্রমাণ-প্যাকেজ: ভুয়া ছবির স্ক্রিনশট তালিকা (সংবেদনশীল)",
      docType: "PHOTO_EVIDENCE",
      textContent: "[সংবেদনশীল উপাদান — শুধুমাত্র অনুমোদিত ভূমিকা দেখতে পাবেন; প্রতিটি প্রবেশ লগ হয়]",
      provenance: "APPLICANT_CONFIRMED",
      uploadedByName: "নাবিলা খাতুন",
      sensitivity: "RESTRICTED",
      checksum: sha("nabila-evidence-v1"),
    },
  });
  // Tracked referral with acknowledgement deadline + ESCALATION on non-ack (failure test ready)
  await db.referral.create({
    data: {
      caseId: nabilaCase.id,
      kind: "REFERRAL",
      fromOffice: "জেলা আইনি সহায়তা কার্যালয়, ঝিনাইদহ",
      toOffice: "সাইবার ট্রাইব্যুনাল পথ (রেফারেল) — ঢাকা",
      reason: "ভুয়া/পরিবর্তিত ছবি বিস্তার — সাইবার-অপরাধ সংশ্লিষ্ট সক্ষম কর্তৃপক্ষের প্রয়োজন",
      historySummary: "আবেদন (APP), জরুরি পতাকা, সংবেদনশীল প্রমাণ-প্যাকেজ সংরক্ষিত; প্রবেশাধিকার সীমিত",
      documentIdsJson: "[]",
      responsibleActor: "গ্রহণকারী কর্তৃপক্ষের দায়িত্বপ্রাপ্ত কর্মকর্তা",
      expectedAction: "৩ কার্যদিবসের মধ্যে স্বীকৃতি; প্রমাণ-প্যাকেজ পর্যালোচনা; প্রয়োজনীয় পদক্ষেপ জানানো",
      deadline: new Date(now + 21 * day),
      ackDeadline: new Date(now - 1 * day), // already past → follow-up alert fires
      sensitive: true,
    },
  });
  await db.task.create({ data: { caseId: nabilaCase.id, title: "স্বীকৃতি পাওয়া যায়নি — সাইবার ট্রাইব্যুনাল পথ", type: "REFERRAL_ACK", ownerRole: "DLAO_OFFICER", priority: "HIGH", dueAt: new Date(now - 1 * day), reason: "স্বীকৃতির সময়সীমা অতিক্রান্ত — অনুসরণ সতর্কতা (A3 failure test)", sourceModule: "REFERRAL_FOLLOWUP" } });

  // ==================================================================
  // A4 — Nuching (Khagrachari): assisted access, translation provenance, offline
  // ==================================================================
  console.log("A4 Nuching…");
  const nuchingApp = await mkApplication({
    applicantName: "Nuching Marma",
    district: "Khagrachari",
    phone: "01933445566",
    contactNote: "নম্বরটি ইউডিসি উদ্যোক্তার — পরবর্তী যোগাযোগ সীমিত প্রবেশাধিকারে",
    channel: "ASSISTED_UDC",
    caseType: "LAND_DISPUTE",
    narrative: "পাহাড়ি জমির দখল নিয়ে বিরোধ। (মারমা ভাষায় বলা বিবরণের বাংলা অনুবাদ — ইউডিসি উদ্যোক্তা টাইপ করেছেন)",
    originalText: "ক্যাহ্যা মা লাই ক্যাং মা খ্যাং (মারমা ভাষায় মূল বক্তব্য — উদাহরণ পাঠ)",
    provenance: "INTERMEDIARY_TRANSLATED",
    statedByName: "নুচিং মারমা",
    assistedByUserId: udc.id,
    status: "SUBMITTED",
  });
  await db.consent.create({
    data: {
      applicationId: nuchingApp.id,
      grantedByApplicantId: nuchingApp.applicantId,
      scope: "ASSISTED_INTAKE",
      scopeDetail: "ইউডিসি উদ্যোক্তা আবেদনপত্র টাইপ/ছবি তোলায় সহায়তা করেছেন ও নিজের নম্বর ব্যবহার করেছেন; নুচিং সম্মতি দিয়েছেন; ইউডিসি-পরবর্তী প্রবেশাধিকার সীমিত",
      authorityStatus: "ACTIVE",
      representativeUserId: udc.id,
      representativeName: "জয়ন্ত চাকমা (ইউডিসি উদ্যোক্তা)",
      relationship: "সহায়তাকারী",
      channel: "ASSISTED_UDC",
      recordedByUserId: udc.id,
    },
  });
  const nuchingCase = await mkCase(nuchingApp.id, { priority: "HIGH", createdAtDaysAgo: 4, office: "জেলা আইনি সহায়তা কার্যালয়, খাগড়াছড়ি" });
  // document quality visible: one UNCLEAR photo (T6 "unclear" fixture)
  await db.documentRecord.create({
    data: {
      caseId: nuchingCase.id,
      title: "ভূমি দলিলের ছবি (অস্পষ্ট)",
      docType: "LAND_DEED",
      textContent: null,
      provenance: "INTERMEDIARY_TRANSLATED",
      uploadedByName: "জয়ন্ত চাকমা (ইউডিসি)",
      status: "UNCLEAR",
      qualityFlags: JSON.stringify(["UNREADABLE", "GLARE"]),
      checksum: sha("nuching-deed-photo"),
    },
  });
  // T9 offline sync history: 2 synced + 1 conflict (human review pending)
  await db.offlineSyncRecord.create({ data: { tempUuid: "7f0c1a44-9c1e-4d8a-9f2b-1a2b3c4d5e01", deviceId: "UDC-KHAG-01", payloadType: "APPLICATION", payloadJson: "{}", integrityHash: "n/a", status: "SYNCED", syncedAt: new Date(now - 3 * day), syncedEntityId: nuchingApp.id } });
  await db.offlineSyncRecord.create({ data: { tempUuid: "7f0c1a44-9c1e-4d8a-9f2b-1a2b3c4d5e02", deviceId: "UDC-KHAG-01", payloadType: "DOCUMENT", payloadJson: "{}", integrityHash: "n/a", status: "SYNCED", syncedAt: new Date(now - 3 * day) } });
  const conflictRecord = await db.offlineSyncRecord.create({ data: { tempUuid: "7f0c1a44-9c1e-4d8a-9f2b-1a2b3c4d5e03", deviceId: "UDC-KHAG-01", payloadType: "STATEMENT", payloadJson: "{\"text\":\"অফলাইনে সম্পাদিত বিবরণ-সংশোধন\"}", integrityHash: "n/a", status: "CONFLICT", conflictWithId: "server-copy", createdAt: new Date(now - 1 * day) } });
  await db.task.create({ data: { title: "অফলাইন-সম্পাদনা সংঘর্ষ — মানব-পর্যালোচনা (T9)", type: "DOCUMENT_CHECK", ownerRole: "CASE_SUPPORT", priority: "HIGH", reason: `সংঘর্ষ রেকর্ড ${conflictRecord.tempUuid.slice(0, 8)} — নীরবে ওভাররাইট করা হয়নি`, sourceModule: "T9_CONFLICT" } });

  // ==================================================================
  // A5 — Malek (Barguna): long-running case, unstable contact, lawyer follow-up
  // ==================================================================
  console.log("A5 Malek…");
  const malekApp = await mkApplication({
    applicantName: "Abdul Malek",
    district: "Barguna",
    phone: "01655667788",
    contactNote: "নম্বরটি দোকানের — আবেদনকারীর নিজের নয়",
    channel: "DLAO_WALKIN",
    caseType: "LABOUR_WAGES",
    narrative: "বকেয়া মজুরির মামলা; হিয়ারিংয়ের তারিখ অনানুষ্ঠানিকভাবে জানা যায়; ভ্রমণে দৈনিক মজুরি নষ্ট হয়; প্যানেল আইনজীবীর হালনাগাদ পাওয়া যায় না।",
    provenance: "STAFF_ENTERED",
    status: "SUBMITTED",
  });
  const malekCase = await mkCase(malekApp.id, { priority: "HIGH", createdAtDaysAgo: 210, office: "জেলা আইনি সহায়তা কার্যালয়, বরগুনা" });
  const malekAssignment = await db.lawyerAssignment.create({
    data: {
      caseId: malekCase.id,
      lawyerUserId: lawyerKabir.id,
      status: "ACCEPTED",
      acceptedAt: new Date(now - 200 * day),
      stage: "HEARING",
      lastUpdateAt: new Date(now - 45 * day),
    },
  });
  await db.lawyerUpdate.create({ data: { caseId: malekCase.id, lawyerAssignmentId: malekAssignment.id, text: "প্রাথমিক দাখিলা সম্পন্ন; পরবর্তী নির্দেশনা পরে জানাবো।", submittedAt: new Date(now - 45 * day) } });
  await db.hearing.create({ data: { caseId: malekCase.id, lawyerAssignmentId: malekAssignment.id, hearingDate: new Date(now - 60 * day), location: "বরগুনা জেলা আদালত", status: "HELD" } });
  await db.hearing.create({ data: { caseId: malekCase.id, lawyerAssignmentId: malekAssignment.id, hearingDate: new Date(now + 5 * day), location: "বরগুনা জেলা আদালত", status: "SCHEDULED" } });
  await db.task.create({ data: { caseId: malekCase.id, title: "হিয়ারিং-পূর্ব হালনাগাদ জমা দিন", type: "LAWYER_UPDATE", ownerRole: "LAWYER", ownerUserId: lawyerKabir.id, dueAt: new Date(now - 2 * day), status: "OVERDUE", priority: "HIGH", reason: "হিয়ারিংয়ের ২ দিন আগে হালনাগাদ জমা হয়নি — নাগরিক অযথা ভ্রমণ করবেন কি না জানেন না (A5 failure test)", sourceModule: "B5" } });
  // failed contact attempts are logged (A5)
  await db.contactAttempt.create({ data: { caseId: malekCase.id, attemptedNumber: "01655667788", attemptType: "CALL", outcome: "NO_ANSWER", notes: "দোকান বন্ধ ছিল — প্রচেষ্টা লগ হয়েছে" } });
  await db.contactAttempt.create({ data: { caseId: malekCase.id, attemptedNumber: "01655667788", attemptType: "CALL", outcome: "NO_ANSWER", notes: "দ্বিতীয় প্রচেষ্টা — ব্যর্থ" } });
  await db.task.create({ data: { caseId: malekCase.id, title: "বিকল্প যোগাযোগ ব্যবস্থা নিশ্চিত করুন", type: "STATUS_UPDATE", ownerRole: "CASE_SUPPORT", reason: "দোকানের নম্বরে ২টি ব্যর্থ প্রচেষ্টা — IVR/ইউএসএসডি রুট সক্রিয় আছে", sourceModule: "SAFE_CONTACT" } });

  // ==================================================================
  // T1 — Marzina Begum: lawyer-change + repeated inactivity + payment
  // ==================================================================
  console.log("T1 Marzina…");
  const marzinaApp = await mkApplication({
    applicantName: "Marzina Begum",
    district: "Joypurhat",
    phone: "01766778899",
    channel: "WEB",
    caseType: "DOWRY",
    narrative: "প্যানেল আইনজীবী হালনাগাদ দেন না, দুটি হিয়ারিং মিস হয়েছে; অন্য দুই মামলায়ও অনুরূপ নিষ্ক্রিয়তা।",
    provenance: "APPLICANT_CONFIRMED",
    status: "SUBMITTED",
  });
  const marzinaCase = await mkCase(marzinaApp.id, { priority: "HIGH", createdAtDaysAgo: 120 });
  const marzinaAssignment = await db.lawyerAssignment.create({
    data: { caseId: marzinaCase.id, lawyerUserId: lawyerKabir.id, status: "ACCEPTED", acceptedAt: new Date(now - 115 * day), stage: "HEARING", lastUpdateAt: new Date(now - 50 * day), paymentStatus: "PENDING_REVIEW", paymentNote: "হিয়ারিং পর্যায়ে কাজ সম্পন্ন হয়নি — পর্যায়ভিত্তিক পরিশোধ পুনর্মূল্যায়ন (T1)" },
  });
  await db.hearing.create({ data: { caseId: marzinaCase.id, lawyerAssignmentId: marzinaAssignment.id, hearingDate: new Date(now - 40 * day), location: "জয়পুরহাট জেলা আদালত", status: "MISSED", notes: "আইনজীবী উপস্থিত ছিলেন না" } });
  await db.hearing.create({ data: { caseId: marzinaCase.id, lawyerAssignmentId: marzinaAssignment.id, hearingDate: new Date(now - 20 * day), location: "জয়পুরহাট জেলা আদালত", status: "MISSED", notes: "দ্বিতীয় মিসড হিয়ারিং" } });
  await db.hearing.create({ data: { caseId: marzinaCase.id, lawyerAssignmentId: marzinaAssignment.id, hearingDate: new Date(now + 12 * day), location: "জয়পুরহাট জেলা আদালত", status: "SCHEDULED" } });
  await db.task.create({ data: { caseId: marzinaCase.id, title: "হালনাগাদ জমা দিন", type: "LAWYER_UPDATE", ownerRole: "LAWYER", ownerUserId: lawyerKabir.id, dueAt: new Date(now - 10 * day), status: "OVERDUE", priority: "HIGH", reason: "সময়সীমা অতিক্রান্ত", sourceModule: "B5" } });
  await db.lawyerChangeRequest.create({
    data: {
      caseId: marzinaCase.id,
      requestedByName: "মারজিনা বেগম",
      requestedByRole: "CITIZEN",
      reason: "আইনজীবী দুই হিয়ারিংয়ে অনুপস্থিত ও হালনাগাদ দেন না — নতুন আইনজীবী চাই।",
      status: "SUBMITTED",
    },
  });
  // two OTHER cases of the same lawyer showing similar inactivity (pattern)
  for (const other of ["Salma Begum", "Rehana Parvin"]) {
    const otherApp = await mkApplication({ applicantName: other, district: "Joypurhat", channel: "WEB", caseType: "MAINTENANCE", narrative: "ভরণপোষণ মামলা।", provenance: "APPLICANT_CONFIRMED", status: "SUBMITTED", createdAtDaysAgo: 90 });
    const otherCase = await mkCase(otherApp.id, { createdAtDaysAgo: 85 });
    const a = await db.lawyerAssignment.create({ data: { caseId: otherCase.id, lawyerUserId: lawyerKabir.id, status: "ACCEPTED", acceptedAt: new Date(now - 80 * day), stage: "PRE_LITIGATION", lastUpdateAt: new Date(now - 60 * day) } });
    await db.task.create({ data: { caseId: otherCase.id, title: "হালনাগাদ জমা দিন", type: "LAWYER_UPDATE", ownerRole: "LAWYER", ownerUserId: lawyerKabir.id, dueAt: new Date(now - 15 * day), status: "OVERDUE", reason: "সময়সীমা অতিক্রান্ত (প্যাটার্ন নমুনা)", sourceModule: "B5" } });
  }
  await db.task.create({ data: { caseId: marzinaCase.id, title: "প্যাটার্ন-সতর্কতা: প্যানেল আইনজীবীর বারবার নিষ্ক্রিয়তা (মানব-পর্যালোচনা)", type: "LAWYER_UPDATE", ownerRole: "DLAO_OFFICER", priority: "HIGH", reason: "এই মামলায় মিসড হিয়ারিং ২টি; একই আইনজীবীর অন্য ২টি মামলায় অনুরূপ নিষ্ক্রিয়তা। প্যাটার্ন-সতর্কতা শুধু পর্যালোচনার জন্য — অসদাচরণ প্রমাণ করে না (T1 guardrail)।", sourceModule: "T1_PATTERN_ALERT" } });

  // ==================================================================
  // T2 — Rahim Mia: jurisdiction ping-pong (2 returns → escalation)
  // ==================================================================
  console.log("T2 Rahim…");
  const rahimApp = await mkApplication({ applicantName: "Rahim Mia", district: "Dhaka", phone: "01777889900", channel: "WEB", caseType: "LABOUR_WAGES", narrative: "কারখানার বকেয়া ক্ষতিপূরণ — কার্যালয় ও শ্রম আইনি সহায়তা সেলের মধ্যে বারবার স্থানান্তর।", provenance: "APPLICANT_CONFIRMED", status: "SUBMITTED", createdAtDaysAgo: 25 });
  const rahimCase = await mkCase(rahimApp.id, { priority: "MEDIUM", createdAtDaysAgo: 24, office: "জেলা আইনি সহায়তা কার্যালয়, ঢাকা" });
  await db.referral.create({
    data: {
      caseId: rahimCase.id,
      kind: "JURISDICTION_TRANSFER",
      fromOffice: "জেলা আইনি সহায়তা কার্যালয়, ঢাকা",
      toOffice: "শ্রম আইনি সহায়তা সেল",
      reason: "শ্রম-বিষয়ক বলে সেলে পাঠানো হয়েছিল",
      historySummary: "স্থানান্তর-ইতিহাস: ডিএলএও → সেল → ডিএলএও → সেল (ফেরত সহ)",
      documentIdsJson: "[]",
      responsibleActor: "উভয় প্রতিষ্ঠানের দায়িত্বপ্রাপ্ত কর্মকর্তা",
      expectedAction: "এখতিয়ার নির্ধারণ ও স্বীকৃতি",
      deadline: new Date(now + 10 * day),
      ackDeadline: new Date(now + 2 * day),
      returnCount: 2,
      escalationLevel: 1,
      ackStatus: "ESCALATED",
      ackReason: "২ বার ফেরত/প্রত্যাখ্যান — সিস্টেম উত্তোলন করেছে (T2)",
    },
  });
  await db.task.create({ data: { caseId: rahimCase.id, title: "এখতিয়ার বিরোধ — চূড়ান্ত রাউটিং সিদ্ধান্ত প্রয়োজন (T2)", type: "ROUTING_DECISION", ownerRole: "DLAO_OFFICER", priority: "HIGH", reason: "সিস্টেম শুধু উত্তোলন করেছে; চূড়ান্ত এখতিয়ার-সিদ্ধান্ত অনুমোদিত মানুষই নেবেন।", sourceModule: "T2_ESCALATION" } });

  // ==================================================================
  // T3 — Salma Begum & co-workers: one incident, three linked cases
  // ==================================================================
  console.log("T3 factory fire…");
  const group = await db.incidentGroup.create({
    data: { name: "কারখানা অগ্নিকাণ্ড — গাজীপুর (উদাহরণ)", incidentDate: new Date(now - 20 * day), location: "গাজীপুর কারখানা", description: "একই অগ্নিকাণ্ডে ক্ষতিগ্রস্ত শ্রমিকদের পৃথক দাবি — সংযুক্ত (link), একত্রীকরণ (merge) নয়।", createdById: admin.id },
  });
  const t3workers = ["Salma Begum", "Shefali Begum", "Rokeya Akter"];
  const t3cases: string[] = [];
  for (const [i, w] of t3workers.entries()) {
    const app = await mkApplication({ applicantName: w, district: "Dhaka", channel: "UDC" in { UDC: 1 } ? "ASSISTED_UDC" : "ASSISTED_UDC", caseType: "LABOUR_WAGES", narrative: "কারখানা অগ্নিকাণ্ডে আহত/ক্ষতিগ্রস্ত — পৃথক দাবি।", provenance: i === 0 ? "APPLICANT_CONFIRMED" : "STAFF_ENTERED", status: "SUBMITTED", createdAtDaysAgo: 15 });
    const kase = await mkCase(app.id, { priority: "MEDIUM", createdAtDaysAgo: 14, office: "জেলা আইনি সহায়তা কার্যালয়, ঢাকা" });
    await db.case.update({ where: { id: kase.id }, data: { incidentGroupId: group.id } });
    t3cases.push(kase.id);
  }
  await db.documentRecord.create({
    data: { caseId: t3cases[0], title: "সাধারণ প্রমাণ: অগ্নিকাণ্ডের প্রতিবেদন (গ্রুপ-শেয়ারড)", docType: "OTHER", textContent: "ফায়ার সার্ভিস প্রতিবেদন — উদাহরণ পাঠ; একবার আপলোড, গোটা গ্রুপে দৃশ্যমান।", provenance: "STAFF_ENTERED", uploadedByName: support.name, incidentGroupId: group.id, checksum: sha("fire-report") },
  });

  // ==================================================================
  // T4 — duplicate demo corpus (10–15 records incl. traps)
  // ==================================================================
  console.log("T4 duplicate corpus…");
  const t4corpus: { name: string; phone: string; district: string; nid?: string; type: string; note: string }[] = [
    { name: "Jahanara Begum", phone: "01710101001", district: "Joypurhat", nid: "1990123456789", type: "MAINTENANCE", note: "genuine A" },
    { name: "Jahanara Begam", phone: "01710101001", district: "Joypurhat", nid: "1990123456789", type: "MAINTENANCE", note: "genuine duplicate of A (spelling variant)" },
    { name: "Rahima Begum", phone: "01720202002", district: "Rajshahi", nid: "1988123450001", type: "DOWRY", note: "genuine B" },
    { name: "Rahima Begum", phone: "01720202002", district: "Rajshahi", nid: "1988123450001", type: "DOWRY", note: "genuine duplicate of B" },
    { name: "রহিমা বেগম", phone: "01730303003", district: "Khulna", nid: "1992123450002", type: "MAINTENANCE", note: "TRAP: similar name to B, different person (different district/phone/nid)" },
    { name: "Karim Uddin", phone: "01740404004", district: "Dhaka", nid: "1985123450003", type: "LABOUR_WAGES", note: "C" },
    { name: "Karim Uddin", phone: "01740404004", district: "Dhaka", nid: "1985123450003", type: "LABOUR_WAGES", note: "genuine duplicate of C" },
    { name: "করিম উদ্দিন", phone: "01750505005", district: "Chattogram", nid: "1983123450004", type: "LAND_DISPUTE", note: "TRAP: similar name to C, different person" },
    { name: "Nurjahan Khatun", phone: "01760606006", district: "Barishal", nid: "1994123450005", type: "DOMESTIC_VIOLENCE", note: "D" },
    { name: "Nurjahan Khatun", phone: "01760606067", district: "Barishal", nid: "1994123450005", type: "DOMESTIC_VIOLENCE", note: "probable duplicate of D (typo phone, same nid)" },
    { name: "Abdul Jalil", phone: "01770707007", district: "Rangpur", nid: "1982123450006", type: "FRAUD", note: "E" },
    { name: "Abdul Malek", phone: "01770707007", district: "Rangpur", nid: "1982123450999", type: "FRAUD", note: "TRAP-ish: same phone (family shop), different person" },
  ];
  for (const c of t4corpus) {
    await mkApplication({
      applicantName: c.name, district: c.district, phone: c.phone, nidRef: c.nid,
      channel: "WEB", caseType: c.type, narrative: `${c.note} — ডেমো কর্পাস রেকর্ড।`,
      provenance: "APPLICANT_CONFIRMED", status: "UNDER_REVIEW", createdAtDaysAgo: 1,
    });
  }

  // ==================================================================
  // T6 — document corpus (5–6 docs, one missing item, one unclear)
  // ==================================================================
  console.log("T6 document corpus…");
  const t6app = await mkApplication({ applicantName: "Shahida Begum", district: "Rajshahi", phone: "01780808008", channel: "WEB", caseType: "LAND_DISPUTE", narrative: "পৈতৃক জমির দখল নিয়ে বিরোধ।", provenance: "APPLICANT_CONFIRMED", status: "UNDER_REVIEW", createdAtDaysAgo: 6 });
  const t6case = await mkCase(t6app.id, { priority: "MEDIUM", createdAtDaysAgo: 5 });
  const t6docs = [
    { title: "আবেদনপত্র (স্বাক্ষরিত)", docType: "OTHER", textContent: "আবেদনপত্র: শাহিদা বেগম, রাজশাহী। পৈতৃক জমির দখল বিরোধের বিবরণ। স্বাক্ষর: শাহিদা বেগম, তারিখ উপস্থিত।", flags: [] },
    { title: "জাতীয় পরিচয়পত্রের কপি", docType: "NID", textContent: "জাতীয় পরিচয়পত্র: শাহিদা বেগম; জন্মতারিখ ১৯৯০; ঠিকানা রাজশাহী। (উদাহরণ পাঠ — প্রকৃত NID নয়)", flags: [] },
    { title: "দলিল (খতিয়ান সহ)", docType: "LAND_DEED", textContent: "দলিল নং ৪৫২১/২০১৫, রাজশাহী সাব-রেজিস্ট্রি; দাগ নম্বর ১২৩; পরিমাণ ০.৩০ একর। খতিয়ান: ৫৫৬/১৯৯৮।", flags: [] },
    { title: "চিকিৎসা প্রতিবেদন", docType: "MEDICAL_REPORT", textContent: "চিকিৎসা প্রতিবেদন: রোগী শাহিদা বেগম; ডাক্তারের স্বাক্ষর অনুপস্থিত; রেজিস্ট্রেশন নম্বর অপঠনযোগ্য। পরীক্ষার তারিখ উল্লেখ আছে।", flags: ["MISSING_SIGNATURE"] },
    { title: "জরিপ মানচিত্রের ছবি", docType: "OTHER", textContent: null, flags: ["UNREADABLE"] },
  ];
  for (const d of t6docs) {
    await db.documentRecord.create({
      data: { caseId: t6case.id, title: d.title, docType: d.docType, textContent: d.textContent, provenance: "APPLICANT_CONFIRMED", uploadedByName: "শাহিদা বেগম", status: d.flags.includes("UNREADABLE") ? "UNCLEAR" : "CURRENT", qualityFlags: JSON.stringify(d.flags), checksum: sha(d.title) },
    });
  }
  // the deliberately MISSING required item is surfaced by checklist comparison (income/evidence not uploaded)

  // ==================================================================
  // B2/T7/T11 — mediation + settlement chain (Joypurhat maintenance case)
  // ==================================================================
  console.log("B2 mediation chain…");
  const medApp = await mkApplication({ applicantName: "Ayesha Siddika", district: "Joypurhat", phone: "01790909009", channel: "WEB", caseType: "MAINTENANCE", narrative: "সন্তানের ভরণপোষণ পাওয়া যাচ্ছে না; পালামধ্যস্থতায় নিষ্পত্তি চাই।", provenance: "APPLICANT_CONFIRMED", status: "SUBMITTED", createdAtDaysAgo: 18 });
  const medCase = await mkCase(medApp.id, { priority: "MEDIUM", createdAtDaysAgo: 17 });
  const medSession = await db.mediationSession.create({
    data: {
      caseId: medCase.id,
      mediatorUserId: mediator.id,
      scheduledAt: new Date(now + 3 * day),
      mode: "HYBRID",
      locationOrLink: "জেলা আইনি সহায়তা কার্যালয় / ভিডিও-লিংক",
      partyAName: "আয়েশা সিদ্দিকা",
      partyBName: "মিজানুর রহমান",
      status: "NOTICES_SENT",
      noticesJson: JSON.stringify([
        { party: "আয়েশা সিদ্দিকা", channel: "SMS", sentAt: new Date(now - 1 * day).toISOString(), ack: true },
        { party: "মিজানুর রহমান", channel: "SMS", sentAt: new Date(now - 1 * day).toISOString(), ack: false },
      ]),
      inPersonFallbackReason: "প্রযুক্তিগত ব্যর্থতা হলে সশরীরে বিকল্প সংরক্ষিত (B2)",
    },
  });
  // A FINALIZED draft ready for T11 signing + a DRAFT pending review for T7 live flow
  await db.settlementDraft.create({
    data: {
      caseId: medCase.id,
      mediationSessionId: medSession.id,
      templateType: "MAINTENANCE",
      mediatorNotes: "পক্ষ-ক: আয়েশা সিদ্দিকা; পক্ষ-খ: মিজানুর রহমান। সন্তানের ভরণপোষণ মাসিক ৫,০০০ টাকা; প্রতি মাসের ১০ তারিখে বিকাশে; বকেয়া ১৫,০০০ টাকা ২ কিস্তিতে। মধ্যস্থতার তারিখ এই মাসের ১০ তারিখ।",
      draftText: "ভরণপোষণ নিষ্পত্তি চুক্তি (খসড়া v১)\n\nপক্ষগণ: আয়েশা সিদ্দিকা (পক্ষ-ক) ও মিজানুর রহমান (পক্ষ-খ)।\n১. পক্ষ-খ প্রতি মাসের ১০ তারিখে সন্তানের ভরণপোষণ মাসিক ৫,০০০ টাকা বিকাশে পরিশোধ করবেন। [এআই-অনুমিত: পরিশোধ মাধ্যম নোটে বিকাশ উল্লেখ ছিল]\n২. বকেয়া ১৫,০০০ টাকা ২টি কিস্তিতে পরিশোধ হবে।\n৩. [স্থানধারক: পক্ষগণের পূর্ণ ঠিকানা]\n\nএই দলিল একটি খসড়া — মানব আইনি পর্যালোচনা, পক্ষের বোঝাপড়া ও সম্মতি ছাড়া চূড়ান্ত নয়।",
      aiSegmentsJson: JSON.stringify([{ text: "[এআই-অনুমিত: পরিশোধ মাধ্যম নোটে বিকাশ উল্লেখ ছিল]", reason: "নোটের ভিত্তিতে অনুমিত ব্যাখ্যা" }]),
      warningsJson: JSON.stringify([{ warning: "মধ্যস্থতার তারিখ 'এই মাসের ১০ তারিখ' — নির্দিষ্ট তারিখ যোগ করতে হবে।", severity: "MEDIUM" }]),
      status: "FINALIZED",
      reviewedByUserId: mediator.id,
      reviewNotes: "পর্যালোচনা সম্পন্ন — পরিমাণ ও তারিখ নিশ্চিত; স্বাক্ষরের জন্য প্রস্তুত।",
      finalizedText: "ভরণপোষণ নিষ্পত্তি চুক্তি (চূড়ান্ত v১)\n\nপক্ষগণ: আয়েশা সিদ্দিকা (পক্ষ-ক) ও মিজানুর রহমান (পক্ষ-খ)।\n১. পক্ষ-খ প্রতি মাসের ১০ তারিখে সন্তানের ভরণপোষণ মাসিক ৫,০০০ টাকা বিকাশে পরিশোধ করবেন।\n২. বকেয়া ১৫,০০০ টাকা ২টি কিস্তিতে পরিশোধ হবে: আগামী ২০ ও ৩০ তারিখে ৭,৫০০ টাকা করে।\n৩. মধ্যস্থতার তারিখ: এই মাসের ১০ তারিখ।\n\nএই দলিল একটি খসড়া-নিষ্পত্তি — মানব আইনি পর্যালোচনা সম্পন্ন; পক্ষের বোঝাপড়া ও সম্মতিসহ স্বাক্ষরিত হলে কার্যকর হবে।",
      version: 1,
    },
  });

  // ==================================================================
  // B6 — receiving office referral sample (complete package arriving)
  // ==================================================================
  console.log("B6 referral sample…");
  const b6app = await mkApplication({ applicantName: "Hasan Ali", district: "Dhaka", phone: "01711112222", channel: "WEB", caseType: "FRAUD", narrative: "প্রতারণার শিকার — ঢাকায় প্রেরিত রেফারেল-নমুনা।", provenance: "APPLICANT_CONFIRMED", status: "SUBMITTED", createdAtDaysAgo: 8 });
  const b6case = await mkCase(b6app.id, { priority: "MEDIUM", createdAtDaysAgo: 7, office: "জেলা আইনি সহায়তা কার্যালয়, রাজশাহী" });
  await db.referral.create({
    data: {
      caseId: b6case.id,
      kind: "REFERRAL",
      fromOffice: "জেলা আইনি সহায়তা কার্যালয়, রাজশাহী",
      toOffice: "জেলা আইনি সহায়তা কার্যালয়, ঢাকা",
      reason: "আবেদনকারী বর্তমানে ঢাকায় — স্থানীয় অনুসরণের জন্য",
      historySummary: "সম্পূর্ণ প্যাকেজ: আবেদন, বিবরণ-ইতিহাস, নথি-তালিকা, দায়িত্বপ্রাপ্ত কর্মকর্তা ও প্রত্যাশিত পদক্ষেপ সহ",
      documentIdsJson: "[]",
      responsibleActor: "গ্রহণকারী ডিএলএও কর্মকর্তা",
      expectedAction: "স্বীকৃতি → গ্রহণ/ফেরত → পরবর্তী পদক্ষেপ",
      deadline: new Date(now + 20 * day),
      ackDeadline: new Date(now + 4 * day),
    },
  });

  // ==================================================================
  // T8 — five triage-ready sample cases (one will surface a conflict)
  // ==================================================================
  console.log("T8 triage samples…");
  const t8samples: { name: string; type: string; narrative: string; urgency?: boolean; sensitive?: boolean }[] = [
    { name: "Taslima Akter", type: "DOMESTIC_VIOLENCE", narrative: "শারীরিক নির্যাতনের শিকার; নথি অসম্পূর্ণ (চিকিৎসা প্রতিবেদন নেই)।", urgency: true },
    { name: "Mizanur Rahman", type: "LABOUR_WAGES", narrative: "কারখানার বকেয়া মজুরি; নিয়োগপত্র আছে।" },
    { name: "Ruma Khatun", type: "CYBER_HARASSMENT", narrative: "অনলাইনে ভুয়া ছবি ছড়ানো হচ্ছে।", sensitive: true },
    { name: "Jahangir Alam", type: "LAND_DISPUTE", narrative: "জমির দখল বিরোধ; দলিল সম্পূর্ণ।" },
    { name: "Fatemah Begum", type: "MAINTENANCE", narrative: "ভরণপোষণ দাবি; নথি আংশিক।" },
  ];
  for (const s of t8samples) {
    const app = await mkApplication({ applicantName: s.name, district: "Dhaka", channel: "WEB", caseType: s.type, narrative: s.narrative, provenance: "APPLICANT_CONFIRMED", status: "UNDER_REVIEW", urgencyFlag: s.urgency, sensitiveFlag: s.sensitive, createdAtDaysAgo: 1 });
    await mkCase(app.id, { priority: "MEDIUM", createdAtDaysAgo: 1 });
  }

  // Checklist templates mirror constants.CHECKLISTS
  console.log("Checklists…");
  const { CHECKLISTS } = await import("../src/lib/constants");
  for (const [caseType, items] of Object.entries(CHECKLISTS)) {
    await db.checklistTemplate.create({ data: { caseType, itemsJson: JSON.stringify(items) } });
  }

  // Counters
  await db.counter.create({ data: { key: `APP-${year}`, value: appSeq } });
  await db.counter.create({ data: { key: `CASE-${year}`, value: caseSeq } });

  console.log(`Seed complete: ${appSeq} applications, ${caseSeq} cases.`);
  console.log("Login PIN for every demo account: 1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
