// ============================================================================
// T9 Offline-First Sync Route Handler
// Idempotent sync by tempUuid, conflict routing to human review, integrity check.
// ============================================================================
'use strict';

const crypto = require('crypto');
const db = require('../db');
const { writeAudit } = require('../services/audit');
const { sha256 } = require('../services/crypto');

function handleSync(req, res, pathParts, query, body, ctx) {
  if (req.method === 'POST') {
    const { deviceId = "default-device", items = [] } = body;
    if (!items || !Array.isArray(items)) {
      return { status: 400, data: { error: 'items array is required' } };
    }

    const results = [];
    const now = new Date().toISOString();

    for (const item of items) {
      if (!item.tempUuid) continue;

      // Idempotency check: if tempUuid already recorded
      const existing = db.get('SELECT * FROM OfflineSyncRecord WHERE tempUuid = ?', [item.tempUuid]);
      if (existing) {
        results.push({
          tempUuid: item.tempUuid,
          status: existing.status,
          entityId: existing.syncedEntityId || undefined,
          duplicateSkipped: true
        });
        continue;
      }

      // Check conflict
      const isEdit = Boolean(item.editedExistingId);
      const status = isEdit ? "CONFLICT" : "SYNCED";
      let syncedEntityId = null;

      if (!isEdit && (item.payloadType === 'APPLICATION' || item.payload?.applicantName)) {
        const payload = item.payload || {};
        syncedEntityId = db.nextId('APP');
        const applicantId = 'applc_' + crypto.randomBytes(8).toString('hex');

        db.transaction(() => {
          db.run(`
            INSERT INTO Applicant (id, fullName, district, primaryPhone, createdAt)
            VALUES (?, ?, ?, ?, ?)
          `, [applicantId, payload.applicantName || 'অফলাইন আবেদনকারী', payload.district || 'Khagrachari', payload.primaryPhone || null, now]);

          db.run(`
            INSERT INTO Application (id, applicantId, channel, status, caseType, narrative, district, office, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            syncedEntityId, applicantId, payload.channel || 'ASSISTED_UDC', 'SUBMITTED',
            payload.caseType || 'LAND_DISPUTE', payload.narrative || 'অফলাইন আবেদন',
            payload.district || 'Khagrachari', `জেলা আইনি সহায়তা কার্যালয়, ${payload.district || 'Khagrachari'}`,
            now, now
          ]);
        });
      }

      const syncId = 'sync_' + crypto.randomBytes(8).toString('hex');
      const hash = sha256(JSON.stringify(item.payload || {}));

      db.run(`
        INSERT INTO OfflineSyncRecord (id, tempUuid, deviceId, payloadType, payloadJson, integrityHash, status, syncedEntityId, syncedAt, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [syncId, item.tempUuid, deviceId, item.payloadType || "APPLICATION", JSON.stringify(item.payload || {}), hash, status, syncedEntityId, now, now]);

      results.push({
        tempUuid: item.tempUuid,
        status,
        entityId: syncedEntityId || undefined,
        integrity: `server-sha256=${hash.slice(0, 12)}…`
      });
    }

    const actor = ctx ? { userId: ctx.userId, name: ctx.name, role: ctx.role } : { name: "ইউডিসি উদ্যোক্তা", role: "UDC" };
    writeAudit({
      actor,
      channel: "ASSISTED_UDC",
      action: "T9_OFFLINE_SYNC_PUSH",
      entityType: "OfflineSyncRecord",
      entityId: `batch-${Date.now()}`,
      after: `${results.length} items processed`,
      onWhoseAuthority: ctx?.name || "ইউডিসি উদ্যোক্তা"
    });

    return {
      status: 200,
      data: {
        results,
        count: results.length,
        status: results[0]?.status || "SYNCED"
      }
    };
  }

  return { status: 405, data: { error: 'Method not allowed' } };
}

module.exports = { handleSync };
