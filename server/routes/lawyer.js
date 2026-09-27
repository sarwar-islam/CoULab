// ============================================================================
// Lawyer Assignment & Worklist Route Handler (B5 / T1)
// Assignment dispatch, accept/decline, inactivity tracking, change requests.
// ============================================================================
'use strict';

const crypto = require('crypto');
const db = require('../db');
const { writeAudit } = require('../services/audit');
const { checkAndFlagPattern } = require('../services/lawyer-inactivity');

function handleLawyer(req, res, pathParts, query, body, ctx) {
  const sub = pathParts[0];

  // ---------- POST /api/lawyer/change-requests (T1 Lawyer Change Request) ----------
  if (sub === 'change-requests' || req.url.includes('change-requests')) {
    if (req.method === 'POST') {
      const { caseId, reason, requestedByName, requestedByRole = "CITIZEN" } = body;
      if (!caseId || !reason) return { status: 400, data: { error: 'caseId and reason are required' } };

      const requestId = 'lcr_' + crypto.randomBytes(8).toString('hex');
      const now = new Date().toISOString();
      const requester = requestedByName || ctx?.name || "আবেদনকারী নাগরিক";

      db.transaction(() => {
        db.run(`
          INSERT INTO LawyerChangeRequest (id, caseId, requestedByName, requestedByRole, reason, status, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [requestId, caseId, requester, requestedByRole, reason, 'PENDING_REVIEW', now]);

        const taskId = 'task_' + crypto.randomBytes(8).toString('hex');
        db.run(`
          INSERT INTO Task (id, caseId, title, type, ownerRole, priority, reason, sourceModule, status, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          taskId, caseId, 'আইনজীবী পরিবর্তনের আবেদন পর্যালোচনা', 'LAWYER_UPDATE',
          'DLAO_OFFICER', 'HIGH', reason, 'T1_CHANGE_REQUEST', 'OPEN', now, now
        ]);
      });

      const actor = ctx ? { userId: ctx.userId, name: ctx.name, role: ctx.role } : { name: "আবেদনকারী", role: "CITIZEN" };
      writeAudit({
        actor,
        channel: 'WEB',
        action: 'T1_LAWYER_CHANGE_REQUESTED',
        entityType: 'LawyerChangeRequest',
        entityId: requestId,
        caseId,
        reason,
        onWhoseAuthority: ctx?.name || "নাগরিক"
      });

      return { status: 201, data: { requestId, status: 'PENDING_REVIEW' } };
    }
  }

  // ---------- GET /api/lawyer/worklist ----------
  if (sub === 'worklist' || (req.method === 'GET' && query.worklist)) {
    const lawyerId = ctx?.userId || query.lawyerId;
    const assignments = db.query(`
      SELECT la.*, c.caseType, c.priority, c.status as caseStatus, c.office,
             ap.fullName as applicantName, ap.primaryPhone
      FROM LawyerAssignment la
      JOIN "Case" c ON la.caseId = c.id
      JOIN Application a ON c.applicationId = a.id
      JOIN Applicant ap ON a.applicantId = ap.id
      WHERE la.lawyerUserId = ?
      ORDER BY la.createdAt DESC
    `, [lawyerId || '']);

    return { assignments };
  }

  // ---------- POST /api/lawyer (Assign Lawyer) ----------
  if (req.method === 'POST') {
    const { caseId, lawyerUserId, instructions } = body;
    if (!caseId || !lawyerUserId) return { status: 400, data: { error: 'caseId and lawyerUserId are required' } };

    const assignmentId = 'lass_' + crypto.randomBytes(8).toString('hex');
    const now = new Date().toISOString();

    db.transaction(() => {
      db.run("UPDATE LawyerAssignment SET status = 'RELEASED', updatedAt = ? WHERE caseId = ? AND status = 'ACCEPTED'", [now, caseId]);
      db.run(`
        INSERT INTO LawyerAssignment (
          id, caseId, lawyerUserId, status, assignedAt, stage, paymentStatus, paymentNote, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [assignmentId, caseId, lawyerUserId, 'PROPOSED', now, 'PRE_LITIGATION', 'NOT_DUE', instructions || null, now, now]);

      db.run('UPDATE "Case" SET status = "LAWYER_ASSIGNED", updatedAt = ? WHERE id = ?', [now, caseId]);
    });

    const lawyer = db.get('SELECT name FROM User WHERE id = ?', [lawyerUserId]);
    const actor = ctx ? { userId: ctx.userId, name: ctx.name, role: ctx.role } : { name: "কর্মকর্তা", role: "DLAO_OFFICER" };

    writeAudit({
      actor,
      channel: 'WEB',
      action: 'B5_LAWYER_ASSIGNED',
      entityType: 'LawyerAssignment',
      entityId: assignmentId,
      caseId,
      after: `Proposed to ${lawyer?.name || lawyerUserId}`,
      onWhoseAuthority: ctx?.name || "কর্মকর্তা"
    });

    return { status: 201, data: { assignmentId, status: 'PROPOSED', lawyerName: lawyer?.name } };
  }

  // ---------- PATCH /api/lawyer (Respond: Accept or Decline) ----------
  if (req.method === 'PATCH') {
    const { assignmentId, action, reason } = body;
    if (!assignmentId || !action) return { status: 400, data: { error: 'assignmentId and action are required' } };

    const assignment = db.get('SELECT * FROM LawyerAssignment WHERE id = ?', [assignmentId]);
    if (!assignment) return { status: 404, data: { error: 'Assignment not found' } };

    const newStatus = action === 'accept' ? 'ACCEPTED' : 'DECLINED';
    const now = new Date().toISOString();
    const acceptedAt = action === 'accept' ? now : null;
    const declinedReason = action === 'decline' ? (reason || 'আইনজীবী অপারগতা প্রকাশ করেছেন') : null;

    db.run(`
      UPDATE LawyerAssignment
      SET status = ?, acceptedAt = ?, declinedReason = ?, updatedAt = ?
      WHERE id = ?
    `, [newStatus, acceptedAt, declinedReason, now, assignmentId]);

    // Check inactivity pattern alert if applicable
    checkAndFlagPattern(assignmentId);

    const actor = ctx ? { userId: ctx.userId, name: ctx.name, role: ctx.role } : { name: "প্যানেল আইনজীবী", role: "LAWYER" };
    writeAudit({
      actor,
      channel: 'WEB',
      action: action === 'accept' ? 'B5_LAWYER_ACCEPTED' : 'B5_LAWYER_DECLINED',
      entityType: 'LawyerAssignment',
      entityId: assignmentId,
      caseId: assignment.caseId,
      after: newStatus,
      reason: reason || "",
      onWhoseAuthority: ctx?.name || "প্যানেল আইনজীবী"
    });

    return { success: true, status: newStatus };
  }

  return { status: 405, data: { error: 'Method not allowed' } };
}

module.exports = { handleLawyer };
