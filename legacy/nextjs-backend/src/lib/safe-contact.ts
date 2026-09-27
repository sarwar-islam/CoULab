import { db } from "@/lib/db";
import { ROLES } from "@/lib/constants";

export interface ContactEvaluation {
  allowed: boolean;
  outcome: "COMPLETED" | "BLOCKED_UNSAFE" | "OUTSIDE_WINDOW" | "NO_ANSWER" | "FAILED";
  reason: string;
}

function withinWindow(windowSpec: string | null, now: Date): boolean {
  if (!windowSpec) return true;
  const [from, to] = windowSpec.split("-").map((s) => s.trim());
  if (!from || !to) return true;
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= fh * 60 + (fm || 0) && minutes <= th * 60 + (tm || 0);
}

/**
 * G3 / A1 safe-contact enforcement.
 * An outbound (or inbound callback) contact attempt is evaluated against the
 * case's ContactRule BEFORE any call is placed. Blocked attempts are never
 * silent: the outcome and reason are returned to the caller module, which
 * must log a ContactAttempt and an AuditEntry.
 */
export async function evaluateContact(
  caseId: string,
  targetNumber: string,
  at: Date = new Date(),
): Promise<ContactEvaluation> {
  const rule = await db.contactRule.findFirst({
    where: { caseId, active: true },
    orderBy: { createdAt: "desc" },
  });
  if (!rule) {
    return { allowed: true, outcome: "COMPLETED", reason: "কোনো বিশেষ যোগাযোগ নিয়ম নেই" };
  }
  const blocked: string[] = JSON.parse(rule.blockedNumbers || "[]");
  if (rule.mode === "BLOCK_ALL") {
    return { allowed: false, outcome: "BLOCKED_UNSAFE", reason: rule.reason };
  }
  if (rule.mode === "BLOCK_NUMBERS" && blocked.includes(targetNumber)) {
    return { allowed: false, outcome: "BLOCKED_UNSAFE", reason: rule.reason };
  }
  if (rule.mode === "ALLOW_ONLY") {
    if (targetNumber !== rule.safeNumber) {
      return { allowed: false, outcome: "BLOCKED_UNSAFE", reason: rule.reason };
    }
    if (!withinWindow(rule.safeTimeWindow, at)) {
      return {
        allowed: false,
        outcome: "OUTSIDE_WINDOW",
        reason: `নিরাপদ সময়সীমা ${rule.safeTimeWindow ?? "-"} এর বাইরে`,
      };
    }
  }
  return { allowed: true, outcome: "COMPLETED", reason: "নিরাপদ যোগাযোগ নিয়ম মেনে অনুমোদিত" };
}

/**
 * Log a contact attempt (A5: failed contact attempts are logged) and notify
 * the case owner when an unsafe caller answers (A1 failure test).
 */
export async function logContactAttempt(params: {
  caseId: string;
  attemptedNumber: string;
  attemptType: string;
  claimedIdentity?: string;
  evaluation: ContactEvaluation;
  notes?: string;
  actor?: { userId?: string; name: string; role: string };
}) {
  const attempt = await db.contactAttempt.create({
    data: {
      caseId: params.caseId,
      attemptedNumber: params.attemptedNumber,
      attemptType: params.attemptType,
      claimedIdentity: params.claimedIdentity ?? null,
      outcome: params.evaluation.outcome,
      notes: params.notes ?? params.evaluation.reason,
      attemptedByUserId: params.actor?.userId ?? null,
    },
  });
  if (params.evaluation.outcome === "BLOCKED_UNSAFE") {
    await db.notification.create({
      data: {
        caseId: params.caseId,
        targetRole: ROLES.DLAO_OFFICER,
        channel: "IN_APP",
        message: `অনিরাপদ যোগাযোগ প্রতিহত করা হয়েছে (${params.attemptedNumber}) — কারণ: ${params.evaluation.reason}`,
        neutralWording: true,
        relatedModule: "SAFE_CONTACT",
      },
    });
  }
  return attempt;
}
