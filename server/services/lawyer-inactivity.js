// ============================================================================
// T1 — Panel Lawyer Inactivity Pattern Detection.
// Pattern detection may trigger human review only; does NOT establish misconduct.
// ============================================================================
'use strict';

const crypto = require('crypto');
const db = require('../db');
const { INACTIVITY_PATTERN_THRESHOLD } = require('../constants');

function collectSignals(assignmentId) {
  const assignment = db.get('SELECT * FROM LawyerAssignment WHERE id = ?', [assignmentId]);
  if (!assignment) return { missedHearings: 0, missedUpdates: 0, daysSinceLastUpdate: null };

  const hearings = db.query('SELECT status FROM Hearing WHERE caseId = ?', [assignment.caseId]);
  const missedHearings = hearings.filter((h) => h.status === 'MISSED').length;

  const tasks = db.query('SELECT type, status FROM Task WHERE caseId = ?', [assignment.caseId]);
  const missedUpdates = tasks.filter(
    (t) => t.type === 'LAWYER_UPDATE' && (t.status === 'OVERDUE' || t.status === 'OPEN')
  ).length;

  const daysSinceLastUpdate = assignment.lastUpdateAt
    ? Math.floor((Date.now() - new Date(assignment.lastUpdateAt).getTime()) / 86400000)
    : null;

  return { missedHearings, missedUpdates, daysSinceLastUpdate };
}

function crossCaseInactivityCount(lawyerUserId, excludeCaseId) {
  const otherAssignments = db.query(`
    SELECT caseId FROM LawyerAssignment
    WHERE lawyerUserId = ? AND status IN ('ACCEPTED', 'PROPOSED') AND caseId != ?
  `, [lawyerUserId, excludeCaseId]);

  let count = 0;
  for (const a of otherAssignments) {
    const hasMissedHearing = db.get(`
      SELECT id FROM Hearing WHERE caseId = ? AND status = 'MISSED' LIMIT 1
    `, [a.caseId]);
    const hasOverdueUpdate = db.get(`
      SELECT id FROM Task WHERE caseId = ? AND type = 'LAWYER_UPDATE' AND status IN ('OVERDUE', 'OPEN') LIMIT 1
    `, [a.caseId]);
    if (hasMissedHearing || hasOverdueUpdate) count++;
  }
  return count;
}

function checkAndFlagPattern(assignmentId) {
  const signals = collectSignals(assignmentId);
  const assignment = db.get('SELECT * FROM LawyerAssignment WHERE id = ?', [assignmentId]);
  if (!assignment) return null;

  const otherCount = crossCaseInactivityCount(assignment.lawyerUserId, assignment.caseId);
  const patternMet =
    signals.missedHearings >= INACTIVITY_PATTERN_THRESHOLD &&
    otherCount >= INACTIVITY_PATTERN_THRESHOLD;

  if (patternMet && !assignment.inactivityFlaggedAt) {
    const now = new Date().toISOString();
    db.run('UPDATE LawyerAssignment SET inactivityFlaggedAt = ? WHERE id = ?', [now, assignmentId]);

    const taskId = 'task_' + crypto.randomBytes(8).toString('hex');
    db.run(`
      INSERT INTO Task (
        id, caseId, title, titleBn, type, ownerRole, priority,
        status, sourceModule, reason, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      taskId,
      assignment.caseId,
      'প্যাটার্ন-সতর্কতা: প্যানেল আইনজীবীর বারবার নিষ্ক্রিয়তা (মানব-পর্যালোচনা)',
      'Repeated-inactivity review alert',
      'LAWYER_UPDATE',
      'DLAO_OFFICER',
      'HIGH',
      'OPEN',
      'T1_PATTERN_ALERT',
      `এই মামলায় মিসড হিয়ারিং ${signals.missedHearings}টি; একই আইনজীবীর অন্য ${otherCount}টি মামলায় অনুরূপ নিষ্ক্রিয়তা। প্যাটার্ন-সতর্কতা শুধু পর্যালোচনার জন্য — এটি নিজে অসদাচরণ প্রমাণ করে না।`,
      now,
      now
    ]);
  }

  return { signals, otherCount, patternMet };
}

module.exports = {
  collectSignals,
  crossCaseInactivityCount,
  checkAndFlagPattern
};
