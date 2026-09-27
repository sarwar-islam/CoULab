// ============================================================================
// Case detail — the one-record view. Server-side role filtering (G9):
//  - SENSITIVE/RESTRICTED material only for authorised roles; every access
//    to sensitive documents is logged (A3).
//  - Scope-limited citizen access sees status + own entries only.
// ============================================================================

import { db } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { requireSession, HttpError } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { RESTRICTED_ACCESS_ROLES } from "@/lib/constants";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession();
    const { id } = await params;
    const url = new URL(req.url);
    const accessPurpose = url.searchParams.get("purpose") ?? "রেকর্ড পর্যালোচনা";

    const kase = await db.case.findUnique({
      where: { id },
      include: {
        application: { include: { applicant: true, entries: true } },
        entries: { orderBy: { createdAt: "asc" } },
        documents: { orderBy: [{ isCurrent: "desc" }, { createdAt: "desc" }] },
        consents: { orderBy: { grantedAt: "desc" } },
        contactRules: { orderBy: { createdAt: "desc" } },
        contactAttempts: { orderBy: { createdAt: "desc" }, take: 20 },
        tasks: { orderBy: [{ status: "asc" }, { dueAt: "asc" }] },
        referrals: { orderBy: { createdAt: "desc" } },
        lawyerAssignments: { include: { lawyer: true, updates: { orderBy: { submittedAt: "desc" } } } },
        lawyerChangeRequests: { orderBy: { createdAt: "desc" } },
        hearings: { orderBy: { hearingDate: "desc" } },
        mediationSessions: { orderBy: { scheduledAt: "desc" } },
        settlementDrafts: {
          orderBy: { createdAt: "desc" },
          include: { signatureSessions: { include: { signatures: true } } },
        },
        triageRuns: { orderBy: { createdAt: "desc" }, take: 5 },
        notifications: { orderBy: { createdAt: "desc" }, take: 20 },
        sensitiveAccessLogs: { orderBy: { accessedAt: "desc" }, take: 20 },
      },
    });
    if (!kase) throw new HttpError(404, "NOT_FOUND");

    // Audit trail for the record view (G10)
    const auditEntries = await db.auditEntry.findMany({
      where: { caseId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    // Citizen scope-limited access: only own case, limited payload
    if (ctx.role === "CITIZEN" || ctx.role === "REPRESENTATIVE") {
      const app = await db.application.findUnique({ where: { id: kase.applicationId } });
      if (app?.id !== (ctx as { citizenApplicationId?: string }).citizenApplicationId) {
        throw new HttpError(403, "FORBIDDEN_SCOPE");
      }
      const audit = await db.auditEntry.findMany({
        where: { caseId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { action: true, createdAt: true, channel: true, actorRole: true, after: true },
      });
      return ok({
        case: {
          id: kase.id,
          status: kase.status,
          caseType: kase.caseType,
          priority: kase.priority,
          createdAt: kase.createdAt,
          applicationId: kase.applicationId,
        },
        application: { id: app!.id, status: app!.status, narrative: app!.narrative, applicant: { fullName: app!.applicant.fullName } },
        entries: kase.entries,
        hearings: kase.hearings.map((h) => ({ id: h.id, hearingDate: h.hearingDate, status: h.status, location: h.location })),
        tasks: kase.tasks.filter((t) => t.type === "STATUS_UPDATE"),
        audit,
      });
    }

    // Staff access — restricted material check (A3)
    const canSeeRestricted = RESTRICTED_ACCESS_ROLES.includes(ctx.role);
    const sensitiveDocs = kase.documents.filter((d) => d.sensitivity !== "NORMAL");
    if (sensitiveDocs.length > 0 && !canSeeRestricted) {
      return ok({ case: { ...kase, documents: kase.documents.filter((d) => d.sensitivity === "NORMAL"), restrictedHidden: true }, restrictedBlocked: true });
    }
    if (sensitiveDocs.length > 0) {
      // Log material access (A3: keep material access history)
      await db.sensitiveAccessLog.create({
        data: { caseId: id, accessedByUserId: ctx.userId ?? "unknown", actorRole: ctx.role, purpose: accessPurpose },
      });
      await writeAudit({
        actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
        channel: "WEB",
        action: "SENSITIVE_MATERIAL_ACCESSED",
        entityType: "Case",
        entityId: id,
        caseId: id,
        reason: accessPurpose,
        onWhoseAuthority: ctx.name,
      });
    }
    return ok({ case: { ...kase, audit: auditEntries } });
  } catch (error) {
    return fail(error);
  }
}
