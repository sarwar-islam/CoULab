// Audit trail (G10) — the jury can reconstruct who did what, when, through
// which channel/provider role and on whose authority.

import { db } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { requireSession } from "@/lib/session";

export async function GET(req: Request) {
  try {
    await requireSession();
    const { searchParams } = new URL(req.url);
    const caseId = searchParams.get("caseId");
    const applicationId = searchParams.get("applicationId");
    const action = searchParams.get("action");
    const role = searchParams.get("role");
    const limit = Math.min(Number(searchParams.get("limit") ?? 100), 500);

    const where: Record<string, unknown> = {};
    if (caseId) where.caseId = caseId;
    if (applicationId) where.applicationId = applicationId;
    if (action) where.action = { contains: action };
    if (role) where.actorRole = role;

    const entries = await db.auditEntry.findMany({ where, orderBy: { createdAt: "desc" }, take: limit });
    const total = await db.auditEntry.count({ where });
    return ok({ entries, total });
  } catch (error) {
    return fail(error);
  }
}
