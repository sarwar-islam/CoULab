// Task engine — one engine, many consuming views (B1 queue, mediation
// reminders, lawyer deadlines, referral follow-ups). Owner, status, next
// action always tracked (G7).

import { db } from "@/lib/db";
import { ok, fail, readJson, requireFields } from "@/lib/api";
import { requireSession, HttpError } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export async function GET(req: Request) {
  try {
    const ctx = await requireSession();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? undefined;
    const caseId = searchParams.get("caseId") ?? undefined;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (caseId) where.caseId = caseId;
    // Role-scoped queues (G9): each role sees its own actionable tasks
    if (!["DLAO_OFFICER", "CASE_SUPPORT", "ADMIN"].includes(ctx.role)) {
      where.ownerRole = ctx.role;
    }

    const tasks = await db.task.findMany({
      where,
      include: { case: { select: { id: true, caseType: true, priority: true } } },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }],
      take: 200,
    });
    const now = Date.now();
    const tasksWithFlags = tasks.map((t) => ({
      ...t,
      overdue: (t.dueAt && t.dueAt.getTime() < now && t.status !== "DONE" && t.status !== "CANCELLED") || t.status === "OVERDUE",
    }));
    return ok({ tasks: tasksWithFlags });
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
      type: string;
      ownerRole: string;
      ownerUserId?: string;
      dueAt?: string;
      priority?: string;
      reason?: string;
      sourceModule?: string;
    }>(req);
    requireFields(body as never, ["title", "type", "ownerRole"]);
    const task = await db.task.create({
      data: {
        caseId: body.caseId ?? null,
        applicationId: body.applicationId ?? null,
        title: body.title,
        type: body.type,
        ownerRole: body.ownerRole,
        ownerUserId: body.ownerUserId ?? null,
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
        priority: body.priority ?? "MEDIUM",
        reason: body.reason ?? null,
        sourceModule: body.sourceModule ?? ctx.role,
      },
    });
    await writeAudit({
      actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
      channel: "WEB", action: "TASK_CREATED", entityType: "Task", entityId: task.id,
      caseId: body.caseId, applicationId: body.applicationId, after: task.title, onWhoseAuthority: ctx.name,
    });
    return ok({ task }, 201);
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await requireSession();
    const body = await readJson<{ taskId: string; status: "IN_PROGRESS" | "DONE" | "CANCELLED" | "OPEN"; note?: string }>(req);
    requireFields(body as never, ["taskId", "status"]);
    const task = await db.task.findUnique({ where: { id: body.taskId } });
    if (!task) throw new HttpError(404, "NOT_FOUND");
    const updated = await db.task.update({
      where: { id: body.taskId },
      data: {
        status: body.status,
        completedByUserId: body.status === "DONE" ? ctx.userId : undefined,
        completedAt: body.status === "DONE" ? new Date() : undefined,
      },
    });
    await writeAudit({
      actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
      channel: "WEB", action: `TASK_${body.status}`, entityType: "Task", entityId: body.taskId,
      caseId: task.caseId, before: task.status, after: body.status,
      reason: body.note, onWhoseAuthority: ctx.name,
    });
    return ok({ task: updated });
  } catch (error) {
    return fail(error);
  }
}
