// ============================================================================
// Case Lifecycle Engine (PDF backbone):
//   ENTRY CHANNEL -> APPLICATION ID -> VERIFICATION / REVIEW -> CASE ID -> ...
// Case ID is minted ONLY on acceptance; every transition writes an AuditEntry.
// ============================================================================
'use strict';

const db = require('../db');
const { writeAudit, SYSTEM_ACTOR } = require('./audit');
const { APPLICATION_STATUSES, CASE_STATUSES } = require('../constants');

const APPLICATION_TRANSITIONS = {
  SUBMITTED: ["UNDER_REVIEW", "REJECTED"],
  UNDER_REVIEW: ["MORE_INFO_NEEDED", "ACCEPTED", "REJECTED"],
  MORE_INFO_NEEDED: ["UNDER_REVIEW", "REJECTED"],
  ACCEPTED: ["CONVERTED_TO_CASE"],
  REJECTED: [],
  CONVERTED_TO_CASE: [],
};

function assertApplicationTransition(from, to) {
  if (!APPLICATION_STATUSES.includes(from) || !APPLICATION_STATUSES.includes(to)) {
    throw new Error(`INVALID_STATUS:${from}->${to}`);
  }
  const allowed = APPLICATION_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw new Error(`ILLEGAL_TRANSITION:${from}->${to}`);
  }
}

function acceptApplication(applicationId, actor, channel, opts = {}) {
  const application = db.get('SELECT * FROM Application WHERE id = ?', [applicationId]);
  if (!application) throw new Error("APPLICATION_NOT_FOUND");
  
  assertApplicationTransition(application.status, "ACCEPTED");

  const caseId = db.nextId("CASE");
  const now = new Date().toISOString();

  db.transaction(() => {
    db.run(
      'UPDATE Application SET status = ?, caseId = ?, updatedAt = ? WHERE id = ?',
      ["CONVERTED_TO_CASE", caseId, now, applicationId]
    );

    db.run(`
      INSERT INTO "Case" (
        id, applicationId, status, caseType, office, district,
        acceptedByUserId, priority, priorityReason, prioritySource,
        sensitivity, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      caseId,
      applicationId,
      "OPEN",
      application.caseType,
      application.office,
      application.district,
      actor.userId || "unknown",
      opts.priority || "MEDIUM",
      opts.priorityReason || "গ্রহণের সময় কর্মকর্তার প্রাথমিক মূল্যায়ন",
      "OFFICER_DECISION",
      opts.sensitive ? "SENSITIVE" : "NORMAL",
      now,
      now
    ]);
  });

  writeAudit({
    actor,
    channel,
    action: "APPLICATION_ACCEPTED_CASE_MINTED",
    entityType: "Application",
    entityId: applicationId,
    caseId,
    applicationId,
    before: application.status,
    after: "CONVERTED_TO_CASE",
    onWhoseAuthority: actor.name,
  });

  writeAudit({
    actor: SYSTEM_ACTOR,
    channel: "SYSTEM",
    action: "CASE_CREATED",
    entityType: "Case",
    entityId: caseId,
    caseId,
    applicationId,
    after: "OPEN",
  });

  return db.get('SELECT * FROM "Case" WHERE id = ?', [caseId]);
}

function transitionCase(caseId, to, actor, channel, extra = {}) {
  const record = db.get('SELECT * FROM "Case" WHERE id = ?', [caseId]);
  if (!record) throw new Error("CASE_NOT_FOUND");
  if (!CASE_STATUSES.includes(to)) throw new Error(`INVALID_CASE_STATUS:${to}`);

  const before = record.status;
  const now = new Date().toISOString();

  const outcome = extra.outcome !== undefined ? extra.outcome : record.outcome;
  const closedAt = to === "CLOSED" ? now : record.closedAt;
  const closedByUserId = to === "CLOSED" ? actor.userId : record.closedByUserId;

  db.run(`
    UPDATE "Case"
    SET status = ?, outcome = ?, closedAt = ?, closedByUserId = ?, updatedAt = ?
    WHERE id = ?
  `, [to, outcome, closedAt, closedByUserId, now, caseId]);

  writeAudit({
    actor,
    channel,
    action: "CASE_TRANSITION",
    entityType: "Case",
    entityId: caseId,
    caseId,
    applicationId: record.applicationId,
    before,
    after: to,
    onWhoseAuthority: actor.name,
  });

  return db.get('SELECT * FROM "Case" WHERE id = ?', [caseId]);
}

module.exports = {
  APPLICATION_TRANSITIONS,
  assertApplicationTransition,
  acceptApplication,
  transitionCase,
};
