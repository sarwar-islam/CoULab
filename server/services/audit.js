// ============================================================================
// DLAS Append-only Audit Trail (Golden Thread G10).
// Every consequential action in every module goes through this single function.
// ============================================================================
'use strict';

const crypto = require('crypto');
const db = require('../db');

const SYSTEM_ACTOR = { name: "system", role: "SYSTEM" };

function writeAudit(input) {
  const id = 'aud_' + crypto.randomBytes(12).toString('hex');
  const now = new Date().toISOString();
  
  const actor = input.actor || SYSTEM_ACTOR;
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

  db.run(`
    INSERT INTO AuditEntry (
      id, actorUserId, actorName, actorRole, channel, action,
      entityType, entityId, caseId, applicationId, before, after,
      reason, onWhoseAuthority, metadataJson, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    actor.userId || null,
    actor.name || "Anonymous",
    actor.role || "SYSTEM",
    input.channel || "SYSTEM",
    input.action,
    input.entityType,
    input.entityId,
    input.caseId || null,
    input.applicationId || null,
    input.before || null,
    input.after || null,
    input.reason || null,
    input.onWhoseAuthority || null,
    metadataJson,
    now
  ]);

  return { id, ...input, createdAt: now };
}

module.exports = {
  writeAudit,
  SYSTEM_ACTOR
};
