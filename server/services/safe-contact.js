// ============================================================================
// DLAS G3 / A1 Safe-Contact Enforcement.
// Evaluates outbound or inbound contact attempts against ContactRule.
// ============================================================================
'use strict';

const crypto = require('crypto');
const db = require('../db');
const { ROLES } = require('../constants');

function withinWindow(windowSpec, now = new Date()) {
  if (!windowSpec) return true;
  const parts = windowSpec.split('-').map((s) => s.trim());
  if (parts.length < 2) return true;
  const [from, to] = parts;
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= fh * 60 + (fm || 0) && minutes <= th * 60 + (tm || 0);
}

function evaluateContact(caseId, targetNumber, at = new Date()) {
  const rule = db.get(
    'SELECT * FROM ContactRule WHERE caseId = ? AND active = 1 ORDER BY createdAt DESC LIMIT 1',
    [caseId]
  );
  if (!rule) {
    return { allowed: true, outcome: 'COMPLETED', reason: 'কোনো বিশেষ যোগাযোগ নিয়ম নেই' };
  }

  let blocked = [];
  try {
    blocked = JSON.parse(rule.blockedNumbers || '[]');
  } catch (e) {
    blocked = [];
  }

  if (rule.mode === 'BLOCK_ALL') {
    return { allowed: false, outcome: 'BLOCKED_UNSAFE', reason: rule.reason || 'সব নম্বর অবরুদ্ধ' };
  }

  if (rule.mode === 'BLOCK_NUMBERS' && blocked.includes(targetNumber)) {
    return { allowed: false, outcome: 'BLOCKED_UNSAFE', reason: rule.reason || 'এই নম্বরটি অনিরাপদ হিসেবে তালিকাভুক্ত' };
  }

  if (rule.mode === 'ALLOW_ONLY') {
    if (targetNumber !== rule.safeNumber) {
      return { allowed: false, outcome: 'BLOCKED_UNSAFE', reason: rule.reason || 'শুধুমাত্র নির্ধারিত নিরাপদ নম্বরে যোগাযোগ অনুমোদিত' };
    }
    if (!withinWindow(rule.safeTimeWindow, at)) {
      return {
        allowed: false,
        outcome: 'OUTSIDE_WINDOW',
        reason: `নিরাপদ সময়সীমা ${rule.safeTimeWindow || '-'} এর বাইরে`,
      };
    }
  }

  return { allowed: true, outcome: 'COMPLETED', reason: 'নিরাপদ যোগাযোগ নিয়ম মেনে অনুমোদিত' };
}

function logContactAttempt(params) {
  const id = 'att_' + crypto.randomBytes(8).toString('hex');
  const now = new Date().toISOString();

  db.run(`
    INSERT INTO ContactAttempt (
      id, caseId, attemptedNumber, attemptType, claimedIdentity,
      outcome, notes, attemptedByUserId, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    params.caseId,
    params.attemptedNumber,
    params.attemptType,
    params.claimedIdentity || null,
    params.evaluation.outcome,
    params.notes || params.evaluation.reason,
    params.actor?.userId || null,
    now
  ]);

  if (params.evaluation.outcome === 'BLOCKED_UNSAFE') {
    const notifId = 'notif_' + crypto.randomBytes(8).toString('hex');
    db.run(`
      INSERT INTO Notification (
        id, caseId, targetRole, channel, message,
        neutralWording, relatedModule, status, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      notifId,
      params.caseId,
      ROLES.DLAO_OFFICER,
      'IN_APP',
      `অনিরাপদ যোগাযোগ প্রতিহত করা হয়েছে (${params.attemptedNumber}) — কারণ: ${params.evaluation.reason}`,
      1,
      'SAFE_CONTACT',
      'SENT',
      now
    ]);
  }

  return { id, ...params, createdAt: now };
}

module.exports = {
  withinWindow,
  evaluateContact,
  logContactAttempt
};
