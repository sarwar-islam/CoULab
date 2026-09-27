// ============================================================================
// T3 Incident Groups Route Handler
// LINK, do not merge. Separate cases share common evidence at group level.
// ============================================================================
'use strict';

const crypto = require('crypto');
const db = require('../db');
const { writeAudit } = require('../services/audit');

function handleIncidentGroups(req, res, pathParts, query, body, ctx) {
  if (req.method === 'GET') {
    const groups = db.query('SELECT * FROM IncidentGroup ORDER BY createdAt DESC');
    for (const g of groups) {
      g.cases = db.query(`
        SELECT c.*, ap.fullName as applicantName
        FROM "Case" c
        JOIN Application a ON c.applicationId = a.id
        JOIN Applicant ap ON a.applicantId = ap.id
        WHERE c.incidentGroupId = ?
      `, [g.id]);
    }
    const sharedDocs = db.query('SELECT * FROM DocumentRecord WHERE incidentGroupId IS NOT NULL');
    return { groups, sharedDocs };
  }

  if (req.method === 'POST') {
    const { name, description, incidentDate, location, caseIds = [] } = body;
    if (!name || !description) return { status: 400, data: { error: 'name and description are required' } };

    const groupId = 'incg_' + crypto.randomBytes(8).toString('hex');
    const now = new Date().toISOString();

    db.transaction(() => {
      db.run(`
        INSERT INTO IncidentGroup (id, name, description, incidentDate, location, createdById, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [groupId, name, description, incidentDate || null, location || null, ctx?.userId || 'unknown', now]);

      for (const cid of caseIds) {
        db.run('UPDATE "Case" SET incidentGroupId = ? WHERE id = ?', [groupId, cid]);
      }
    });

    const actor = ctx ? { userId: ctx.userId, name: ctx.name, role: ctx.role } : { name: "কর্মকর্তা", role: "DLAO_OFFICER" };
    writeAudit({
      actor,
      channel: "WEB",
      action: "T3_INCIDENT_GROUP_CREATED",
      entityType: "IncidentGroup",
      entityId: groupId,
      after: `${name} (${caseIds.length} মামলা সংযুক্ত)`,
      onWhoseAuthority: ctx?.name || "কর্মকর্তা"
    });

    const group = db.get('SELECT * FROM IncidentGroup WHERE id = ?', [groupId]);
    return { status: 201, data: { group } };
  }

  return { status: 405, data: { error: 'Method not allowed' } };
}

module.exports = { handleIncidentGroups };
