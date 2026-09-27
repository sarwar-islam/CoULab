// ============================================================================
// Referrals Route Handler (B6 / T2 / A3)
// Inter-office referrals, ping-pong return tracking, human routing escalation.
// ============================================================================
'use strict';

const crypto = require('crypto');
const db = require('../db');
const { writeAudit } = require('../services/audit');
const { JURISDICTION_RETURN_ESCALATION_THRESHOLD } = require('../constants');

function handleReferrals(req, res, pathParts, query, body, ctx) {
  // GET /api/referrals
  if (req.method === 'GET') {
    let whereClause = '1=1';
    const params = [];

    if (ctx && ctx.role === 'RECEIVING_DLAO') {
      whereClause += ' AND r.toOffice = ?';
      params.push(ctx.office || '__none__');
    }

    const referrals = db.query(`
      SELECT r.*, c.caseType, c.priority, c.sensitivity, c.office as caseOffice,
             ap.fullName as applicantName
      FROM Referral r
      JOIN "Case" c ON r.caseId = c.id
      JOIN Application a ON c.applicationId = a.id
      JOIN Applicant ap ON a.applicantId = ap.id
      WHERE ${whereClause}
      ORDER BY r.createdAt DESC
      LIMIT 100
    `, params);

    return { referrals };
  }

  // POST /api/referrals -> Create Tracked Referral
  if (req.method === 'POST') {
    const { caseId, toOffice, reason, historySummary, responsibleActor, expectedAction, kind = "REFERRAL", ackDays = 3, documentIds = [] } = body;
    if (!caseId || !toOffice || !reason || !historySummary || !responsibleActor || !expectedAction) {
      return { status: 400, data: { error: 'Missing required referral fields' } };
    }

    const kase = db.get('SELECT * FROM "Case" WHERE id = ?', [caseId]);
    if (!kase) return { status: 404, data: { error: 'Case not found' } };
    if (toOffice === kase.office) return { status: 400, data: { error: 'INVALID_TARGET_SAME_OFFICE' } };

    const referralId = 'ref_' + crypto.randomBytes(8).toString('hex');
    const now = new Date();
    const ackDeadline = new Date(now.getTime() + ackDays * 86400000).toISOString();
    const deadline = new Date(now.getTime() + 30 * 86400000).toISOString();

    const nowIso = now.toISOString();
    db.transaction(() => {
      db.run(`
        INSERT INTO Referral (
          id, caseId, kind, fromOffice, toOffice, reason, historySummary,
          documentIdsJson, responsibleActor, expectedAction, deadline,
          ackDeadline, sensitive, ackStatus, returnCount, escalationLevel, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        referralId, caseId, kind, kase.office, toOffice, reason, historySummary,
        JSON.stringify(documentIds), responsibleActor, expectedAction, deadline,
        ackDeadline, kase.sensitivity !== 'NORMAL' ? 1 : 0, 'SENT', 0, 0, nowIso, nowIso
      ]);

      const taskId = 'task_' + crypto.randomBytes(8).toString('hex');
      db.run(`
        INSERT INTO Task (
          id, caseId, title, type, ownerRole, dueAt, reason, sourceModule, status, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        taskId, caseId, `রেফারেল স্বীকৃতি অনুসরণ — ${toOffice}`, 'REFERRAL_ACK',
        'DLAO_OFFICER', ackDeadline, `${ackDays} দিনের মধ্যে স্বীকৃতি না এলে অনুসরণ সতর্কতা জারি হবে`,
        'REFERRAL_SERVICE', 'OPEN', nowIso, nowIso
      ]);
    });

    const actor = ctx ? { userId: ctx.userId, name: ctx.name, role: ctx.role } : { name: "দায়িত্বপ্রাপ্ত কর্মকর্তা", role: "DLAO_OFFICER" };
    writeAudit({
      actor,
      channel: 'WEB',
      action: kind === 'JURISDICTION_TRANSFER' ? 'T2_JURISDICTION_TRANSFER_SENT' : 'REFERRAL_SENT',
      entityType: 'Referral',
      entityId: referralId,
      caseId,
      after: `${kase.office} -> ${toOffice}`,
      onWhoseAuthority: ctx?.name || 'কর্মকর্তা',
      metadata: { reason, ackDays }
    });

    const referral = db.get('SELECT * FROM Referral WHERE id = ?', [referralId]);
    return { status: 201, data: { referral } };
  }

  // PATCH /api/referrals -> Acknowledge, Accept, Return, Escalate, Route
  if (req.method === 'PATCH') {
    const { referralId, action, reason, finalOffice } = body;
    if (!referralId || !action) {
      return { status: 400, data: { error: 'referralId and action are required' } };
    }

    const referral = db.get('SELECT * FROM Referral WHERE id = ?', [referralId]);
    if (!referral) return { status: 404, data: { error: 'Referral not found' } };

    const actor = ctx ? { userId: ctx.userId, name: ctx.name, role: ctx.role } : { name: "কর্মকর্তা", role: "DLAO_OFFICER" };
    const isReceiver = ctx?.role === "RECEIVING_DLAO" || ctx?.office === referral.toOffice || ctx?.role === "ADMIN";

    if (action === 'acknowledge') {
      if (!isReceiver) return { status: 403, data: { error: 'FORBIDDEN_ONLY_RECEIVER' } };
      const now = new Date().toISOString();
      db.run('UPDATE Referral SET ackStatus = ?, ackAt = ? WHERE id = ?', ['ACKNOWLEDGED', now, referralId]);
      db.run(`UPDATE Task SET status = 'DONE' WHERE caseId = ? AND type = 'REFERRAL_ACK'`, [referral.caseId]);
      writeAudit({
        actor,
        channel: 'WEB',
        action: 'REFERRAL_ACKNOWLEDGED',
        entityType: 'Referral',
        entityId: referralId,
        caseId: referral.caseId,
        before: referral.ackStatus,
        after: 'ACKNOWLEDGED',
        onWhoseAuthority: ctx?.name || 'রিসিভার'
      });
      return { success: true, ackStatus: 'ACKNOWLEDGED' };
    }

    if (action === 'accept') {
      if (!isReceiver) return { status: 403, data: { error: 'FORBIDDEN_ONLY_RECEIVER' } };
      if (!reason) return { status: 400, data: { error: 'VALIDATION_REASON_REQUIRED' } };
      const now = new Date().toISOString();
      db.run('UPDATE Referral SET ackStatus = ?, ackReason = ?, ackAt = ? WHERE id = ?', ['ACCEPTED', reason, now, referralId]);
      db.run('UPDATE "Case" SET office = ? WHERE id = ?', [referral.toOffice, referral.caseId]);
      writeAudit({
        actor,
        channel: 'WEB',
        action: 'REFERRAL_ACCEPTED',
        entityType: 'Referral',
        entityId: referralId,
        caseId: referral.caseId,
        before: referral.ackStatus,
        after: 'ACCEPTED',
        reason,
        onWhoseAuthority: ctx?.name || 'রিসিভার'
      });
      return { success: true, ackStatus: 'ACCEPTED' };
    }

    if (action === 'return') {
      if (!isReceiver) return { status: 403, data: { error: 'FORBIDDEN_ONLY_RECEIVER' } };
      if (!reason) return { status: 400, data: { error: 'VALIDATION_RETURN_REASON_REQUIRED' } };

      const newReturnCount = (referral.returnCount || 0) + 1;
      const mustEscalate = newReturnCount >= JURISDICTION_RETURN_ESCALATION_THRESHOLD;
      const newStatus = mustEscalate ? 'ESCALATED' : 'RETURNED';
      const newEscalation = mustEscalate ? (referral.escalationLevel || 0) + 1 : referral.escalationLevel;

      const nowIso = new Date().toISOString();
      db.run(`
        UPDATE Referral
        SET ackStatus = ?, ackReason = ?, returnCount = ?, escalationLevel = ?, updatedAt = ?
        WHERE id = ?
      `, [newStatus, reason, newReturnCount, newEscalation, nowIso, referralId]);

      if (mustEscalate) {
        const taskId = 'task_' + crypto.randomBytes(8).toString('hex');
        db.run(`
          INSERT INTO Task (id, caseId, title, type, ownerRole, priority, reason, sourceModule, status, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          taskId, referral.caseId, 'এখতিয়ার বিরোধ — চূড়ান্ত রাউটিং সিদ্ধান্ত প্রয়োজন (T2)',
          'ROUTING_DECISION', 'DLAO_OFFICER', 'HIGH',
          `${newReturnCount} বার ফেরত/প্রত্যাখ্যান — সিস্টেম স্বয়ংক্রিয়ভাবে উত্তোলন করেছে; চূড়ান্ত এখতিয়ার-সিদ্ধান্ত অনুমোদিত মানুষই নেবেন।`,
          'T2_ESCALATION', 'OPEN', nowIso, nowIso
        ]);
      }

      writeAudit({
        actor,
        channel: 'WEB',
        action: mustEscalate ? 'T2_TRANSFER_RETURNED_ESCALATED' : 'T2_TRANSFER_RETURNED',
        entityType: 'Referral',
        entityId: referralId,
        caseId: referral.caseId,
        before: referral.ackStatus,
        after: newStatus,
        reason,
        onWhoseAuthority: ctx?.name || 'রিসিভার',
        metadata: { returnCount: newReturnCount }
      });

      return { success: true, ackStatus: newStatus, returnCount: newReturnCount, escalated: mustEscalate };
    }

    if (action === 'route') {
      // Authorised human only (DLAO_OFFICER or ADMIN)
      if (!ctx || !['DLAO_OFFICER', 'ADMIN'].includes(ctx.role)) {
        return { status: 403, data: { error: 'FORBIDDEN_ONLY_AUTHORISED_HUMAN' } };
      }
      if (!finalOffice || !reason) {
        return { status: 400, data: { error: 'finalOffice and reason are required' } };
      }

      db.transaction(() => {
        db.run(`UPDATE Referral SET ackStatus = 'ROUTED', toOffice = ? WHERE id = ?`, [finalOffice, referralId]);
        db.run(`UPDATE "Case" SET office = ? WHERE id = ?`, [finalOffice, referral.caseId]);
        db.run(`UPDATE Task SET status = 'DONE' WHERE caseId = ? AND type = 'ROUTING_DECISION'`, [referral.caseId]);
      });

      writeAudit({
        actor,
        channel: 'WEB',
        action: 'T2_FINAL_HUMAN_ROUTING',
        entityType: 'Referral',
        entityId: referralId,
        caseId: referral.caseId,
        before: referral.toOffice,
        after: finalOffice,
        reason,
        onWhoseAuthority: ctx.name
      });

      return { success: true, finalOffice, ackStatus: 'ROUTED' };
    }

    return { status: 400, data: { error: `Unknown referral action: ${action}` } };
  }

  return { status: 405, data: { error: 'Method not allowed' } };
}

module.exports = { handleReferrals };
