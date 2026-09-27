// ============================================================================
// T3 Related-incident groups — LINK, do not merge. Separate cases share
// common evidence at group level while confidentiality, instructions and
// outcomes remain case-specific.
// ============================================================================

import { db } from "@/lib/db";
import { ok, fail, readJson, requireFields } from "@/lib/api";
import { requireRole, requireSession, HttpError } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export async function GET() {
  try {
    await requireSession();
    const groups = await db.incidentGroup.findMany({
      include: {
        cases: { include: { application: { include: { applicant: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
    const sharedDocs = await db.documentRecord.findMany({
      where: { incidentGroupId: { not: null } },
      select: { id: true, title: true, docType: true, incidentGroupId: true, caseId: true, applicationId: true },
    });
    return ok({ groups, sharedDocs });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireRole("DLAO_OFFICER", "CASE_SUPPORT", "ADMIN");
    const body = await readJson<{ name: string; description: string; incidentDate?: string; location?: string; caseIds?: string[] }>(req);
    requireFields(body as never, ["name", "description"]);
    const group = await db.incidentGroup.create({
      data: {
        name: body.name,
        description: body.description,
        incidentDate: body.incidentDate ? new Date(body.incidentDate) : null,
        location: body.location ?? null,
        createdById: ctx.userId ?? "unknown",
      },
    });
    for (const caseId of body.caseIds ?? []) {
      await db.case.update({ where: { id: caseId }, data: { incidentGroupId: group.id } }).catch(() => undefined);
    }
    await writeAudit({
      actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
      channel: "WEB",
      action: "T3_INCIDENT_GROUP_CREATED",
      entityType: "IncidentGroup",
      entityId: group.id,
      after: `${group.name} (${(body.caseIds ?? []).length} মামলা সংযুক্ত)`,
      onWhoseAuthority: ctx.name,
    });
    return ok({ group }, 201);
  } catch (error) {
    return fail(error);
  }
}

/** Link a case to a group, or attach a document to the group's common evidence. */
export async function PATCH(req: Request) {
  try {
    const ctx = await requireRole("DLAO_OFFICER", "CASE_SUPPORT", "ADMIN");
    const body = await readJson<{
      action: "link_case" | "add_evidence";
      groupId: string;
      caseId?: string;
      documentId?: string;
    }>(req);
    requireFields(body as never, ["action", "groupId"]);

    if (body.action === "link_case") {
      requireFields(body as never, ["caseId"]);
      const kase = await db.case.findUnique({ where: { id: body.caseId } });
      if (!kase) throw new HttpError(404, "CASE_NOT_FOUND");
      await db.case.update({ where: { id: body.caseId }, data: { incidentGroupId: body.groupId } });
      await writeAudit({
        actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
        channel: "WEB", action: "T3_CASE_LINKED_TO_GROUP",
        entityType: "Case", entityId: body.caseId, caseId: body.caseId,
        after: body.groupId, onWhoseAuthority: ctx.name,
        metadata: { note: "সংযুক্ত (link) — একত্রীকরণ (merge) নয়" },
      });
      return ok({ success: true });
    }

    requireFields(body as never, ["documentId"]);
    const doc = await db.documentRecord.findUnique({ where: { id: body.documentId } });
    if (!doc) throw new HttpError(404, "DOCUMENT_NOT_FOUND");
    await db.documentRecord.update({ where: { id: body.documentId }, data: { incidentGroupId: body.groupId } });
    await writeAudit({
      actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
      channel: "WEB", action: "T3_EVIDENCE_SHARED_TO_GROUP",
      entityType: "DocumentRecord", entityId: body.documentId,
      caseId: doc.caseId, after: body.groupId, onWhoseAuthority: ctx.name,
      metadata: { note: "সাধারণ প্রমাণ একবার আপলোড — গোটা গ্রুপে দৃশ্যমান; কেস-নির্দিষ্ট তথ্য পৃথক থাকে" },
    });
    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}
