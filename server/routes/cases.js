// ============================================================================
// Cases Route Handler
// Shared Record Architecture, Golden Thread Provenance, Case Actions.
// ============================================================================
'use strict';

const db = require('../db');
const { writeAudit } = require('../services/audit');
const { transitionCase } = require('../services/lifecycle');
const { RESTRICTED_ACCESS_ROLES } = require('../constants');

function handleCases(req, res, pathParts, query, body, ctx) {
  const caseId = pathParts[0];

  // ---------- Single Case Detail: /api/cases/:id ----------
  if (caseId) {
    const caseRecord = db.get('SELECT * FROM "Case" WHERE id = ?', [caseId]);
    if (!caseRecord) return { status: 404, data: { error: 'Case not found' } };

    // Role-based privacy restriction (A3/G9)
    if (caseRecord.sensitivity === 'RESTRICTED') {
      const userRole = ctx?.role;
      if (!userRole || !RESTRICTED_ACCESS_ROLES.includes(userRole)) {
        return {
          status: 403,
          data: {
            error: 'এই মামলার বিস্তারিত তথ্য সংবেদনশীল ও প্রবেশাধিকার সীমিত। শুধুমাত্র ক্ষমতাপ্রাপ্ত কর্মকর্তা দেখতে পারবেন।'
          }
        };
      }
    }

    // GET /api/cases/:id
    if (req.method === 'GET') {
      const application = db.get(`
        SELECT a.*, ap.fullName, ap.district as applicantDistrict, ap.upazila,
               ap.nidRef, ap.primaryPhone, ap.altPhone, ap.contactNote
        FROM Application a
        JOIN Applicant ap ON a.applicantId = ap.id
        WHERE a.id = ?
      `, [caseRecord.applicationId]);

      const records = db.query('SELECT * FROM RecordEntry WHERE applicationId = ? ORDER BY createdAt ASC', [caseRecord.applicationId]);
      const contactRules = db.query('SELECT * FROM ContactRule WHERE caseId = ? ORDER BY createdAt DESC', [caseId]);
      const contactAttempts = db.query('SELECT * FROM ContactAttempt WHERE caseId = ? ORDER BY createdAt DESC', [caseId]);
      const lawyerAssignment = db.get(`
        SELECT la.*, u.name as lawyerName, u.phone as lawyerPhone, u.office as lawyerOffice
        FROM LawyerAssignment la
        JOIN User u ON la.lawyerUserId = u.id
        WHERE la.caseId = ? AND la.status IN ('ACCEPTED', 'PROPOSED')
        ORDER BY la.createdAt DESC LIMIT 1
      `, [caseId]);
      const mediationSession = db.get('SELECT * FROM MediationSession WHERE caseId = ? ORDER BY createdAt DESC LIMIT 1', [caseId]);
      const settlementDraft = db.get('SELECT * FROM SettlementDraft WHERE caseId = ? ORDER BY createdAt DESC LIMIT 1', [caseId]);
      const documents = db.query('SELECT * FROM DocumentRecord WHERE caseId = ? OR applicationId = ?', [caseId, caseRecord.applicationId]);
      const hearings = db.query('SELECT * FROM Hearing WHERE caseId = ? ORDER BY hearingDate ASC', [caseId]);
      const tasks = db.query('SELECT * FROM Task WHERE caseId = ? OR applicationId = ? ORDER BY createdAt DESC', [caseId, caseRecord.applicationId]);
      const referrals = db.query('SELECT * FROM Referral WHERE caseId = ? ORDER BY createdAt DESC', [caseId]);
      const auditTrail = db.query('SELECT * FROM AuditEntry WHERE caseId = ? OR applicationId = ? ORDER BY createdAt DESC LIMIT 50', [caseId, caseRecord.applicationId]);

      return {
        case: caseRecord,
        application,
        records,
        contactRules,
        contactAttempts,
        lawyerAssignment,
        mediationSession,
        settlementDraft,
        documents,
        hearings,
        tasks,
        referrals,
        auditTrail,
      };
    }

    // PATCH /api/cases/:id (Transition case or update fields)
    if (req.method === 'PATCH' || req.method === 'POST') {
      const actor = ctx ? { userId: ctx.userId, name: ctx.name, role: ctx.role } : { name: "কর্মকর্তা", role: "DLAO_OFFICER" };
      const channel = "WEB";

      if (body.action === 'transition' && body.toStatus) {
        const updated = transitionCase(caseId, body.toStatus, actor, channel, { outcome: body.outcome });
        return { success: true, case: updated };
      }

      if (body.action === 'update_priority') {
        const now = new Date().toISOString();
        db.run('UPDATE "Case" SET priority = ?, priorityReason = ?, prioritySource = ?, updatedAt = ? WHERE id = ?', [
          body.priority, body.priorityReason || "কর্মকর্তার পরিবর্তন", "OFFICER_OVERRIDE", now, caseId
        ]);
        writeAudit({
          actor,
          channel,
          action: "CASE_PRIORITY_UPDATED",
          entityType: "Case",
          entityId: caseId,
          caseId,
          after: body.priority,
          reason: body.priorityReason || "",
          onWhoseAuthority: actor.name,
        });
        return { success: true, priority: body.priority };
      }

      return { status: 400, data: { error: 'Unknown case action' } };
    }

    return { status: 405, data: { error: 'Method not allowed' } };
  }

  // ---------- Collection Operations: /api/cases ----------

  // GET /api/cases
  if (req.method === 'GET') {
    let whereClause = '1=1';
    const params = [];

    // Role-based scoping (G9)
    if (ctx && (ctx.role === 'CITIZEN' || ctx.role === 'REPRESENTATIVE')) {
      whereClause += ' AND c.applicationId = ?';
      params.push(ctx.citizenApplicationId || '__none__');
    } else if (ctx && ctx.role === 'LAWYER') {
      whereClause += ` AND c.id IN (SELECT caseId FROM LawyerAssignment WHERE lawyerUserId = ? AND status IN ('ACCEPTED', 'PROPOSED'))`;
      params.push(ctx.userId || '__none__');
    }

    if (query.status) {
      whereClause += ' AND c.status = ?';
      params.push(query.status);
    }
    if (query.caseType) {
      whereClause += ' AND c.caseType = ?';
      params.push(query.caseType);
    }
    if (query.priority) {
      whereClause += ' AND c.priority = ?';
      params.push(query.priority);
    }
    if (query.district) {
      whereClause += ' AND (c.district = ? OR c.office LIKE ?)';
      params.push(query.district, `%${query.district}%`);
    }
    if (query.q) {
      whereClause += ' AND (c.id LIKE ? OR ap.fullName LIKE ? OR c.office LIKE ?)';
      const term = `%${query.q}%`;
      params.push(term, term, term);
    }

    const cases = db.query(`
      SELECT c.*, ap.fullName as applicantName, ap.primaryPhone, ap.district as applicantDistrict,
             la.lawyerUserId, u.name as lawyerName, u.office as lawyerOffice
      FROM "Case" c
      JOIN Application a ON c.applicationId = a.id
      JOIN Applicant ap ON a.applicantId = ap.id
      LEFT JOIN LawyerAssignment la ON c.id = la.caseId AND la.status IN ('ACCEPTED', 'PROPOSED')
      LEFT JOIN User u ON la.lawyerUserId = u.id
      WHERE ${whereClause}
      ORDER BY c.createdAt DESC
      LIMIT 100
    `, params);

    return { cases };
  }

  return { status: 405, data: { error: 'Method not allowed' } };
}

module.exports = { handleCases };
