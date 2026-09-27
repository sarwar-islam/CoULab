// ============================================================================
// B2 Mediation workflow — registration -> scheduling/notices -> attendance/
// documents -> mediation -> outcome. Remote/hybrid where legally and
// practically appropriate; in-person fallback retained.
// ============================================================================

import { db } from "@/lib/db";
import { ok, fail, readJson, requireFields } from "@/lib/api";
import { requireRole, requireSession, HttpError } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { MEDIATION_MODES } from "@/lib/constants";

export async function GET(req: Request) {
  try {
    const ctx = await requireSession();
    const { searchParams } = new URL(req.url);
    const caseId = searchParams.get("caseId");
    const sessions = await db.mediationSession.findMany({
      where: {
        ...(caseId ? { caseId } : {}),
        ...(ctx.role === "MEDIATOR" ? {} : {}),
      },
      include: { case: { select: { id: true, caseType: true, application: { select: { applicant: { select: { fullName: true } } } } } } },
      orderBy: { scheduledAt: "desc" },
      take: 100,
    });
    return ok({ sessions });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireRole("MEDIATOR", "DLAO_OFFICER", "ADMIN");
    const body = await readJson<{
      caseId: string;
      scheduledAt: string;
      mode: string;
      locationOrLink?: string;
      partyAName: string;
      partyBName: string;
    }>(req);
    requireFields(body as never, ["caseId", "scheduledAt", "mode", "partyAName", "partyBName"]);
    if (!MEDIATION_MODES.includes(body.mode as never)) throw new HttpError(400, `INVALID_MODE:${body.mode}`);
    if (body.mode !== "IN_PERSON" && !body.locationOrLink) {
      throw new HttpError(400, "VALIDATION_REMOTE_REQUIRES_LINK_OR_LOCATION");
    }
    const session = await db.mediationSession.create({
      data: {
        caseId: body.caseId,
        mediatorUserId: ctx.userId ?? "unknown",
        scheduledAt: new Date(body.scheduledAt),
        mode: body.mode,
        locationOrLink: body.locationOrLink ?? "জেলা আইনি সহায়তা কার্যালয়",
        partyAName: body.partyAName,
        partyBName: body.partyBName,
        inPersonFallbackReason:
          body.mode === "IN_PERSON"
            ? null
            : "প্রযুক্তিগত ব্যর্থতা/পক্ষের অনিচ্ছা হলে সশরীরে উপস্থিতির বিকল্প সংরক্ষিত (B2)",
      },
    });
    await db.case.update({ where: { id: body.caseId }, data: { status: "IN_MEDIATION" } }).catch(() => undefined);
    await writeAudit({
      actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
      channel: "WEB",
      action: "MEDIATION_SCHEDULED",
      entityType: "MediationSession",
      entityId: session.id,
      caseId: body.caseId,
      after: `${body.mode} @ ${body.scheduledAt}`,
      onWhoseAuthority: ctx.name,
    });
    return ok({ session }, 201);
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await requireRole("MEDIATOR", "ADMIN");
    const body = await readJson<{
      sessionId: string;
      action: "send_notices" | "record_attendance" | "record_outcome" | "fallback_in_person" | "reschedule";
      attendance?: { partyA?: string; partyB?: string };
      outcome?: string;
      outcomeDetails?: string;
      fallbackReason?: string;
      newDate?: string;
    }>(req);
    requireFields(body as never, ["sessionId", "action"]);
    const session = await db.mediationSession.findUnique({ where: { id: body.sessionId } });
    if (!session) throw new HttpError(404, "NOT_FOUND");
    const actor = { userId: ctx.userId, name: ctx.name, role: ctx.role };

    switch (body.action) {
      case "send_notices": {
        const notices = [
          { party: session.partyAName, channel: "SMS", sentAt: new Date().toISOString(), ack: false },
          { party: session.partyBName, channel: "SMS", sentAt: new Date().toISOString(), ack: false },
        ];
        await db.mediationSession.update({ where: { id: session.id }, data: { status: "NOTICES_SENT", noticesJson: JSON.stringify(notices) } });
        await db.notification.create({
          data: { caseId: session.caseId, channel: "SMS", message: "মধ্যস্থতার তারিখ নির্ধারিত হয়েছে। বিস্তারিত কার্যালয়ে যোগাযোগ করুন।", neutralWording: true, relatedModule: "B2" },
        });
        await writeAudit({ actor, channel: "WEB", action: "MEDIATION_NOTICES_SENT", entityType: "MediationSession", entityId: session.id, caseId: session.caseId, onWhoseAuthority: ctx.name });
        break;
      }
      case "record_attendance": {
        if (!body.attendance) throw new HttpError(400, "VALIDATION_ATTENDANCE_REQUIRED");
        const attendance = {
          partyA: body.attendance.partyA ?? "PRESENT",
          partyB: body.attendance.partyB ?? "PRESENT",
        };
        await db.mediationSession.update({
          where: { id: session.id },
          data: { attendanceJson: JSON.stringify(attendance), status: "ATTENDED" },
        });
        await writeAudit({ actor, channel: "WEB", action: "MEDIATION_ATTENDANCE_RECORDED", entityType: "MediationSession", entityId: session.id, caseId: session.caseId, after: JSON.stringify(attendance), onWhoseAuthority: ctx.name });
        break;
      }
      case "record_outcome": {
        if (!body.outcome) throw new HttpError(400, "VALIDATION_OUTCOME_REQUIRED");
        // HUMAN AUTHORITY: mediation outcome decided by the mediator
        await db.mediationSession.update({
          where: { id: session.id },
          data: { outcome: body.outcome, outcomeDetails: body.outcomeDetails, status: "COMPLETED" },
        });
        await writeAudit({
          actor, channel: "WEB", action: "MEDIATION_OUTCOME_RECORDED",
          entityType: "MediationSession", entityId: session.id, caseId: session.caseId,
          after: body.outcome, reason: body.outcomeDetails, onWhoseAuthority: `${ctx.name} (মধ্যস্থতাকারী — মানব-সিদ্ধান্ত)`,
        });
        break;
      }
      case "fallback_in_person": {
        requireFields(body as never, ["fallbackReason"]);
        await db.mediationSession.update({
          where: { id: session.id },
          data: { mode: "IN_PERSON", status: "FALLBACK_IN_PERSON", inPersonFallbackReason: body.fallbackReason },
        });
        await writeAudit({ actor, channel: "WEB", action: "MEDIATION_FALLBACK_TO_IN_PERSON", entityType: "MediationSession", entityId: session.id, caseId: session.caseId, reason: body.fallbackReason, onWhoseAuthority: ctx.name });
        break;
      }
      case "reschedule": {
        requireFields(body as never, ["newDate"]);
        await db.mediationSession.update({
          where: { id: session.id },
          data: { scheduledAt: new Date(body.newDate!), status: "RESCHEDULED" },
        });
        await writeAudit({ actor, channel: "WEB", action: "MEDIATION_RESCHEDULED", entityType: "MediationSession", entityId: session.id, caseId: session.caseId, after: body.newDate!, onWhoseAuthority: ctx.name });
        break;
      }
      default:
        throw new HttpError(400, `INVALID_ACTION:${body.action}`);
    }
    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}
