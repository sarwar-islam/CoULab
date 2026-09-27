// ============================================================================
// Referral & routing — A3 (Nabila's urgent tracked referral), T2 (jurisdiction
// ping-pong escalation), B6 (receiving office package + acknowledgement).
//
// Rules from the case PDF:
//  - Package: reason, history, documents, responsible actor, expected action.
//  - Acknowledgement deadline; non-acknowledgement triggers follow-up alert.
//  - T2: after two rejected/returned transfers -> ESCALATE -> authorised
//    human makes the final routing decision (system never decides jurisdiction).
// ============================================================================

import { db } from "@/lib/db";
import { ok, fail, readJson, requireFields } from "@/lib/api";
import { requireRole, requireSession, HttpError } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { JURISDICTION_RETURN_ESCALATION_THRESHOLD } from "@/lib/constants";

export async function GET(req: Request) {
  try {
    const ctx = await requireSession();
    const { searchParams } = new URL(req.url);
    const role = ctx.role;
    // B6: receiving office sees referrals addressed to their office
    const where: Record<string, unknown> = {};
    if (role === "RECEIVING_DLAO") where.toOffice = ctx.office ?? "__none__";
    const referrals = await db.referral.findMany({
      where,
      include: {
        case: {
          select: {
            id: true, caseType: true, priority: true, sensitivity: true, office: true,
            application: { select: { applicant: { select: { fullName: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return ok({ referrals });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireRole("DLAO_OFFICER", "CASE_SUPPORT", "ADMIN");
    const body = await readJson<{
      caseId: string;
      kind?: "REFERRAL" | "JURISDICTION_TRANSFER";
      toOffice: string;
      reason: string;
      historySummary: string;
      documentIds?: string[];
      responsibleActor: string;
      expectedAction: string;
      ackDays?: number;
      sensitive?: boolean;
    }>(req);
    requireFields(body as never, ["caseId", "toOffice", "reason", "historySummary", "responsibleActor", "expectedAction"]);
    const kase = await db.case.findUnique({ where: { id: body.caseId }, include: { application: { include: { applicant: true } } } });
    if (!kase) throw new HttpError(404, "CASE_NOT_FOUND");
    if (body.toOffice === kase.office) throw new HttpError(400, "INVALID_TARGET_SAME_OFFICE");

    const ackDays = body.ackDays ?? (body.kind === "JURISDICTION_TRANSFER" ? 3 : 5);
    const referral = await db.referral.create({
      data: {
        caseId: body.caseId,
        kind: body.kind ?? "REFERRAL",
        fromOffice: kase.office,
        toOffice: body.toOffice,
        reason: body.reason,
        historySummary: body.historySummary,
        documentIdsJson: JSON.stringify(body.documentIds ?? []),
        responsibleActor: body.responsibleActor,
        expectedAction: body.expectedAction,
        deadline: new Date(Date.now() + 30 * 86400_000),
        ackDeadline: new Date(Date.now() + ackDays * 86400_000),
        sensitive: body.sensitive ?? kase.sensitivity !== "NORMAL",
      },
    });
    await db.task.create({
      data: {
        caseId: body.caseId,
        title: `রেফারেল স্বীকৃতি অনুসরণ — ${body.toOffice}`,
        type: "REFERRAL_ACK",
        ownerRole: "DLAO_OFFICER",
        dueAt: new Date(Date.now() + ackDays * 86400_000),
        reason: `${ackDays} দিনের মধ্যে স্বীকৃতি না এলে অনুসরণ সতর্কতা জারি হবে`,
        sourceModule: "REFERRAL_SERVICE",
      },
    });
    await writeAudit({
      actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
      channel: "WEB",
      action: body.kind === "JURISDICTION_TRANSFER" ? "T2_JURISDICTION_TRANSFER_SENT" : "REFERRAL_SENT",
      entityType: "Referral",
      entityId: referral.id,
      caseId: body.caseId,
      after: `${kase.office} -> ${body.toOffice}`,
      onWhoseAuthority: ctx.name,
      metadata: { reason: body.reason, ackDays },
    });
    return ok({ referral }, 201);
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await requireSession();
    const body = await readJson<{
      referralId: string;
      action: "acknowledge" | "accept" | "return" | "escalate" | "route" | "complete";
      reason?: string;
      finalOffice?: string;
    }>(req);
    requireFields(body as never, ["referralId", "action"]);
    const referral = await db.referral.findUnique({ where: { id: body.referralId } });
    if (!referral) throw new HttpError(404, "NOT_FOUND");

    const actor = { userId: ctx.userId, name: ctx.name, role: ctx.role };
    const isReceiver = ctx.role === "RECEIVING_DLAO" || ctx.office === referral.toOffice || ctx.role === "ADMIN";

    switch (body.action) {
      case "acknowledge": {
        if (!isReceiver) throw new HttpError(403, "FORBIDDEN_ONLY_RECEIVER");
        await db.referral.update({ where: { id: referral.id }, data: { ackStatus: "ACKNOWLEDGED", ackAt: new Date() } });
        await db.task.updateMany({ where: { caseId: referral.caseId, type: "REFERRAL_ACK", status: { in: ["OPEN", "OVERDUE"] } }, data: { status: "DONE" } });
        await writeAudit({ actor, channel: "WEB", action: "REFERRAL_ACKNOWLEDGED", entityType: "Referral", entityId: referral.id, caseId: referral.caseId, before: referral.ackStatus, after: "ACKNOWLEDGED", onWhoseAuthority: ctx.name });
        break;
      }
      case "accept": {
        if (!isReceiver) throw new HttpError(403, "FORBIDDEN_ONLY_RECEIVER");
        if (!body.reason) throw new HttpError(400, "VALIDATION_REASON_REQUIRED");
        await db.referral.update({ where: { id: referral.id }, data: { ackStatus: "ACCEPTED", ackReason: body.reason, ackAt: referral.ackAt ?? new Date() } });
        await db.case.update({ where: { id: referral.caseId }, data: { office: referral.toOffice } }).catch(() => undefined);
        await writeAudit({ actor, channel: "WEB", action: "REFERRAL_ACCEPTED", entityType: "Referral", entityId: referral.id, caseId: referral.caseId, before: referral.ackStatus, after: "ACCEPTED", reason: body.reason, onWhoseAuthority: ctx.name });
        break;
      }
      case "return": {
        if (!isReceiver) throw new HttpError(403, "FORBIDDEN_ONLY_RECEIVER");
        if (!body.reason) throw new HttpError(400, "VALIDATION_RETURN_REASON_REQUIRED"); // T2: return reason mandatory
        const newReturnCount = referral.returnCount + 1;
        const mustEscalate = newReturnCount >= JURISDICTION_RETURN_ESCALATION_THRESHOLD;
        await db.referral.update({
          where: { id: referral.id },
          data: {
            ackStatus: "RETURNED",
            ackReason: body.reason,
            returnCount: newReturnCount,
            escalationLevel: mustEscalate ? referral.escalationLevel + 1 : referral.escalationLevel,
          },
        });
        if (mustEscalate) {
          // T2: system escalates — the human decision comes separately
          await db.task.create({
            data: {
              caseId: referral.caseId,
              title: "এখতিয়ার বিরোধ — চূড়ান্ত রাউটিং সিদ্ধান্ত প্রয়োজন (T2)",
              type: "ROUTING_DECISION",
              ownerRole: "DLAO_OFFICER",
              priority: "HIGH",
              reason: `${newReturnCount} বার ফেরত/প্রত্যাখ্যান — সিস্টেম উত্তোলন করেছে; চূড়ান্ত এখতিয়ার-সিদ্ধান্ত অনুমোদিত মানুষই নেবেন।`,
              sourceModule: "T2_ESCALATION",
            },
          });
          await db.referral.update({ where: { id: referral.id }, data: { ackStatus: "ESCALATED" } });
        }
        await writeAudit({
          actor, channel: "WEB", action: mustEscalate ? "T2_TRANSFER_RETURNED_ESCALATED" : "T2_TRANSFER_RETURNED",
          entityType: "Referral", entityId: referral.id, caseId: referral.caseId,
          before: referral.ackStatus, after: mustEscalate ? "ESCALATED" : "RETURNED",
          reason: body.reason, onWhoseAuthority: ctx.name,
          metadata: { returnCount: newReturnCount },
        });
        break;
      }
      case "escalate": {
        if (!body.reason) throw new HttpError(400, "VALIDATION_REASON_REQUIRED");
        await db.referral.update({ where: { id: referral.id }, data: { ackStatus: "ESCALATED", escalationLevel: referral.escalationLevel + 1 } });
        await db.task.create({
          data: {
            caseId: referral.caseId,
            title: "রেফারেল উত্তোলন — ঊর্ধ্বতন পর্যালোচনা",
            type: "ROUTING_DECISION",
            ownerRole: "DLAO_OFFICER",
            priority: "HIGH",
            reason: body.reason,
            sourceModule: "REFERRAL_SERVICE",
          },
        });
        await writeAudit({ actor, channel: "WEB", action: "REFERRAL_ESCALATED", entityType: "Referral", entityId: referral.id, caseId: referral.caseId, reason: body.reason, onWhoseAuthority: ctx.name });
        break;
      }
      case "route": {
        // T2 final routing decision — AUTHORISED HUMAN ONLY
        if (!["DLAO_OFFICER", "ADMIN"].includes(ctx.role)) throw new HttpError(403, "FORBIDDEN_ONLY_AUTHORISED_HUMAN");
        requireFields(body as never, ["reason", "finalOffice"]);
        await db.referral.update({
          where: { id: referral.id },
          data: { ackStatus: "ROUTED", finalRouteDecisionByUserId: ctx.userId, finalRouteDecision: `${body.finalOffice}: ${body.reason}` },
        });
        await db.case.update({ where: { id: referral.caseId }, data: { office: body.finalOffice!, jurisdiction: body.finalOffice!.includes("শ্রম") ? "LABOUR_LEGAL_AID_CELL" : "DISTRICT_DLAO" } }).catch(() => undefined);
        await db.task.updateMany({ where: { caseId: referral.caseId, type: "ROUTING_DECISION", status: { in: ["OPEN", "OVERDUE"] } }, data: { status: "DONE" } });
        await writeAudit({
          actor, channel: "WEB", action: "T2_FINAL_ROUTING_DECISION",
          entityType: "Referral", entityId: referral.id, caseId: referral.caseId,
          after: body.finalOffice!, reason: body.reason, onWhoseAuthority: ctx.name,
          metadata: { guardrail: "সিদ্ধান্তটি অনুমোদিত মানুষের — সিস্টেম শুধু উত্তোলন করেছিল" },
        });
        break;
      }
      case "complete": {
        if (!body.reason) throw new HttpError(400, "VALIDATION_REASON_REQUIRED");
        await db.referral.update({ where: { id: referral.id }, data: { ackStatus: "COMPLETED", ackReason: body.reason } });
        await writeAudit({ actor, channel: "WEB", action: "REFERRAL_COMPLETED", entityType: "Referral", entityId: referral.id, caseId: referral.caseId, after: "COMPLETED", reason: body.reason, onWhoseAuthority: ctx.name });
        break;
      }
      default:
        throw new HttpError(400, `INVALID_ACTION:${body.action}`);
    }

    // Non-acknowledgement follow-up check (failure test: receiving authority
    // does not acknowledge) — runs on every referral interaction
    const stale = await db.referral.findMany({
      where: { ackStatus: "SENT", ackDeadline: { lt: new Date() } },
      take: 20,
    });
    for (const r of stale) {
      const exists = await db.task.findFirst({
        where: { caseId: r.caseId, sourceModule: "REFERRAL_FOLLOWUP", status: { in: ["OPEN", "OVERDUE"] } },
      });
      if (!exists) {
        await db.task.create({
          data: {
            caseId: r.caseId,
            title: `স্বীকৃতি পাওয়া যায়নি — ${r.toOffice}`,
            type: "REFERRAL_ACK",
            ownerRole: "DLAO_OFFICER",
            priority: "HIGH",
            reason: `স্বীকৃতির সময়সীমা (${r.ackDeadline.toLocaleDateString("bn-BD")}) অতিক্রান্ত — অনুসরণ সতর্কতা`,
            sourceModule: "REFERRAL_FOLLOWUP",
          },
        });
        await db.notification.create({
          data: {
            caseId: r.caseId,
            targetRole: "DLAO_OFFICER",
            channel: "IN_APP",
            message: `${r.toOffice} থেকে রেফারেল স্বীকৃতি আসেনি — অনুসরণ প্রয়োজন`,
            neutralWording: true,
            relatedModule: "REFERRAL_FOLLOWUP",
          },
        });
      }
    }

    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}
