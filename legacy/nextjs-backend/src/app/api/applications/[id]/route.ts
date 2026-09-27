import { db } from "@/lib/db";
import { ok, fail, readJson, requireFields } from "@/lib/api";
import { requireSession, requireRole, HttpError } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { acceptApplication, assertApplicationTransition } from "@/lib/lifecycle";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession();
    const { id } = await params;
    const application = await db.application.findUnique({
      where: { id },
      include: {
        applicant: true,
        entries: { orderBy: { createdAt: "asc" } },
        documents: { orderBy: { createdAt: "desc" } },
        consents: { orderBy: { createdAt: "desc" } },
        tasks: { orderBy: { createdAt: "desc" } },
        cases: true,
      },
    });
    if (!application) throw new HttpError(404, "NOT_FOUND");

    // G9 scope-limited citizen/representative access
    if ((ctx.role === "CITIZEN" || ctx.role === "REPRESENTATIVE") && ctx.citizenApplicationId !== id) {
      throw new HttpError(403, "FORBIDDEN_SCOPE");
    }
    return ok({ application });
  } catch (error) {
    return fail(error);
  }
}

/** Verification / review actions: review, request-info, reject, accept (mint Case). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRole("DLAO_OFFICER", "CASE_SUPPORT", "HELPLINE");
    const { id } = await params;
    const body = await readJson<{ action: string; reason?: string; priority?: string }>(req);
    requireFields(body as never, ["action"]);

    const application = await db.application.findUnique({ where: { id }, include: { applicant: true } });
    if (!application) throw new HttpError(404, "NOT_FOUND");

    const actor = { userId: ctx.userId, name: ctx.name, role: ctx.role };
    const channel = "WEB";

    switch (body.action) {
      case "start_review": {
        await assertApplicationTransition(application.status, "UNDER_REVIEW");
        await db.application.update({ where: { id }, data: { status: "UNDER_REVIEW" } });
        await writeAudit({ actor, channel, action: "APPLICATION_REVIEW_STARTED", entityType: "Application", entityId: id, applicationId: id, before: application.status, after: "UNDER_REVIEW", onWhoseAuthority: ctx.name });
        break;
      }
      case "request_info": {
        await assertApplicationTransition(application.status, "MORE_INFO_NEEDED");
        if (!body.reason) throw new HttpError(400, "VALIDATION_REASON_REQUIRED");
        await db.application.update({ where: { id }, data: { status: "MORE_INFO_NEEDED" } });
        await db.task.create({ data: { applicationId: id, title: "অতিরিক্ত তথ্য সংগ্রহ", type: "DOCUMENT_CHECK", ownerRole: "CASE_SUPPORT", reason: body.reason } });
        await writeAudit({ actor, channel, action: "APPLICATION_MORE_INFO_REQUESTED", entityType: "Application", entityId: id, applicationId: id, reason: body.reason, onWhoseAuthority: ctx.name });
        break;
      }
      case "reject": {
        // HUMAN AUTHORITY: rejection decision stays with the authorised human.
        await assertApplicationTransition(application.status, "REJECTED");
        if (!body.reason) throw new HttpError(400, "VALIDATION_REASON_REQUIRED");
        await db.application.update({ where: { id }, data: { status: "REJECTED", rejectionReason: body.reason, rejectionDecidedByUserId: ctx.userId } });
        await writeAudit({ actor, channel, action: "APPLICATION_REJECTED", entityType: "Application", entityId: id, applicationId: id, reason: body.reason, onWhoseAuthority: ctx.name });
        break;
      }
      case "accept": {
        const kase = await acceptApplication(id, actor, channel, {
          priority: body.priority,
          sensitive: application.sensitiveFlag,
        });
        return ok({ caseId: kase.id }, 201);
      }
      default:
        throw new HttpError(400, `INVALID_ACTION:${body.action}`);
    }
    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}
