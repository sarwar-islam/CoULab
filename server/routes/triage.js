// ============================================================================
// T8 Multi-agent Triage Route Handler
// Runs the 3-component pipeline, stores evidence, records human decisions (G5).
// ============================================================================
'use strict';

const crypto = require('crypto');
const db = require('../db');
const { writeAudit } = require('../services/audit');
const { runTriagePipeline } = require('../services/triage');
const { buildChecklist } = require('../services/checklist');

function handleTriage(req, res, pathParts, query, body, ctx) {
  // POST /api/triage -> Run triage pipeline
  if (req.method === 'POST') {
    const { caseId, applicationId } = body;
    if (!caseId && !applicationId) return { status: 400, data: { error: 'caseId or applicationId is required' } };

    let kase = null;
    let application = null;

    if (caseId) {
      kase = db.get('SELECT * FROM "Case" WHERE id = ?', [caseId]);
      if (kase) {
        application = db.get('SELECT * FROM Application WHERE id = ?', [kase.applicationId]);
      }
    } else if (applicationId) {
      application = db.get('SELECT * FROM Application WHERE id = ?', [applicationId]);
      if (application?.caseId) {
        kase = db.get('SELECT * FROM "Case" WHERE id = ?', [application.caseId]);
      }
    }

    if (!kase && !application) {
      return { status: 404, data: { error: 'Case or Application not found' } };
    }

    const cType = kase?.caseType || application?.caseType || 'OTHER';
    const district = kase?.district || application?.district || 'ঢাকা';
    const narrative = application?.narrative || '';
    const urgency = Boolean(application?.urgencyFlag);
    const sensitive = kase ? (kase.sensitivity !== "NORMAL") : Boolean(application?.sensitiveFlag);

    const checklist = buildChecklist(cType);
    const requiredTotal = checklist.filter((c) => c.required).length;

    const targetCaseId = kase?.id || null;
    const targetAppId = application?.id || kase?.applicationId || null;

    const activeDocs = db.query(`
      SELECT * FROM DocumentRecord WHERE (caseId = ? OR applicationId = ?) AND status != 'SUPERSEDED'
    `, [targetCaseId || '__none__', targetAppId || '__none__']);

    const result = runTriagePipeline({
      caseType: cType,
      narrative,
      applicantDistrict: district,
      officeDistrict: district,
      requiredDocsPresent: Math.min(activeDocs.length, requiredTotal),
      requiredDocsTotal: requiredTotal,
      urgencyFlag: urgency,
      sensitiveFlag: sensitive,
    });

    const runId = 'trun_' + crypto.randomBytes(8).toString('hex');
    const now = new Date().toISOString();

    db.run(`
      INSERT INTO TriageRun (
        id, caseId, applicationId, categoryResultJson, complianceResultJson,
        orchestrationResultJson, conflictsDetected, finalRecommendation,
        status, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      runId,
      targetCaseId,
      targetAppId,
      JSON.stringify(result.categorisation),
      JSON.stringify(result.compliance),
      JSON.stringify(result.orchestration),
      result.orchestration.conflicts.length > 0 ? 1 : 0,
      result.orchestration.output,
      "RECOMMENDED",
      now
    ]);

    const actor = ctx ? { userId: ctx.userId, name: ctx.name, role: ctx.role } : { name: "সিস্টেম", role: "SYSTEM" };
    writeAudit({
      actor,
      channel: "WEB",
      action: "T8_TRIAGE_RUN",
      entityType: "TriageRun",
      entityId: runId,
      caseId: kase.id,
      after: result.orchestration.output,
      onWhoseAuthority: "system recommendation (human review pending)",
      metadata: { conflicts: result.orchestration.conflicts }
    });

    return {
      status: 201,
      data: {
        run: {
          id: runId,
          caseId: kase.id,
          finalRecommendation: result.orchestration.output,
          status: "RECOMMENDED",
          categoryResult: result.categorisation,
          complianceResult: result.compliance,
          orchestrationResult: result.orchestration,
          CategorisationAgent: result.categorisation.output
        }
      }
    };
  }

  // PATCH /api/triage -> Human decision (Accept or Override)
  if (req.method === 'PATCH') {
    const { runId, decision, priority, jurisdiction, reason } = body;
    if (!runId || !decision || !reason) {
      return { status: 400, data: { error: 'runId, decision, and reason are required' } };
    }

    const run = db.get('SELECT * FROM TriageRun WHERE id = ?', [runId]);
    if (!run) return { status: 404, data: { error: 'TriageRun not found' } };

    let orchestration = {};
    try {
      orchestration = JSON.parse(run.orchestrationResultJson || '{}');
    } catch (e) {}

    const newPriority = decision === "OVERRIDE" && priority ? priority : (orchestration.recommendedPriority || "MEDIUM");
    const now = new Date().toISOString();

    db.run(`
      UPDATE TriageRun
      SET status = ?, decision = ?, humanDecisionByUserId = ?, humanDecisionReason = ?
      WHERE id = ?
    `, [
      decision === "OVERRIDE" ? "OVERRIDDEN" : "HUMAN_REVIEWED",
      decision,
      ctx?.userId || "unknown",
      reason,
      runId
    ]);

    if (run.caseId) {
      db.run(`
        UPDATE "Case"
        SET priority = ?, priorityReason = ?, prioritySource = ?, updatedAt = ?
        WHERE id = ?
      `, [newPriority, reason, decision === "OVERRIDE" ? "OFFICER_OVERRIDE" : "TRIAGE_PIPELINE", now, run.caseId]);
    }

    const actor = ctx ? { userId: ctx.userId, name: ctx.name, role: ctx.role } : { name: "দায়িত্বপ্রাপ্ত কর্মকর্তা", role: "DLAO_OFFICER" };
    writeAudit({
      actor,
      channel: "WEB",
      action: "T8_TRIAGE_HUMAN_DECISION",
      entityType: "TriageRun",
      entityId: runId,
      caseId: run.caseId,
      after: `${decision} (priority=${newPriority})`,
      reason,
      onWhoseAuthority: ctx?.name || "কর্মকর্তা"
    });

    return {
      success: true,
      priority: newPriority,
      decision,
      run: {
        id: runId,
        caseId: run.caseId,
        priority: newPriority,
        decision,
        status: decision === "OVERRIDE" ? "OVERRIDDEN" : "HUMAN_REVIEWED"
      }
    };
  }

  return { status: 405, data: { error: 'Method not allowed' } };
}

module.exports = { handleTriage };
