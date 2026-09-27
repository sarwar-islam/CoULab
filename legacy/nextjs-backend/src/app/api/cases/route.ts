// ============================================================================
// Cases — the ONE authoritative record. Role-filtered list (B1 unified
// operational view) with reasons for every flag; final prioritisation remains
// with the officer (G5).
// ============================================================================

import { db } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { requireSession, HttpError } from "@/lib/session";

export async function GET(req: Request) {
  try {
    const ctx = await requireSession();
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim();
    const status = url.searchParams.get("status")?.trim();

    let office: string | undefined;
    if (ctx.role === "RECEIVING_DLAO") office = ctx.office ?? undefined;
    if (ctx.role === "CITIZEN" || ctx.role === "REPRESENTATIVE") {
      throw new HttpError(403, "CITIZEN_USE_STATUS_DOOR");
    }

    const where: Record<string, unknown> = {};
    if (office) where.office = office;
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { id: { contains: q } },
        { caseType: { contains: q } },
        { application: { is: { applicant: { is: { fullName: { contains: q } } } } } },
      ];
    }

    const cases = await db.case.findMany({
      where,
      include: {
        application: { include: { applicant: true } },
        tasks: { where: { status: { in: ["OPEN", "OVERDUE", "IN_PROGRESS"] } }, orderBy: { dueAt: "asc" } },
        hearings: { orderBy: { hearingDate: "asc" } },
        referrals: true,
        lawyerAssignments: { include: { updates: { orderBy: { submittedAt: "desc" }, take: 1 } } },
        // metadata only — raw content is served via the detail route (least exposure)
        documents: { select: { id: true, title: true, docType: true, status: true, sensitivity: true, version: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });

    // Enrich with per-case flag reasons (B1: "with reasons for every flag")
    const now = Date.now();
    const enriched = cases.map((k) => {
      const flags: { type: string; reason: string }[] = [];
      if (k.sensitivity !== "NORMAL") flags.push({ type: "SENSITIVE", reason: "সংবেদনশীল উপাদান — সীমিত প্রবেশাধিকার" });
      const overdueTasks = k.tasks.filter((t) => (t.dueAt && t.dueAt.getTime() < now) || t.status === "OVERDUE");
      if (overdueTasks.length > 0) {
        flags.push({ type: "OVERDUE", reason: `${overdueTasks.length}টি কার্য সময়সীমা অতিক্রান্ত — ${overdueTasks[0].title}` });
      }
      if (k.priority === "URGENT") flags.push({ type: "PRIORITY", reason: k.priorityReason ?? "জরুরি অগ্রাধিকার চিহ্নিত" });
      const unackRef = k.referrals.find((r) => r.ackStatus === "SENT" && r.ackDeadline < new Date());
      if (unackRef) flags.push({ type: "REFERRAL_NO_ACK", reason: `রেফারেল স্বীকৃতি সময়সীমা অতিক্রান্ত (${unackRef.toOffice})` });
      const lawyerStale = k.lawyerAssignments.find(
        (la) => la.status === "ACCEPTED" && la.lastUpdateAt && now - la.lastUpdateAt.getTime() > 30 * 86400_000,
      );
      if (lawyerStale) flags.push({ type: "LAWYER_INACTIVE", reason: "প্যানেল আইনজীবী ৩০+ দিন হালনাগাদ দেননি" });
      const upcomingHearing = k.hearings.find((h) => h.status === "SCHEDULED" && h.hearingDate.getTime() - now < 7 * 86400_000);
      if (upcomingHearing) flags.push({ type: "HEARING_SOON", reason: "৭ দিনের মধ্যে হিয়ারিং" });
      const ageDays = Math.floor((now - k.createdAt.getTime()) / 86400_000);
      if (ageDays > 180) flags.push({ type: "AGEING", reason: `মামলার বয়স ${ageDays} দিন` });
      return { ...k, ageDays, flags, openTaskCount: k.tasks.length };
    });

    return ok({ cases: enriched });
  } catch (error) {
    return fail(error);
  }
}
