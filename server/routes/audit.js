// ============================================================================
// Audit Trail Route Handler (Golden Thread G10)
// Append-only tamper-evident log inspection.
// ============================================================================
'use strict';

const db = require('../db');

function handleAudit(req, res, pathParts, query, body, ctx) {
  if (req.method === 'GET') {
    let whereClause = '1=1';
    const params = [];

    if (query.caseId) {
      whereClause += ' AND caseId = ?';
      params.push(query.caseId);
    }
    if (query.applicationId) {
      whereClause += ' AND applicationId = ?';
      params.push(query.applicationId);
    }
    if (query.action) {
      whereClause += ' AND action LIKE ?';
      params.push(`%${query.action}%`);
    }
    if (query.actorRole) {
      whereClause += ' AND actorRole = ?';
      params.push(query.actorRole);
    }

    const limit = Math.min(Number(query.limit) || 100, 200);
    const auditEntries = db.query(`
      SELECT * FROM AuditEntry
      WHERE ${whereClause}
      ORDER BY createdAt DESC
      LIMIT ${limit}
    `, params);

    const countRow = db.get(`SELECT count(*) as total FROM AuditEntry WHERE ${whereClause}`, params);

    return {
      auditEntries,
      count: auditEntries.length,
      total: countRow?.total || auditEntries.length
    };
  }

  return { status: 405, data: { error: 'Method not allowed' } };
}

module.exports = { handleAudit };
