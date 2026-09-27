// ============================================================================
// Contact Route Handler (G3 / A1 Safe Contact)
// Set/Update ContactRule, Evaluate & Log Contact Attempts (Blocked Unsafe Caller).
// ============================================================================
'use strict';

const crypto = require('crypto');
const db = require('../db');
const { writeAudit } = require('../services/audit');
const { evaluateContact, logContactAttempt } = require('../services/safe-contact');

function handleContact(req, res, pathParts, query, body, ctx) {
  // GET /api/contact?caseId=...
  if (req.method === 'GET') {
    const caseId = query.caseId;
    if (!caseId) return { status: 400, data: { error: 'caseId is required' } };
    const rules = db.query('SELECT * FROM ContactRule WHERE caseId = ? ORDER BY createdAt DESC', [caseId]);
    const attempts = db.query('SELECT * FROM ContactAttempt WHERE caseId = ? ORDER BY createdAt DESC LIMIT 50', [caseId]);
    return { rules, attempts };
  }

  // POST /api/contact
  if (req.method === 'POST') {
    const { action, caseId } = body;
    if (!action || !caseId) {
      return { status: 400, data: { error: 'action and caseId are required' } };
    }

    const actor = ctx ? { userId: ctx.userId, name: ctx.name, role: ctx.role } : { name: "দায়িত্বপ্রাপ্ত কর্মকর্তা", role: "DLAO_OFFICER" };

    if (action === 'set_rule') {
      const { mode, safeNumber, safeTimeWindow, blockedNumbers = [], neutralWording = true, reason } = body;
      if (!mode || !reason) {
        return { status: 400, data: { error: 'mode and reason are required' } };
      }

      const id = 'crule_' + crypto.randomBytes(8).toString('hex');
      const now = new Date().toISOString();

      db.transaction(() => {
        db.run('UPDATE ContactRule SET active = 0 WHERE caseId = ?', [caseId]);
        db.run(`
          INSERT INTO ContactRule (
            id, caseId, mode, safeNumber, safeTimeWindow, blockedNumbers,
            neutralWording, reason, active, createdByUserId, createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          id, caseId, mode, safeNumber || null, safeTimeWindow || null,
          JSON.stringify(blockedNumbers), neutralWording ? 1 : 0, reason,
          1, ctx?.userId || 'unknown', now, now
        ]);
        db.run('UPDATE "Case" SET sensitivity = ?, updatedAt = ? WHERE id = ?', ['SENSITIVE', now, caseId]);
      });

      writeAudit({
        actor,
        channel: 'WEB',
        action: 'CONTACT_RULE_SET',
        entityType: 'ContactRule',
        entityId: id,
        caseId,
        reason,
        onWhoseAuthority: ctx?.name || 'কর্মকর্তা',
        after: `${mode} ${safeNumber || ''} ${safeTimeWindow || ''}`.trim()
      });

      const rule = db.get('SELECT * FROM ContactRule WHERE id = ?', [id]);
      return { status: 201, data: { rule } };
    }

    if (action === 'attempt') {
      const { attemptedNumber, attemptType = 'CALL', claimedIdentity, notes } = body;
      if (!attemptedNumber) {
        return { status: 400, data: { error: 'attemptedNumber is required' } };
      }

      const evaluation = evaluateContact(caseId, attemptedNumber);
      const attempt = logContactAttempt({
        caseId,
        attemptedNumber,
        attemptType,
        claimedIdentity,
        evaluation,
        notes,
        actor
      });

      writeAudit({
        actor,
        channel: attemptType,
        action: 'CONTACT_ATTEMPT',
        entityType: 'ContactAttempt',
        entityId: attempt.id,
        caseId,
        after: evaluation.outcome,
        reason: evaluation.reason,
        onWhoseAuthority: evaluation.allowed ? (ctx?.name || 'অনুমোদিত') : 'ContactRule (নিরাপদ যোগাযোগ নিয়ম)'
      });

      return { status: 201, data: { attempt, evaluation } };
    }

    return { status: 400, data: { error: `Unknown action: ${action}` } };
  }

  return { status: 405, data: { error: 'Method not allowed' } };
}

module.exports = { handleContact };
