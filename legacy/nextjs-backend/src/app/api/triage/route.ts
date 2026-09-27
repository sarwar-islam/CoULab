// ============================================================================
// T8 Multi-agent triage — runs the three-component pipeline, stores the
// structured reasons/evidence, surfaces conflicts; the human decision
// (accept recommendation or override with reason) is recorded (G5).
// ============================================================================

import { db } from "@/lib/db";
import { ok, fail, readJson, requireFields } from "@/lib/api";
import { requireRole, requireSession, HttpError } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { runTriagePipeline } from "@/lib/triage";

export async function POST(req: Request) {
  try {
    const ctx = await requireRole("DLAO_OFFICER", "CASE_SUPPORT", "ADMIN");
    const body = await readJson<{ caseId: string }>(req);
    requireFields(body as never, ["caseId"]);
    const kase = await db.case.findUnique({
      where: { id: body.caseId },
      include: { application: { include: { applicant: true, documents: true } } },
    });
    if (!kase) throw new HttpError(404, "NOT_FOUND");

    // checklist-based doc completeness for the compliance agent
    const { buildChecklist } = await import("@/lib/checklist");
    const checklist = buildChecklist(kase.caseType);
    const requiredTotal = checklist.filter((c) => c.required).length;
    const activeDocs = kase.application.documents.filter((d) => d.status !== "SUPERSEDED");

    const result = runTriagePipeline({
      caseType: kase.caseType,
      narrative: kase.application.narrative,
      applicantDistrict: kase.district,
      officeDistrict: kase.office.includes(kase.district) ? kase.district : kase.district,
      requiredDocsPresent: Math.min(activeDocs.length, requiredTotal),
      requiredDocsTotal: requiredTotal,
      urgencyFlag: kase.application.urgencyFlag,
      sensitiveFlag: kase.sensitivity !== "NORMAL",
    });

    const run = await db.triageRun.create({
      data: {
        caseId: kase.id,
        categoryResultJson: JSON.stringify(result.categorisation),
        complianceResultJson: JSON.stringify(result.compliance),
        orchestrationResultJson: JSON.stringify(result.orchestration),
        conflictsDetected: result.orchestration.conflicts.length > 0,
        finalRecommendation: result.orchestration.output,
        status: "RECOMMENDED",
      },
    });
    await writeAudit({
      actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
      channel: "WEB",
      action: "T8_TRIAGE_RUN",
      entityType: "TriageRun",
      entityId: run.id,
      caseId: kase.id,
      after: result.orchestration.output,
      onWhoseAuthority: "system recommendation (human review pending)",
      metadata: { conflicts: result.orchestration.conflicts },
    });
    return ok({ run: { ...run, categoryResult: result.categorisation, complianceResult: result.compliance, orchestrationResult: result.orchestration } }, 201);
  } catch (error) {
    return fail(error);
  }
}

/** Human accepts or overrides the recommendation — authority recorded (G5). */
export async function PATCH(req: Request) {
  try {
    const ctx = await requireRole("DLAO_OFFICER", "ADMIN");
    const body = await readJson<{
      runId: string;
      decision: "ACCEPT_RECOMMENDATION" | "OVERRIDE";
      priority?: string;
      jurisdiction?: string;
      reason: string;
    }>(req);
    requireFields(body as never, ["runId", "decision", "reason"]);
    const run = await db.triageRun.findUnique({ where: { id: body.runId } });
    if (!run) throw new HttpError(404, "NOT_FOUND");

    const orchestration = JSON.parse(run.orchestrationResultJson);
    const newPriority = body.decision === "OVERRIDE" && body.priority ? body.priority : orchestration.recommendedPriority;
    const newJurisdiction = body.decision === "OVERRIDE" && body.jurisdiction ? body.jurisdiction : orchestration.recommendedJurisdiction;

    await db.triageRun.update({
      where: { id: body.runId },
      data: {
        status: body.decision === "OVERRIDE" ? "OVERRIDDEN" : "HUMAN_REVIEWED",
        decision: body.decision,
        humanDecisionByUserId: ctx.userId,
        humanDecisionReason: body.reason,
      },
    });
    if (run.caseId) {
      await db.case.update({
        where: { id: run.caseId },
        data: {
          priority: newPriority,
          priorityReason: `${body.decision === "OVERRIDE" ? "কর্মকর্তার ওভাররাইড" : "ট্রায়াজ সুপারিশ গৃহীত"}: ${body.reason}`,
          prioritySource: body.decision === "OVERRIDE" ? "OFFICER_DECISION" : "TRIAGE_RECOMMENDATION",
          jurisdiction: newJurisdiction,
        },
      });
    }
    await writeAudit({
      actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
      channel: "WEB",
      action: body.decision === "OVERRIDE" ? "T8_RECOMMENDATION_OVERRIDDEN" : "T8_RECOMMENDATION_ACCEPTED",
      entityType: "TriageRun",
      entityId: body.runId,
      caseId: run.caseId,
      reason: body.reason,
      before: run.finalRecommendation,
      after: `priority=${newPriority}, jurisdiction=${newJurisdiction}`,
      onWhoseAuthority: ctx.name,
    });
    return ok({ success: true, priority: newPriority, jurisdiction: newJurisdiction });
  } catch (error) {
    return fail(error);
  }
}

export async function GET(req: Request) {
  try {
    await requireSession();
    const { searchParams } = new URL(req.url);
    const caseId = searchParams.get("caseId");
    const runs = await db.triageRun.findMany({
      where: caseId ? { caseId } : {},
      include: { case: { select: { id: true, caseType: true, priority: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return ok({ runs });
  } catch (error) {
    return fail(error);
  }
}
