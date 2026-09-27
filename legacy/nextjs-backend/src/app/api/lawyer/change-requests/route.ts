// T1 lawyer-change requests — citizen request -> DLAO queue -> human review.

import { db } from "@/lib/db";
import { ok, fail, readJson, requireFields } from "@/lib/api";
import { requireRole, requireSession, HttpError } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { checkAndFlagPattern } from "@/lib/lawyer-inactivity";

export async function GET() {
  try {
    await requireSession();
    const requests = await db.lawyerChangeRequest.findMany({
      include: {
        case: {
          select: {
            id: true, caseType: true, office: true,
            application: { select: { applicant: { select: { fullName: true } } } },
            lawyerAssignments: { where: { status: { in: ["PROPOSED", "ACCEPTED"] } }, include: { lawyer: { select: { name: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return ok({ requests });
  } catch (error) {
    return fail(error);
  }
}

/** Citizen/representative files a lawyer-change request (A1/A5 door). */
export async function POST(req: Request) {
  try {
    const ctx = await requireSession();
    const body = await readJson<{ caseId: string; reason: string; requestedByName?: string }>(req);
    requireFields(body as never, ["caseId", "reason"]);
    const kase = await db.case.findUnique({ where: { id: body.caseId }, include: { application: { include: { applicant: true } } } });
    if (!kase) throw new HttpError(404, "CASE_NOT_FOUND");

    const request = await db.lawyerChangeRequest.create({
      data: {
        caseId: body.caseId,
        requestedByName: body.requestedByName ?? kase.application.applicant.fullName,
        requestedByRole: ctx.role === "REPRESENTATIVE" ? "REPRESENTATIVE" : "CITIZEN",
        reason: body.reason,
      },
    });
    await db.task.create({
      data: {
        caseId: body.caseId,
        title: "আইনজীবী পরিবর্তনের অনুরোধ — মানব-পর্যালোচনা",
        type: "REVIEW",
        ownerRole: "DLAO_OFFICER",
        priority: "HIGH",
        reason: "নাগরিকের অনুরোধ: চূড়ান্ত সিদ্ধান্ত কর্মকর্তার (T1)",
        sourceModule: "T1",
      },
    });
    await writeAudit({
      actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
      channel: ctx.role === "REPRESENTATIVE" ? "ASSISTED_UDC" : "WEB",
      action: "T1_LAWYER_CHANGE_REQUESTED",
      entityType: "LawyerChangeRequest",
      entityId: request.id,
      caseId: body.caseId,
      reason: body.reason,
      onWhoseAuthority: body.requestedByName ?? kase.application.applicant.fullName,
    });
    return ok({ request }, 201);
  } catch (error) {
    return fail(error);
  }
}

/** Officer review decision: reassign (via /api/lawyer PATCH reassign) or dismiss. */
export async function PATCH(req: Request) {
  try {
    const ctx = await requireRole("DLAO_OFFICER", "ADMIN");
    const body = await readJson<{ requestId: string; decision: "UNDER_REVIEW" | "REASSIGNED" | "DISMISSED"; reviewNotes: string }>(req);
    requireFields(body as never, ["requestId", "decision", "reviewNotes"]);
    const request = await db.lawyerChangeRequest.findUnique({ where: { id: body.requestId } });
    if (!request) throw new HttpError(404, "NOT_FOUND");
    await db.lawyerChangeRequest.update({
      where: { id: body.requestId },
      data: { status: body.decision, reviewedByUserId: ctx.userId, reviewNotes: body.reviewNotes, reviewDecision: body.decision, decidedAt: new Date() },
    });
    // After a reassignment decision, refresh the pattern alert state (T1 separate alert)
    const assignments = await db.lawyerAssignment.findMany({ where: { caseId: request.caseId }, orderBy: { assignedAt: "desc" } });
    if (assignments[0]) await checkAndFlagPattern(assignments[0].id);
    await writeAudit({
      actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
      channel: "WEB",
      action: `T1_REQUEST_${body.decision}`,
      entityType: "LawyerChangeRequest",
      entityId: body.requestId,
      caseId: request.caseId,
      reason: body.reviewNotes,
      onWhoseAuthority: ctx.name,
    });
    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}
