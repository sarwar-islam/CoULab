// ============================================================================
// Documents — versioned, never silently merged (G6). Sensitivity controls
// access (A3). Upload records provenance + checksum (integrity).
// ============================================================================

import { db } from "@/lib/db";
import { ok, fail, readJson, requireFields } from "@/lib/api";
import { requireSession, HttpError } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { sha256 } from "@/lib/crypto-server";
import { PROVENANCE_LIST } from "@/lib/constants";

export async function GET(req: Request) {
  try {
    const ctx = await requireSession();
    const { searchParams } = new URL(req.url);
    const caseId = searchParams.get("caseId");
    const applicationId = searchParams.get("applicationId");
    const where: Record<string, unknown> = {};
    if (caseId) where.caseId = caseId;
    if (applicationId) where.applicationId = applicationId;
    const documents = await db.documentRecord.findMany({ where, orderBy: { createdAt: "desc" } });

    // A3: sensitive material filtered by role
    if (!["DLAO_OFFICER", "MEDIATOR", "RECEIVING_DLAO", "CASE_SUPPORT", "ADMIN"].includes(ctx.role)) {
      const visible = documents.filter((d) => d.sensitivity === "NORMAL");
      return ok({ documents: visible, restrictedHidden: visible.length !== documents.length });
    }
    if (documents.some((d) => d.sensitivity !== "NORMAL")) {
      await db.sensitiveAccessLog
        .create({
          data: {
            caseId: caseId ?? null,
            documentId: null,
            accessedByUserId: ctx.userId ?? "unknown",
            actorRole: ctx.role,
            purpose: "নথি তালিকা পর্যালোচনা",
          },
        })
        .catch(() => undefined);
    }
    return ok({ documents });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession();
    const body = await readJson<{
      caseId?: string;
      applicationId?: string;
      title: string;
      docType: string;
      dataUrl?: string;
      textContent?: string;
      provenance: string;
      sensitivity?: "NORMAL" | "SENSITIVE" | "RESTRICTED";
      status?: "CURRENT" | "UNCLEAR";
      qualityFlags?: string[];
      sourceNote?: string;
      incidentGroupId?: string;
      uploadedByName?: string;
    }>(req);
    requireFields(body as never, ["title", "docType", "provenance"]);
    if (!PROVENANCE_LIST.includes(body.provenance)) throw new HttpError(400, `INVALID_PROVENANCE:${body.provenance}`);

    const content = body.textContent ?? "";
    const documentRecord = await db.documentRecord.create({
      data: {
        caseId: body.caseId ?? null,
        applicationId: body.applicationId ?? null,
        title: body.title,
        docType: body.docType,
        dataUrl: body.dataUrl ?? null,
        textContent: body.textContent ?? null,
        sourceNote: body.sourceNote ?? null,
        provenance: body.provenance,
        uploadedByUserId: ctx.userId ?? null,
        uploadedByName: body.uploadedByName ?? ctx.name,
        status: body.status ?? "CURRENT",
        sensitivity: body.sensitivity ?? "NORMAL",
        checksum: sha256(body.dataUrl ?? content || body.title),
        qualityFlags: JSON.stringify(body.qualityFlags ?? []),
        incidentGroupId: body.incidentGroupId ?? null,
      },
    });
    await writeAudit({
      actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
      channel: "WEB", action: "DOCUMENT_UPLOADED", entityType: "DocumentRecord",
      entityId: documentRecord.id, caseId: body.caseId, applicationId: body.applicationId,
      after: body.title, onWhoseAuthority: body.uploadedByName ?? ctx.name,
      metadata: { provenance: body.provenance, sensitivity: body.sensitivity ?? "NORMAL", qualityFlags: body.qualityFlags ?? [] },
    });
    return ok({ document: documentRecord }, 201);
  } catch (error) {
    return fail(error);
  }
}

/** New version (supersede) — G6: latest-version issues surfaced, old kept. */
export async function PATCH(req: Request) {
  try {
    const ctx = await requireSession();
    const body = await readJson<{ documentId: string; newTitle?: string; textContent?: string; dataUrl?: string; status?: string }>(req);
    requireFields(body as never, ["documentId"]);
    const previous = await db.documentRecord.findUnique({ where: { id: body.documentId } });
    if (!previous) throw new HttpError(404, "NOT_FOUND");

    const newVersion = await db.documentRecord.create({
      data: {
        caseId: previous.caseId,
        applicationId: previous.applicationId,
        title: body.newTitle ?? previous.title,
        docType: previous.docType,
        dataUrl: body.dataUrl ?? previous.dataUrl,
        textContent: body.textContent ?? previous.textContent,
        sourceNote: previous.sourceNote,
        provenance: previous.provenance,
        uploadedByUserId: ctx.userId,
        uploadedByName: ctx.name,
        version: previous.version + 1,
        status: body.status ?? "CURRENT",
        sensitivity: previous.sensitivity,
        checksum: sha256(body.dataUrl ?? body.textContent ?? previous.title),
        qualityFlags: previous.qualityFlags,
        incidentGroupId: previous.incidentGroupId,
      },
    });
    await db.documentRecord.update({ where: { id: previous.id }, data: { isCurrent: false, status: "SUPERSEDED" } });
    await writeAudit({
      actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
      channel: "WEB", action: "DOCUMENT_NEW_VERSION", entityType: "DocumentRecord",
      entityId: newVersion.id, caseId: previous.caseId, applicationId: previous.applicationId,
      before: `v${previous.version}`, after: `v${newVersion.version}`, onWhoseAuthority: ctx.name,
    });
    return ok({ document: newVersion }, 201);
  } catch (error) {
    return fail(error);
  }
}
