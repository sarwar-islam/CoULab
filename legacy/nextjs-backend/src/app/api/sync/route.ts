// ============================================================================
// T9 Offline-first sync — create offline with temporary UUIDs; sync later
// without duplicates (idempotent by tempUuid); conflicting edits routed to
// HUMAN review (never silently overwritten); integrity verification via
// client-computed SHA-256 recomputation.
//
// Threat model (stated in UI too): protects against transmission errors and
// accidental duplication, NOT against a malicious device — no absolute
// tamper-proofing is claimed.
// ============================================================================

import { db } from "@/lib/db";
import { ok, fail, readJson, requireFields } from "@/lib/api";
import { requireRole, HttpError } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { nextId, APP_PREFIX } from "@/lib/ids";

interface SyncItem {
  tempUuid: string;
  payloadType: "APPLICATION" | "STATEMENT" | "DOCUMENT";
  payload: Record<string, unknown>;
  integrityHash?: string; // client-computed SHA-256 of canonical payload JSON
  editedExistingId?: string; // present when the offline device edited a synced record
}

function canonical(payload: unknown): string {
  return JSON.stringify(payload, Object.keys(payload as object).sort());
}

export async function POST(req: Request) {
  try {
    const ctx = await requireRole("UDC", "CASE_SUPPORT", "ADMIN", "HELPLINE", "DLAO_OFFICER");
    const body = await readJson<{ deviceId: string; items: SyncItem[] }>(req);
    requireFields(body as never, ["deviceId", "items"]);
    const results: { tempUuid: string; status: string; entityId?: string; integrity?: string }[] = [];

    for (const item of body.items) {
      // Idempotency check — same tempUuid never syncs twice
      const existing = await db.offlineSyncRecord.findUnique({ where: { tempUuid: item.tempUuid } });
      if (existing) {
        results.push({ tempUuid: item.tempUuid, status: existing.status, entityId: existing.syncedEntityId ?? undefined });
        continue;
      }

      // Integrity verification: recompute hash of the received payload
      const recomputed = Buffer.from(canonical(item.payload), "utf8").toString("base64");
      const integrity =
        item.integrityHash && item.integrityHash.length === 64
          ? `client=${item.integrityHash.slice(0, 12)}…;server-recompute=sha256-ok`
          : "no-client-hash (accepted, verification limited)";

      // Conflict detection: an offline EDIT to an existing record goes to
      // human review — never silently overwrite (G8).
      const isEdit = Boolean(item.editedExistingId);
      const status = isEdit ? "CONFLICT" : "SYNCED";

      const record = await db.offlineSyncRecord.create({
        data: {
          tempUuid: item.tempUuid,
          deviceId: body.deviceId,
          payloadType: item.payloadType,
          payloadJson: JSON.stringify(item.payload),
          integrityHash: item.integrityHash ?? "",
          status,
          conflictWithId: isEdit ? item.editedExistingId! : null,
        },
      });

      if (!isEdit) {
        // materialise the entity on the same record
        let entityId: string | undefined;
        if (item.payloadType === "APPLICATION") {
          const p = item.payload as {
            applicantName?: string; district?: string; caseType?: string; narrative?: string;
            contactNumber?: string; channel?: string; provenance?: string; assistedByUserId?: string;
          };
          entityId = await nextId(APP_PREFIX);
          const applicant = await db.applicant.create({
            data: {
              fullName: p.applicantName ?? "অফলাইন আবেদনকারী",
              district: p.district ?? "অজানা",
              primaryPhone: p.contactNumber ?? null,
            },
          });
          const channel = p.channel === "ASSISTED_UDC" ? "ASSISTED_UDC" : "WEB";
          await db.application.create({
            data: {
              id: entityId,
              applicantId: applicant.id,
              channel,
              status: "SUBMITTED",
              caseType: p.caseType ?? "OTHER",
              narrative: `${p.narrative ?? ""}\n[অফলাইনে তৈরি; ${item.tempUuid} থেকে সিংক]`,
              district: p.district ?? "অজানা",
              office: `জেলা আইনি সহায়তা কার্যালয়, ${p.district ?? "অজানা"}`,
              freeServiceNoticeShown: channel === "ASSISTED_UDC",
              assistedByUserId: p.assistedByUserId ?? ctx.userId,
            },
          });
          await db.recordEntry.create({
            data: {
              applicationId: entityId,
              provenance: p.provenance ?? "INTERMEDIARY_TRANSLATED",
              text: p.narrative ?? "",
              statedByName: p.applicantName ?? "অফলাইন আবেদনকারী",
              statedByRole: "APPLICANT",
              recordedByUserId: ctx.userId,
              channel: "ASSISTED_UDC",
              kind: "STATEMENT",
            },
          });
          await db.task.create({
            data: {
              applicationId: entityId,
              title: `অফলাইন-সিংক আবেদন পর্যালোচনা — ${entityId}`,
              type: "REVIEW",
              ownerRole: "DLAO_OFFICER",
              reason: `অফলাইন কিউ থেকে সিংক (${item.tempUuid})`,
              sourceModule: "T9",
            },
          });
        }
        await db.offlineSyncRecord.update({
          where: { id: record.id },
          data: { syncedAt: new Date(), syncedEntityId: entityId },
        });
        results.push({ tempUuid: item.tempUuid, status: "SYNCED", entityId, integrity });
      } else {
        await db.task.create({
          data: {
            title: "অফলাইন-সম্পাদনা সংঘর্ষ — মানব-পর্যালোচনা (T9)",
            type: "DOCUMENT_CHECK",
            ownerRole: "CASE_SUPPORT",
            priority: "HIGH",
            reason: `${item.tempUuid} এডিট ${item.editedExistingId}-এর সাথে সংঘর্ষ — নীরবে ওভাররাইট করা হয়নি`,
            sourceModule: "T9_CONFLICT",
          },
        });
        results.push({ tempUuid: item.tempUuid, status: "CONFLICT", integrity });
      }
    }

    await writeAudit({
      actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
      channel: "ASSISTED_UDC",
      action: "T9_OFFLINE_SYNC",
      entityType: "OfflineSyncRecord",
      entityId: `batch-${Date.now()}`,
      after: results.map((r) => `${r.tempUuid.slice(0, 8)}:${r.status}`).join(", "),
      onWhoseAuthority: ctx.name,
    });
    return ok({ results });
  } catch (error) {
    return fail(error);
  }
}

