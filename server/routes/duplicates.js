// ============================================================================
// T4 Duplicate Detection Route Handler
// Fuzzy match scanning, candidate ranking, human review decision.
// ============================================================================
'use strict';

const crypto = require('crypto');
const db = require('../db');
const { writeAudit } = require('../services/audit');
const { compareApplicants, DUPLICATE_REVIEW_THRESHOLD } = require('../services/duplicate');

function handleDuplicates(req, res, pathParts, query, body, ctx) {
  // GET /api/duplicates -> List candidates
  if (req.method === 'GET') {
    const candidates = db.query(`
      SELECT dc.*,
             appA.caseType as caseTypeA, appA.status as statusA, aplA.fullName as nameA, aplA.primaryPhone as phoneA,
             appB.caseType as caseTypeB, appB.status as statusB, aplB.fullName as nameB, aplB.primaryPhone as phoneB
      FROM DuplicateCandidate dc
      JOIN Application appA ON dc.applicationAId = appA.id
      JOIN Applicant aplA ON appA.applicantId = aplA.id
      JOIN Application appB ON dc.applicationBId = appB.id
      JOIN Applicant aplB ON appB.applicantId = aplB.id
      ORDER BY dc.score DESC
      LIMIT 100
    `);

    return { candidates };
  }

  // POST /api/duplicates -> Scan for candidates
  if (req.method === 'POST') {
    const applications = db.query(`
      SELECT a.id, a.district, ap.fullName, ap.primaryPhone, ap.nidRef
      FROM Application a
      JOIN Applicant ap ON a.applicantId = ap.id
      ORDER BY a.createdAt DESC
      LIMIT 60
    `);

    const created = [];
    const now = new Date().toISOString();

    for (let i = 0; i < applications.length; i++) {
      for (let j = i + 1; j < applications.length; j++) {
        const a = applications[i];
        const b = applications[j];

        const existing = db.get(`
          SELECT id FROM DuplicateCandidate
          WHERE (applicationAId = ? AND applicationBId = ?)
             OR (applicationAId = ? AND applicationBId = ?)
        `, [a.id, b.id, b.id, a.id]);

        if (existing) continue;

        const { score, matchedFields } = compareApplicants(a, b);
        if (score >= DUPLICATE_REVIEW_THRESHOLD) {
          const id = 'dup_' + crypto.randomBytes(8).toString('hex');
          db.run(`
            INSERT INTO DuplicateCandidate (id, applicationAId, applicationBId, score, matchedFieldsJson, createdAt)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [id, a.id, b.id, score, JSON.stringify(matchedFields), now]);
          created.push({ id, applicationAId: a.id, applicationBId: b.id, score });
        }
      }
    }

    const actor = ctx ? { userId: ctx.userId, name: ctx.name, role: ctx.role } : { name: "সিস্টেম", role: "SYSTEM" };
    writeAudit({
      actor,
      channel: "WEB",
      action: "T4_DUPLICATE_SCAN",
      entityType: "DuplicateCandidate",
      entityId: `scan-${Date.now()}`,
      after: `${created.length} নতুন সম্ভাব্য ডুপ্লিকেট প্রার্থী`,
      onWhoseAuthority: "system scan (no auto-action)"
    });

    return { created, count: created.length, threshold: DUPLICATE_REVIEW_THRESHOLD };
  }

  // PATCH /api/duplicates -> Human review decision
  if (req.method === 'PATCH') {
    const { candidateId, decision, reviewNotes } = body;
    if (!candidateId || !decision) {
      return { status: 400, data: { error: 'candidateId and decision are required' } };
    }

    const now = new Date().toISOString();
    db.run(`
      UPDATE DuplicateCandidate
      SET decision = ?, reviewNotes = ?, reviewedByUserId = ?, reviewedAt = ?
      WHERE id = ?
    `, [decision, reviewNotes || null, ctx?.userId || 'unknown', now, candidateId]);

    const actor = ctx ? { userId: ctx.userId, name: ctx.name, role: ctx.role } : { name: "কর্মকর্তা", role: "DLAO_OFFICER" };
    writeAudit({
      actor,
      channel: "WEB",
      action: "T4_DUPLICATE_HUMAN_REVIEW",
      entityType: "DuplicateCandidate",
      entityId: candidateId,
      after: decision,
      reason: reviewNotes || "",
      onWhoseAuthority: ctx?.name || "কর্মকর্তা"
    });

    return { success: true, decision };
  }

  return { status: 405, data: { error: 'Method not allowed' } };
}

module.exports = { handleDuplicates };
