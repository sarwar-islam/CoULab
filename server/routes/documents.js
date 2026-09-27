// ============================================================================
// Documents & Briefing Route Handler (T6)
// Document Briefing, Case-type Document Checklist Baseline & Gap Analysis.
// ============================================================================
'use strict';

const crypto = require('crypto');
const db = require('../db');
const { writeAudit } = require('../services/audit');
const { compareWithChecklist } = require('../services/checklist');
const { briefDocument } = require('../services/ai');

function handleDocuments(req, res, pathParts, query, body, ctx) {
  const isBriefing = pathParts[0] === 'briefing' || req.url.includes('/briefing');

  // ---------- T6 Document Briefing & Checklist Comparison ----------
  if (isBriefing) {
    const caseId = query.caseId || body.caseId;
    if (!caseId) return { status: 400, data: { error: 'caseId is required' } };

    const kase = db.get('SELECT * FROM "Case" WHERE id = ?', [caseId]);
    if (!kase) return { status: 404, data: { error: 'Case not found' } };

    const documents = db.query('SELECT * FROM DocumentRecord WHERE caseId = ? OR applicationId = ?', [caseId, kase.applicationId]);
    const checklistGaps = compareWithChecklist(kase.caseType, documents);

    const summaries = documents.map((d) => ({
      documentId: d.id,
      title: d.title,
      docType: d.docType,
      brief: briefDocument({ title: d.title, docType: d.docType })
    }));

    return {
      caseId,
      caseType: kase.caseType,
      checklistGaps,
      documentsCount: documents.length,
      missingCount: checklistGaps.filter((g) => g.state === 'MISSING').length,
      summaries
    };
  }

  // ---------- Document CRUD ----------
  if (req.method === 'GET') {
    const caseId = query.caseId;
    const applicationId = query.applicationId;
    let docs = [];
    if (caseId) {
      docs = db.query('SELECT * FROM DocumentRecord WHERE caseId = ?', [caseId]);
    } else if (applicationId) {
      docs = db.query('SELECT * FROM DocumentRecord WHERE applicationId = ?', [applicationId]);
    } else {
      docs = db.query('SELECT * FROM DocumentRecord ORDER BY createdAt DESC LIMIT 50');
    }
    return { documents: docs };
  }

  if (req.method === 'POST') {
    const { title, docType, caseId, applicationId, provenance = "APPLICANT_CONFIRMED", status = "VERIFIED" } = body;
    if (!title || !docType) return { status: 400, data: { error: 'title and docType are required' } };

    const docId = 'doc_' + crypto.randomBytes(8).toString('hex');
    const now = new Date().toISOString();

    const uploader = ctx?.name || body.uploadedByName || "নাগরিক";

    db.run(`
      INSERT INTO DocumentRecord (
        id, title, docType, caseId, applicationId, provenance, uploadedByName, status, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [docId, title, docType, caseId || null, applicationId || null, provenance, uploader, status, now, now]);

    const actor = ctx ? { userId: ctx.userId, name: ctx.name, role: ctx.role } : { name: "নাগরিক", role: "CITIZEN" };
    writeAudit({
      actor,
      channel: "WEB",
      action: "DOCUMENT_UPLOADED",
      entityType: "DocumentRecord",
      entityId: docId,
      caseId: caseId || null,
      applicationId: applicationId || null,
      after: `${title} (${docType})`,
      onWhoseAuthority: ctx?.name || "নাগরিক"
    });

    const doc = db.get('SELECT * FROM DocumentRecord WHERE id = ?', [docId]);
    return { status: 201, data: { document: doc } };
  }

  return { status: 405, data: { error: 'Method not allowed' } };
}

module.exports = { handleDocuments };