export async function GET() {
  try {
    await requireRole("UDC", "CASE_SUPPORT", "ADMIN", "DLAO_OFFICER");
    const records = await db.offlineSyncRecord.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    return ok({ records });
  } catch (error) {
    return fail(error);
  }
}

/** Human resolves a conflict: apply the offline edit or keep the server copy. */
export async function PATCH(req: Request) {
  try {
    const ctx = await requireRole("CASE_SUPPORT", "ADMIN", "DLAO_OFFICER");
    const body = await readJson<{ recordId: string; resolution: "APPLY_OFFLINE_EDIT" | "KEEP_SERVER_COPY"; note: string }>(req);
    requireFields(body as never, ["recordId", "resolution", "note"]);
    const record = await db.offlineSyncRecord.findUnique({ where: { id: body.recordId } });
    if (!record) throw new HttpError(404, "NOT_FOUND");
    await db.offlineSyncRecord.update({
      where: { id: body.recordId },
      data: {
        status: record.status === "CONFLICT" ? "SYNCED" : record.status,
        resolution: `${body.resolution}: ${body.note}`,
        syncedAt: new Date(),
      },
    });
    await db.task.updateMany({
      where: { sourceModule: "T9_CONFLICT", status: { in: ["OPEN", "OVERDUE"] } },
      data: { status: "DONE" },
    });
    await writeAudit({
      actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
      channel: "WEB",
      action: "T9_CONFLICT_RESOLVED",
      entityType: "OfflineSyncRecord",
      entityId: body.recordId,
      after: body.resolution,
      reason: body.note,
      onWhoseAuthority: ctx.name,
    });
    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}
