// ============================================================================
// Panel lawyer management — B5 (worklist, accept/decline, hearings, updates)
// and T1 (lawyer-change request -> human review -> reassignment -> stage-based
// payment reconciliation -> separate inactivity pattern alert).
// ============================================================================

import { db } from "@/lib/db";
import { ok, fail, readJson, requireFields } from "@/lib/api";
import { requireRole, requireSession, HttpError } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { checkAndFlagPattern } from "@/lib/lawyer-inactivity";

export async function GET(req: Request) {
  try {
    const ctx = await requireSession();
    const { searchParams } = new URL(req.url);
    const view = searchParams.get("view");

    if (view === "worklist") {
      // B5: lawyer's single assignment/worklist
      const assignments = await db.lawyerAssignment.findMany({
        where: ctx.role === "LAWYER" ? { lawyerUserId: ctx.userId } : {},
        include: {
          case: {
            include: {
              application: { include: { applicant: true } },
              hearings: { orderBy: { hearingDate: "asc" } },
              tasks: { where: { type: "LAWYER_UPDATE" } },
              documents: { where: { isCurrent: true } },
            },
          },
          updates: { orderBy: { submittedAt: "desc" } },
          lawyer: { select: { name: true, nameBn: true } },
        },
        orderBy: { assignedAt: "desc" },
      });
      const now = Date.now();
      const enriched = assignments.map((a) => ({
        ...a,
        overdueUpdate: a.case.tasks.some(
          (t) => t.status === "OVERDUE" || (t.dueAt && t.dueAt.getTime() < now && t.status === "OPEN"),
        ),
      }));
      return ok({ assignments: enriched });
    }

    // assignments for a case
    const caseId = searchParams.get("caseId");
    if (caseId) {
      const assignments = await db.lawyerAssignment.findMany({
        where: { caseId },
        include: { lawyer: { select: { id: true, name: true, nameBn: true } }, updates: true },
        orderBy: { assignedAt: "desc" },
      });
      return ok({ assignments });
    }
    throw new HttpError(400, "VALIDATION_VIEW_REQUIRED");
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireRole("DLAO_OFFICER", "CASE_SUPPORT", "ADMIN");
    const body = await readJson<{
      action: "assign" | "add_hearing";
      caseId: string;
      lawyerUserId?: string;
      hearingDate?: string;
      location?: string;
    }>(req);
    requireFields(body as never, ["action", "caseId"]);

    if (body.action === "assign") {
      requireFields(body as never, ["lawyerUserId"]);
      // HUMAN AUTHORITY: final lawyer assignment is a human decision (recorded)
      const assignment = await db.lawyerAssignment.create({
        data: { caseId: body.caseId, lawyerUserId: body.lawyerUserId!, status: "PROPOSED" },
      });
      const lawyer = await db.user.findUnique({ where: { id: body.lawyerUserId! } });
      await db.task.create({
        data: {
          caseId: body.caseId,
          title: "নিয়োগ গ্রহণ/অপ্রত্যাখ্যান করুন",
          type: "LAWYER_UPDATE",
          ownerRole: "LAWYER",
          ownerUserId: body.lawyerUserId!,
          dueAt: new Date(Date.now() + 3 * 86400_000),
          reason: "ডিজিটাল নিয়োগ প্রস্তাব — ৩ দিনের মধ্যে গ্রহণ/অপ্রত্যাখ্যান",
          sourceModule: "B5",
        },
      });
      await writeAudit({
        actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
        channel: "WEB", action: "LAWYER_ASSIGNMENT_PROPOSED",
        entityType: "LawyerAssignment", entityId: assignment.id, caseId: body.caseId,
        after: `lawyer=${lawyer?.name}`, onWhoseAuthority: ctx.name,
      });
      return ok({ assignment }, 201);
    }

    // add_hearing
    requireFields(body as never, ["hearingDate"]);
    const hearing = await db.hearing.create({
      data: {
        caseId: body.caseId,
        hearingDate: new Date(body.hearingDate!),
        location: body.location ?? "জেলা আদালত",
      },
    });
    await db.task.create({
      data: {
        caseId: body.caseId,
        title: "হিয়ারিং-পূর্ব হালনাগাদ জমা দিন",
        type: "LAWYER_UPDATE",
        ownerRole: "LAWYER",
        dueAt: new Date(new Date(body.hearingDate!).getTime() - 2 * 86400_000),
        reason: "হিয়ারিংয়ের ২ কার্যদিবস আগে প্রস্তুতি-হালনাগাদ প্রয়োজন (নাগরিক অযথা ভ্রমণ এড়াতে)",
        sourceModule: "B5",
      },
    });
    await writeAudit({
      actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
      channel: "WEB", action: "HEARING_SCHEDULED",
      entityType: "Hearing", entityId: hearing.id, caseId: body.caseId,
      after: body.hearingDate!, onWhoseAuthority: ctx.name,
    });
    return ok({ hearing }, 201);
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await requireSession();
    const body = await readJson<{
      action: "accept" | "decline" | "update" | "hearing_status" | "reassign" | "payment";
      assignmentId: string;
      reason?: string;
      updateText?: string;
      hearingId?: string;
      hearingStatus?: string;
      newLawyerUserId?: string;
      paymentStatus?: string;
      paymentNote?: string;
    }>(req);
    requireFields(body as never, ["action", "assignmentId"]);
    const assignment = await db.lawyerAssignment.findUnique({ where: { id: body.assignmentId } });
    if (!assignment) throw new HttpError(404, "NOT_FOUND");
    const actor = { userId: ctx.userId, name: ctx.name, role: ctx.role };

    switch (body.action) {
      case "accept": {
        if (ctx.role !== "LAWYER" && ctx.role !== "ADMIN") throw new HttpError(403, "FORBIDDEN_ONLY_LAWYER");
        await db.lawyerAssignment.update({ where: { id: assignment.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
        await db.case.update({ where: { id: assignment.caseId }, data: { status: "LAWYER_ASSIGNED" } }).catch(() => undefined);
        await writeAudit({ actor, channel: "WEB", action: "LAWYER_ACCEPTED_ASSIGNMENT", entityType: "LawyerAssignment", entityId: assignment.id, caseId: assignment.caseId, before: assignment.status, after: "ACCEPTED", onWhoseAuthority: ctx.name });
        break;
      }
      case "decline": {
        if (ctx.role !== "LAWYER" && ctx.role !== "ADMIN") throw new HttpError(403, "FORBIDDEN_ONLY_LAWYER");
        if (!body.reason) throw new HttpError(400, "VALIDATION_REASON_REQUIRED");
        await db.lawyerAssignment.update({ where: { id: assignment.id }, data: { status: "DECLINED", declinedReason: body.reason } });
        await writeAudit({ actor, channel: "WEB", action: "LAWYER_DECLINED_ASSIGNMENT", entityType: "LawyerAssignment", entityId: assignment.id, caseId: assignment.caseId, reason: body.reason, onWhoseAuthority: ctx.name });
        break;
      }
      case "update": {
        if (ctx.role !== "LAWYER" && ctx.role !== "ADMIN") throw new HttpError(403, "FORBIDDEN_ONLY_LAWYER");
        if (!body.updateText) throw new HttpError(400, "VALIDATION_UPDATE_TEXT_REQUIRED");
        await db.lawyerUpdate.create({
          data: { caseId: assignment.caseId, lawyerAssignmentId: assignment.id, text: body.updateText },
        });
        await db.lawyerAssignment.update({ where: { id: assignment.id }, data: { lastUpdateAt: new Date() } });
        // close any open LAWYER_UPDATE tasks for this case
        await db.task.updateMany({
          where: { caseId: assignment.caseId, type: "LAWYER_UPDATE", ownerRole: "LAWYER", status: { in: ["OPEN", "OVERDUE"] } },
          data: { status: "DONE" },
        });
        // safe client notification linked to the case (B5)
        await db.notification.create({
          data: {
            caseId: assignment.caseId,
            channel: "IVR",
            message: "আপনার মামলা হালনাগাদ হয়েছে। বিস্তারিত জানতে এই নম্বরে কল করুন। (নিরপেক্ষ বার্তা)",
            neutralWording: true,
            relatedModule: "B5_LAWYER_UPDATE",
          },
        });
        await writeAudit({ actor, channel: "WEB", action: "LAWYER_UPDATE_SUBMITTED", entityType: "LawyerUpdate", entityId: `${assignment.id}:${Date.now()}`, caseId: assignment.caseId, after: body.updateText.slice(0, 200), onWhoseAuthority: ctx.name });
        break;
      }
      case "hearing_status": {
        requireFields(body as never, ["hearingId", "hearingStatus"]);
        await db.hearing.update({ where: { id: body.hearingId }, data: { status: body.hearingStatus! } });
        await writeAudit({ actor, channel: "WEB", action: `HEARING_${body.hearingStatus}`, entityType: "Hearing", entityId: body.hearingId!, caseId: assignment.caseId, onWhoseAuthority: ctx.name });
        // re-check pattern (T1) after a missed hearing
        await checkAndFlagPattern(assignment.id);
        break;
      }
      case "reassign": {
        // T1: human review decision -> reassignment
        if (!["DLAO_OFFICER", "ADMIN"].includes(ctx.role)) throw new HttpError(403, "FORBIDDEN_ONLY_AUTHORISED_HUMAN");
        requireFields(body as never, ["newLawyerUserId", "reason"]);
        await db.lawyerAssignment.update({ where: { id: assignment.id }, data: { status: "REASSIGNED" } });
        const newAssignment = await db.lawyerAssignment.create({
          data: { caseId: assignment.caseId, lawyerUserId: body.newLawyerUserId!, status: "PROPOSED" },
        });
        // stage-based payment reconciliation note (T1)
        const stage = assignment.stage;
        await db.lawyerAssignment.update({
          where: { id: newAssignment.id },
          data: {
            paymentStatus: "PENDING_REVIEW",
            paymentNote: `পুনর্নিয়োগ — পূর্ববর্তী পর্যায়: ${stage}; কাজের পর্যায়ভিত্তিক পরিশোধ পুনর্মূল্যায়ন প্রয়োজন`,
          },
        });
        await writeAudit({
          actor, channel: "WEB", action: "T1_LAWYER_REASSIGNED",
          entityType: "LawyerAssignment", entityId: newAssignment.id, caseId: assignment.caseId,
          reason: body.reason, onWhoseAuthority: ctx.name,
          metadata: { previousAssignmentId: assignment.id, stage, paymentReconciliation: true },
        });
        break;
      }
      case "payment": {
        if (!["DLAO_OFFICER", "CASE_SUPPORT", "ADMIN"].includes(ctx.role)) throw new HttpError(403, "FORBIDDEN");
        requireFields(body as never, ["paymentStatus"]);
        await db.lawyerAssignment.update({
          where: { id: assignment.id },
          data: { paymentStatus: body.paymentStatus!, paymentNote: body.paymentNote ?? assignment.paymentNote },
        });
        await writeAudit({
          actor, channel: "WEB", action: "T1_PAYMENT_STATUS_RECONCILED",
          entityType: "LawyerAssignment", entityId: assignment.id, caseId: assignment.caseId,
          before: assignment.paymentStatus, after: body.paymentStatus!, reason: body.paymentNote, onWhoseAuthority: ctx.name,
        });
        break;
      }
      default:
        throw new HttpError(400, `INVALID_ACTION:${body.action}`);
    }
    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}
