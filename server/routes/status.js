// ============================================================================
// Status Door Route Handler
// Single endpoint for low-tech doors (IVR, USSD, Web Tracker).
// ============================================================================
'use strict';

const db = require('../db');
const { writeAudit } = require('../services/audit');

function statusTextBn(status, caseType) {
  switch (status) {
    case "SUBMITTED":
      return { headline: "আবেদন জমা হয়েছে", nextStep: "কার্যালয় আপনার আবেদন যাচাই করবে। সাধারণত কয়েকদিনের মধ্যে প্রাথমিক পর্যালোচনা সম্পন্ন হয়।" };
    case "UNDER_REVIEW":
      return { headline: "যাচাই-পর্যালোচনা চলছে", nextStep: "কর্মকর্তা আপনার তথ্য ও নথি পরীক্ষা করছেন। প্রয়োজনে কার্যালয় যোগাযোগ করবে।" };
    case "MORE_INFO_NEEDED":
      return { headline: "অতিরিক্ত তথ্য প্রয়োজন", nextStep: "কার্যালয়ে যোগাযোগ করে অনুরোধকৃত তথ্য/নথি জমা দিন।" };
    case "ACCEPTED":
    case "CONVERTED_TO_CASE":
      return { headline: "আবেদন অনুমোদিত — মামলা রেকর্ড খোলা হয়েছে", nextStep: `আপনার মামলা (${caseType}) প্রক্রিয়াধীন। পরবর্তী পদক্ষেপ সম্পর্কে জানতে এই নম্বরে আবার কল করুন।` };
    case "REJECTED":
      return { headline: "আবেদন অনুমোদিত হয়নি", nextStep: "কারণ জানতে ও পরবর্তী পথ-নির্দেশনার জন্য কার্যালয়ে যোগাযোগ করুন। আপিলের তথ্যও কার্যালয় দেবে।" };
    default:
      return { headline: "অবস্থা পাওয়া যায়নি", nextStep: "কার্যালয়ে যোগাযোগ করুন।" };
  }
}

function handleStatus(req, res, pathParts, query, body, ctx) {
  if (req.method === 'GET') {
    const reference = (query.reference || ctx?.citizenApplicationId || '').trim();
    if (!reference) return { status: 400, data: { error: 'reference parameter is required' } };

    let application = null;
    let kase = null;

    if (reference.startsWith('APP-')) {
      application = db.get(`
        SELECT a.*, ap.fullName, ap.district as applicantDistrict, ap.primaryPhone, ap.nidRef
        FROM Application a
        JOIN Applicant ap ON a.applicantId = ap.id
        WHERE a.id = ?
      `, [reference]);
      if (application) {
        kase = db.get('SELECT * FROM "Case" WHERE applicationId = ?', [application.id]);
      }
    } else if (reference.startsWith('CASE-')) {
      kase = db.get('SELECT * FROM "Case" WHERE id = ?', [reference]);
      if (kase) {
        application = db.get(`
          SELECT a.*, ap.fullName, ap.district as applicantDistrict, ap.primaryPhone, ap.nidRef
          FROM Application a
          JOIN Applicant ap ON a.applicantId = ap.id
          WHERE a.id = ?
        `, [kase.applicationId]);
      }
    }

    if (!application) {
      return { status: 404, data: { error: 'Record not found for given reference' } };
    }

    // Role scope guard
    if (ctx && (ctx.role === 'CITIZEN' || ctx.role === 'REPRESENTATIVE') && ctx.citizenApplicationId !== application.id) {
      return { status: 403, data: { error: 'Forbidden scope' } };
    }

    const contactRule = kase
      ? db.get('SELECT * FROM ContactRule WHERE caseId = ? AND active = 1', [kase.id])
      : null;

    const safeStatus = statusTextBn(kase?.status || application.status, application.caseType);
    const neutral = contactRule ? Boolean(contactRule.neutralWording) : false;

    const nextHearing = kase
      ? db.get("SELECT * FROM Hearing WHERE caseId = ? AND status = 'SCHEDULED' ORDER BY hearingDate ASC LIMIT 1", [kase.id])
      : null;

    const failedAttempts = kase
      ? db.get("SELECT count(*) as cnt FROM ContactAttempt WHERE caseId = ? AND outcome IN ('NO_ANSWER', 'FAILED', 'BLOCKED_UNSAFE')", [kase.id])?.cnt || 0
      : 0;

    const entries = db.query('SELECT * FROM RecordEntry WHERE applicationId = ? ORDER BY createdAt DESC LIMIT 5', [application.id]);

    writeAudit({
      actor: ctx ? { userId: ctx.userId, name: ctx.name, role: ctx.role } : { name: application.fullName, role: "CITIZEN" },
      channel: ctx?.role || "WEB",
      action: "STATUS_LOOKED_UP",
      entityType: "Application",
      entityId: application.id,
      applicationId: application.id,
      caseId: kase?.id || null,
      onWhoseAuthority: application.fullName,
    });

    return {
      found: true,
      reference: application.id,
      caseId: kase?.id || null,
      status: kase?.status || application.status,
      headline: neutral ? "আপনার আবেদন সংরক্ষিত আছে" : safeStatus.headline,
      nextStep: safeStatus.nextStep,
      caseType: neutral ? null : application.caseType,
      nextHearing: nextHearing && !neutral
        ? { date: nextHearing.hearingDate, location: nextHearing.location }
        : null,
      failedContactAttempts: failedAttempts,
      safeContactActive: Boolean(contactRule),
      applicantName: application.fullName,
      provenanceEntries: entries.map((e) => ({
        id: e.id,
        provenance: e.provenance,
        text: (e.content || "").slice(0, 300),
        createdAt: e.createdAt,
      })),
    };
  }

  return { status: 405, data: { error: 'Method not allowed' } };
}

module.exports = { handleStatus };
