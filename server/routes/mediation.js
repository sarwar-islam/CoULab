// ============================================================================
// Mediation, Settlement Drafting (T7) & e-Signatures (T11) Route Handler.
// ============================================================================
'use strict';

const crypto = require('crypto');
const db = require('../db');
const { writeAudit } = require('../services/audit');
const { draftSettlement } = require('../services/ai');
const { sha256 } = require('../services/crypto');

function handleMediation(req, res, pathParts, query, body, ctx) {
  const sub = pathParts[0];

  // ---------- POST /api/settlements (T7 Settlement Draft Generator) ----------
  if (sub === 'settlements' || req.url.startsWith('/api/settlements')) {
    if (req.method === 'POST') {
      const { caseId, templateType = "MAINTENANCE", notes = "", action } = body;

      if (action === 'human_approve') {
        const { draftId, approvedText, reviewNotes } = body;
        const now = new Date().toISOString();
        db.run(`
          UPDATE SettlementDraft
          SET status = 'HUMAN_APPROVED', draftText = ?, finalizedText = ?, reviewedByUserId = ?, reviewNotes = ?, updatedAt = ?
          WHERE id = ?
        `, [approvedText, approvedText, ctx?.userId || 'unknown', reviewNotes || 'অনুমোদিত', now, draftId]);

        const actor = ctx ? { userId: ctx.userId, name: ctx.name, role: ctx.role } : { name: "মধ্যস্থতাকারী", role: "MEDIATOR" };
        writeAudit({
          actor,
          channel: "WEB",
          action: "T7_SETTLEMENT_HUMAN_APPROVED",
          entityType: "SettlementDraft",
          entityId: draftId,
          after: "HUMAN_APPROVED",
          onWhoseAuthority: ctx?.name || "কর্মকর্তা"
        });

        return { success: true, status: 'HUMAN_APPROVED' };
      }

      if (!caseId) return { status: 400, data: { error: 'caseId is required' } };

      const draftResult = draftSettlement({ templateType, notes, caseId });
      const draftId = 'draft_' + crypto.randomBytes(8).toString('hex');
      const now = new Date().toISOString();

      db.run(`
        INSERT INTO SettlementDraft (
          id, caseId, templateType, mediatorNotes, draftText, aiSegmentsJson,
          warningsJson, status, version, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        draftId, caseId, templateType, notes || 'প্রাথমিক খসড়া', draftResult.draftText,
        JSON.stringify(draftResult.aiSegments), JSON.stringify(draftResult.warnings),
        'DRAFT_GENERATED', 1, now, now
      ]);

      const actor = ctx ? { userId: ctx.userId, name: ctx.name, role: ctx.role } : { name: "সিস্টেম", role: "SYSTEM" };
      writeAudit({
        actor,
        channel: "WEB",
        action: "T7_SETTLEMENT_DRAFT_GENERATED",
        entityType: "SettlementDraft",
        entityId: draftId,
        caseId,
        after: "DRAFT_GENERATED",
        onWhoseAuthority: "AI assistant (human legal review mandatory)"
      });

      return {
        status: 201,
        data: {
          draft: {
            id: draftId,
            caseId,
            ...draftResult
          }
        }
      };
    }
  }

  // ---------- POST /api/signatures (T11 Asynchronous e-Signatures) ----------
  if (sub === 'signatures' || req.url.startsWith('/api/signatures')) {
    if (req.method === 'POST') {
      const { action, draftId, caseId, partyName, partyRole, signatureValue, documentText, parties = [] } = body;

      if (action === 'prepare') {
        if (!documentText && !draftId) return { status: 400, data: { error: 'draftId or documentText required' } };
        let textToHash = documentText;
        let cId = caseId;
        if (draftId) {
          const draft = db.get('SELECT * FROM SettlementDraft WHERE id = ?', [draftId]);
          if (draft) {
            textToHash = textToHash || draft.draftText || '';
            cId = cId || draft.caseId;
          }
        }
        let sDraftId = draftId;
        if (!sDraftId) {
          const lastDraft = db.get('SELECT id, caseId FROM SettlementDraft ORDER BY createdAt DESC LIMIT 1');
          if (lastDraft) {
            sDraftId = lastDraft.id;
            cId = cId || lastDraft.caseId;
          }
        }
        if (!cId) {
          const firstCase = db.get('SELECT id FROM "Case" LIMIT 1');
          cId = firstCase?.id || 'CASE-2026-0001';
        }

        const documentHash = sha256(textToHash || 'DLAS-SETTLEMENT-DOC');
        const sessionId = 'sigses_' + crypto.randomBytes(8).toString('hex');
        const now = new Date().toISOString();

        db.run(`
          INSERT INTO SignatureSession (id, caseId, settlementDraftId, documentHash, docVersion, partiesJson, status, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [sessionId, cId, sDraftId, documentHash, 1, JSON.stringify(parties), 'READY_FOR_SIGNATURES', now, now]);

        return {
          status: 201,
          data: {
            session: { id: sessionId, draftId, documentHash, status: 'READY_FOR_SIGNATURES' }
          }
        };
      }

      if (action === 'sign') {
        const { sessionId, signatureSessionId } = body;
        const targetSessionId = sessionId || signatureSessionId;
        const session = db.get('SELECT * FROM SignatureSession WHERE id = ?', [targetSessionId]);
        if (!session) return { status: 404, data: { error: 'SignatureSession not found' } };

        const sigId = 'sig_' + crypto.randomBytes(8).toString('hex');
        const now = new Date().toISOString();
        const nonce = crypto.randomBytes(16).toString('hex');
        const partyHash = sha256(`${session.documentHash}:${partyName}:${partyRole}:${nonce}`);

        db.run(`
          INSERT INTO SignatureRecord (
            id, sessionId, partyName, partyRole, signatureHash,
            nonce, signedAt, method, syncStatus, verified, createdAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          sigId, targetSessionId, partyName || 'স্বাক্ষরকারী', partyRole || 'PARTY_A',
          partyHash, nonce, now, 'ONLINE', 'SYNCED', 1, now
        ]);

        const actor = ctx ? { userId: ctx.userId, name: ctx.name, role: ctx.role } : { name: partyName || 'স্বাক্ষরকারী', role: "CITIZEN" };
        writeAudit({
          actor,
          channel: "WEB",
          action: "T11_DOCUMENT_SIGNED",
          entityType: "SignatureRecord",
          entityId: sigId,
          after: `Signed by ${partyName} (${partyRole})`,
          onWhoseAuthority: partyName
        });

        return {
          status: 201,
          data: {
            signature: { id: sigId, partyName, partyRole, signedHash: partyHash, signedAt: now }
          }
        };
      }

      if (action === 'verify') {
        const { sessionId, currentDocumentText } = body;
        const session = db.get('SELECT * FROM SignatureSession WHERE id = ?', [sessionId]);
        if (!session) return { status: 404, data: { error: 'SignatureSession not found' } };

        const currentHash = sha256(currentDocumentText || '');
        const verified = currentHash === session.documentHash;
        const signatures = db.query('SELECT * FROM SignatureRecord WHERE sessionId = ?', [sessionId]);

        return {
          verified,
          originalHash: session.documentHash,
          currentHash,
          tamperEvident: !verified,
          signaturesCount: signatures.length,
          signatures
        };
      }

      return { status: 400, data: { error: `Unknown signature action: ${action}` } };
    }
  }

  // ---------- Standard Mediation Scheduling: /api/mediation ----------
  if (req.method === 'POST') {
    const { caseId, mediatorUserId, scheduledAt, mode = "IN_PERSON", location, partyAName, partyBName } = body;
    if (!caseId) return { status: 400, data: { error: 'caseId is required' } };

    const kase = db.get('SELECT * FROM "Case" WHERE id = ?', [caseId]);
    const app = kase ? db.get('SELECT * FROM Application WHERE id = ?', [kase.applicationId]) : null;
    const applicant = app ? db.get('SELECT * FROM Applicant WHERE id = ?', [app.applicantId]) : null;

    const mediator = mediatorUserId || ctx?.userId || 'cmubkqu420000lv57ub36bfkf';
    const sessionId = 'med_' + crypto.randomBytes(8).toString('hex');
    const now = new Date().toISOString();
    const sessionDate = scheduledAt || new Date(Date.now() + 7 * 86400000).toISOString();

    db.transaction(() => {
      db.run(`
        INSERT INTO MediationSession (
          id, caseId, mediatorUserId, scheduledAt, mode, locationOrLink,
          partyAName, partyBName, status, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        sessionId, caseId, mediator, sessionDate,
        mode, location || "জেলা লিগ্যাল এইড কার্যালয়, মধ্যস্থতা কক্ষ",
        partyAName || applicant?.fullName || "আবেদনকারী পক্ষ",
        partyBName || "প্রতিপক্ষ",
        "SCHEDULED", now, now
      ]);

      db.run(`UPDATE "Case" SET status = 'IN_MEDIATION', updatedAt = ? WHERE id = ?`, [now, caseId]);
    });

    const actor = ctx ? { userId: ctx.userId, name: ctx.name, role: ctx.role } : { name: "দায়িত্বপ্রাপ্ত কর্মকর্তা", role: "DLAO_OFFICER" };
    writeAudit({
      actor,
      channel: "WEB",
      action: "MEDIATION_SCHEDULED",
      entityType: "MediationSession",
      entityId: sessionId,
      caseId,
      after: `SCHEDULED (${mode} on ${sessionDate})`,
      onWhoseAuthority: ctx?.name || "কর্মকর্তা"
    });

    const session = db.get('SELECT * FROM MediationSession WHERE id = ?', [sessionId]);
    return { status: 201, data: { session } };
  }

  return { status: 405, data: { error: 'Method not allowed' } };
}

module.exports = { handleMediation };
