// ============================================================================
// Record entries — every information entry carries provenance (G2).
// Corrections point at the entry they supersede; withdrawal is recorded,
// never silent (A1: Moyuri can later correct or withdraw information).
// ============================================================================

import { db } from "@/lib/db";
import { ok, fail, readJson, requireFields } from "@/lib/api";
import { requireSession, HttpError } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { PROVENANCE_LIST } from "@/lib/constants";

export async function POST(req: Request) {
  try {
    const ctx = await requireSession();
    const body = await readJson<{
      caseId?: string;
      applicationId?: string;
      provenance: string;
      text: string;
      originalText?: string;
      language?: string;
      statedByName?: string;
      channel?: string;
      kind?: string;
      supersedesEntryId?: string;
    }>(req);
    requireFields(body as never, ["provenance", "text"]);
    if (!PROVENANCE_LIST.includes(body.provenance)) throw new HttpError(400, `INVALID_PROVENANCE:${body.provenance}`);
    if (!body.caseId && !body.applicationId) throw new HttpError(400, "VALIDATION_TARGET_REQUIRED");

    const entry = await db.recordEntry.create({
      data: {
        caseId: body.caseId ?? null,
        applicationId: body.applicationId ?? null,
        provenance: body.provenance,
        text: body.text,
        originalText: body.originalText ?? null,
        language: body.language ?? "bn",
        statedByName: body.statedByName ?? ctx.name,
        statedByRole:
          body.provenance === "APPLICANT_CONFIRMED"
            ? "APPLICANT"
            : body.provenance === "REPRESENTATIVE_REPORTED"
              ? "REPRESENTATIVE"
              : body.provenance === "INTERMEDIARY_TRANSLATED"
                ? "INTERMEDIARY"
                : body.provenance === "AI_INFERRED"
                  ? "AI"
                  : "STAFF",
        recordedByUserId: ctx.userId ?? null,
        channel: body.channel ?? "WEB",
        kind: body.kind ?? "STATEMENT",
        supersedesEntryId: body.supersedesEntryId ?? null,
      },
    });

    await writeAudit({
      actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
      channel: body.channel ?? "WEB",
      action: "RECORD_ENTRY_ADDED",
      entityType: "RecordEntry",
      entityId: entry.id,
      caseId: body.caseId,
      applicationId: body.applicationId,
      after: body.provenance,
      onWhoseAuthority: body.statedByName ?? ctx.name,
      metadata: { provenance: body.provenance, supersedes: body.supersedesEntryId ?? null },
    });
    return ok({ entry }, 201);
  } catch (error) {
    return fail(error);
  }
}

/** Withdraw (or correct) an entry — visible state change, never deletion. */
export async function PATCH(req: Request) {
  try {
    const ctx = await requireSession();
    const body = await readJson<{ entryId: string; action: "withdraw" | "restore"; reason?: string }>(req);
    requireFields(body as never, ["entryId", "action"]);
    const entry = await db.recordEntry.findUnique({ where: { id: body.entryId } });
    if (!entry) throw new HttpError(404, "NOT_FOUND");

    if (body.action === "withdraw") {
      if (!body.reason) throw new HttpError(400, "VALIDATION_REASON_REQUIRED");
      await db.recordEntry.update({
        where: { id: body.entryId },
        data: { withdrawn: true, withdrawnReason: body.reason, withdrawnAt: new Date() },
      });
      await writeAudit({
        actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
        channel: "WEB",
        action: "RECORD_ENTRY_WITHDRAWN",
        entityType: "RecordEntry",
        entityId: body.entryId,
        caseId: entry.caseId,
        applicationId: entry.applicationId,
        reason: body.reason,
        onWhoseAuthority: ctx.name,
        before: entry.text.slice(0, 200),
        after: "WITHDRAWN",
      });
    } else {
      await db.recordEntry.update({
        where: { id: body.entryId },
        data: { withdrawn: false, withdrawnReason: null, withdrawnAt: null },
      });
      await writeAudit({
        actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
        channel: "WEB",
        action: "RECORD_ENTRY_RESTORED",
        entityType: "RecordEntry",
        entityId: body.entryId,
        caseId: entry.caseId,
        applicationId: entry.applicationId,
        onWhoseAuthority: ctx.name,
      });
    }
    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}
