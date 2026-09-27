// ============================================================================
// T4 Duplicate detection — fuzzy matching + confidence/evidence display +
// side-by-side HUMAN review. GUARDRAIL: never auto-reject, auto-merge, or
// label a person fraudulent.
// ============================================================================

import { db } from "@/lib/db";
import { ok, fail, readJson, requireFields } from "@/lib/api";
import { requireRole, requireSession, HttpError } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { compareApplicants, DUPLICATE_REVIEW_THRESHOLD } from "@/lib/duplicate";

export async function POST(req: Request) {
  try {
    const ctx = await requireRole("DLAO_OFFICER", "CASE_SUPPORT", "ADMIN");
    const body = await readJson<{ scanAll?: boolean }>(req);

    const applications = await db.application.findMany({
      where: body.scanAll === false ? { status: "SUBMITTED" } : {},
      include: { applicant: true },
      orderBy: { createdAt: "desc" },
      take: 60,
    });

    let created = 0;
    for (let i = 0; i < applications.length; i++) {
      for (let j = i + 1; j < applications.length; j++) {
        const a = applications[i];
        const b = applications[j];
        const existing = await db.duplicateCandidate.findFirst({
          where: {
            OR: [
              { applicationAId: a.id, applicationBId: b.id },
              { applicationAId: b.id, applicationBId: a.id },
            ],
          },
        });
        if (existing) continue;
        const { score, matchedFields } = compareApplicants(
          { id: a.id, fullName: a.applicant.fullName, district: a.district, primaryPhone: a.applicant.primaryPhone, nidRef: a.applicant.nidRef },
          { id: b.id, fullName: b.applicant.fullName, district: b.district, primaryPhone: b.applicant.primaryPhone, nidRef: b.applicant.nidRef },
        );
        if (score >= DUPLICATE_REVIEW_THRESHOLD) {
          await db.duplicateCandidate.create({
            data: { applicationAId: a.id, applicationBId: b.id, score, matchedFieldsJson: JSON.stringify(matchedFields) },
          });
          created++;
        }
      }
    }
    await writeAudit({
      actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
      channel: "WEB",
      action: "T4_DUPLICATE_SCAN",
      entityType: "DuplicateCandidate",
      entityId: `scan-${Date.now()}`,
      after: `${created} নতুন সম্ভাব্য ডুপ্লিকেট প্রার্থী (মানব-পর্যালোচনা অপেক্ষমাণ)`,
      onWhoseAuthority: "system scan (no auto-action)",
    });
    return ok({ created, threshold: DUPLICATE_REVIEW_THRESHOLD });
  } catch (error) {
    return fail(error);
  }
}

export async function GET() {
  try {
    await requireSession();
    const candidates = await db.duplicateCandidate.findMany({
      include: {
        applicationA: { include: { applicant: true } },
        applicationB: { include: { applicant: true } },
      },
      orderBy: [{ status: "asc" }, { score: "desc" }],
      take: 100,
    });
    return ok({ candidates });
  } catch (error) {
    return fail(error);
  }
}

/** Human side-by-side decision — every decision recorded with reviewer. */
export async function PATCH(req: Request) {
  try {
    const ctx = await requireRole("DLAO_OFFICER", "CASE_SUPPORT", "ADMIN");
    const body = await readJson<{ candidateId: string; decision: "CONFIRMED_DUPLICATE" | "NOT_A_DUPLICATE"; reviewNotes: string }>(req);
    requireFields(body as never, ["candidateId", "decision", "reviewNotes"]);
    const candidate = await db.duplicateCandidate.findUnique({ where: { id: body.candidateId } });
    if (!candidate) throw new HttpError(404, "NOT_FOUND");

    await db.duplicateCandidate.update({
      where: { id: body.candidateId },
      data: {
        status: body.decision,
        reviewedByUserId: ctx.userId,
        reviewNotes: body.reviewNotes,
        decidedAt: new Date(),
      },
    });
    await writeAudit({
      actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
      channel: "WEB",
      action: `T4_DUPLICATE_${body.decision}`,
      entityType: "DuplicateCandidate",
      entityId: body.candidateId,
      applicationId: candidate.applicationAId,
      before: "PENDING",
      after: body.decision,
      reason: body.reviewNotes,
      onWhoseAuthority: ctx.name,
    });
    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}
