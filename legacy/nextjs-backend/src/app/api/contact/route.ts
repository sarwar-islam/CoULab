// ============================================================================
// Safe contact (G3): set/update ContactRule (blocked with recorded reason) and
// evaluate + log contact attempts (A1 failure test: unsafe person answers;
// A5: failed contact attempts are logged).
// ============================================================================

import { db } from "@/lib/db";
import { ok, fail, readJson, requireFields } from "@/lib/api";
import { requireRole, requireSession, HttpError } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { evaluateContact, logContactAttempt } from "@/lib/safe-contact";

export async function POST(req: Request) {
  try {
    const body = await readJson<{
      action: "set_rule" | "attempt";
      caseId: string;
      // set_rule
      mode?: "ALLOW_ONLY" | "BLOCK_NUMBERS" | "BLOCK_ALL";
      safeNumber?: string;
      safeTimeWindow?: string;
      blockedNumbers?: string[];
      neutralWording?: boolean;
      reason?: string;
      // attempt
      attemptedNumber?: string;
      attemptType?: string;
      claimedIdentity?: string;
      notes?: string;
    }>(req);
    requireFields(body as never, ["action", "caseId"]);
    const ctx = await requireSession();
    const actor = { userId: ctx.userId, name: ctx.name, role: ctx.role };

    if (body.action === "set_rule") {
      await requireRole("DLAO_OFFICER", "CASE_SUPPORT", "ADMIN");
      requireFields(body as never, ["mode", "reason"]);
      const rule = await db.contactRule.create({
        data: {
          caseId: body.caseId,
          mode: body.mode!,
          safeNumber: body.safeNumber ?? null,
          safeTimeWindow: body.safeTimeWindow ?? null,
          blockedNumbers: JSON.stringify(body.blockedNumbers ?? []),
          neutralWording: body.neutralWording ?? true,
          reason: body.reason!,
          createdByUserId: ctx.userId ?? "unknown",
        },
      });
      await db.case.update({ where: { id: body.caseId }, data: { sensitivity: "SENSITIVE" } }).catch(() => undefined);
      await writeAudit({
        actor, channel: "WEB", action: "CONTACT_RULE_SET", entityType: "ContactRule", entityId: rule.id,
        caseId: body.caseId, reason: body.reason, onWhoseAuthority: ctx.name,
        after: `${body.mode} ${body.safeNumber ?? ""} ${body.safeTimeWindow ?? ""}`,
      });
      return ok({ rule }, 201);
    }

    // attempt — evaluate BEFORE the call; blocked attempts are logged, never silent
    requireFields(body as never, ["attemptedNumber", "attemptType"]);
    const evaluation = await evaluateContact(body.caseId, body.attemptedNumber!);
    const attempt = await logContactAttempt({
      caseId: body.caseId,
      attemptedNumber: body.attemptedNumber!,
      attemptType: body.attemptType!,
      claimedIdentity: body.claimedIdentity,
      evaluation,
      notes: body.notes,
      actor,
    });
    await writeAudit({
      actor, channel: body.attemptType ?? "IVR", action: "CONTACT_ATTEMPT",
      entityType: "ContactAttempt", entityId: attempt.id, caseId: body.caseId,
      after: evaluation.outcome, reason: evaluation.reason,
      onWhoseAuthority: evaluation.allowed ? ctx.name : "ContactRule (নিরাপদ যোগাযোগ নিয়ম)",
    });
    return ok({ attempt, evaluation }, 201);
  } catch (error) {
    return fail(error);
  }
}

export async function GET(req: Request) {
  try {
    await requireSession();
    const { searchParams } = new URL(req.url);
    const caseId = searchParams.get("caseId");
    if (!caseId) throw new HttpError(400, "VALIDATION_CASEID_REQUIRED");
    const rules = await db.contactRule.findMany({ where: { caseId }, orderBy: { createdAt: "desc" } });
    const attempts = await db.contactAttempt.findMany({ where: { caseId }, orderBy: { createdAt: "desc" }, take: 50 });
    return ok({ rules, attempts });
  } catch (error) {
    return fail(error);
  }
}
