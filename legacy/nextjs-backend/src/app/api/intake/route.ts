// ============================================================================
// T5 Conversational Intake — multi-turn Bangla slot-filling with provenance,
// sensitive/ambiguous handoff to a human WITH context, and submission into
// the SAME record (G1).
// ============================================================================

import { db } from "@/lib/db";
import { ok, fail, readJson, requireFields } from "@/lib/api";
import { getSessionContext, HttpError } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { intakeTurn, slotsToApplicationFields, APPROVED_SLOTS, Slots } from "@/lib/ai/intake";
import { nextId, APP_PREFIX } from "@/lib/ids";

export async function POST(req: Request) {
  try {
    const body = await readJson<{
      action: "turn" | "handoff" | "submit";
      sessionId?: string;
      message?: string;
      channel?: string;
      language?: string;
      handoffReason?: string;
    }>(req);
    requireFields(body as never, ["action"]);
    const ctx = await getSessionContext();

    // ---- create session implicitly on first turn ----
    let session = body.sessionId ? await db.intakeSession.findUnique({ where: { id: body.sessionId } }) : null;

    if (body.action === "turn") {
      requireFields(body as never, ["message"]);
      if (!session) {
        session = await db.intakeSession.create({
          data: {
            channel: body.channel ?? "WEB_CHAT",
            language: body.language ?? "bn",
            slotsJson: "{}",
            transcriptJson: "[]",
            status: "IN_PROGRESS",
            operatorUserId: ctx?.userId ?? null,
          },
        });
      }
      const slots: Slots = JSON.parse(session.slotsJson || "{}");
      const transcript: { role: string; text: string; ts: string }[] = JSON.parse(session.transcriptJson || "[]");
      transcript.push({ role: "user", text: body.message!, ts: new Date().toISOString() });

      const turn = await intakeTurn({
        transcript: transcript.map((t) => ({ role: t.role === "user" ? "user" : "agent", text: t.text })),
        slots,
        latestUserMessage: body.message!,
      });
      transcript.push({ role: "agent", text: turn.reply, ts: new Date().toISOString() });

      const updated = await db.intakeSession.update({
        where: { id: session.id },
        data: {
          slotsJson: JSON.stringify(turn.slots),
          transcriptJson: JSON.stringify(transcript),
          status: turn.status,
          sensitiveFlag: turn.sensitiveFlag || session.sensitiveFlag,
          handoffReason: turn.handoffReason ?? session.handoffReason,
          citizenName: turn.slots.citizenName ?? session.citizenName,
        },
      });

      if (turn.handoffReason) {
        // Human handoff WITH context (T5 guardrail) — task for helpline/DLAO
        await db.task.create({
          data: {
            applicationId: null,
            title: `T5 হস্তান্তর: ${turn.slots.citizenName ?? "নাম অজানা"} — সংবেদনশীল/অস্পষ্ট কেস`,
            type: "SAFETY_REVIEW",
            ownerRole: "DLAO_OFFICER",
            priority: "HIGH",
            status: "OPEN",
            sourceModule: "T5_HUMAN_HANDOFF",
            reason: turn.handoffReason,
          },
        });
        await writeAudit({
          actor: ctx ? { userId: ctx.userId, name: ctx.name, role: ctx.role } : { name: turn.slots.citizenName ?? "নাগরিক", role: "CITIZEN" },
          channel: session.channel,
          action: "T5_HUMAN_HANDOFF",
          entityType: "IntakeSession",
          entityId: session.id,
          reason: turn.handoffReason,
          onWhoseAuthority: "T5 guardrail (system escalation to human)",
          metadata: { slots: turn.slots },
        });
      }
      return ok({
        sessionId: updated.id,
        reply: turn.reply,
        slots: turn.slots,
        newlyFilled: turn.newlyFilled,
        status: turn.status,
        sensitiveFlag: updated.sensitiveFlag,
        handoffReason: updated.handoffReason,
        aiAvailable: turn.aiAvailable,
      });
    }

    if (body.action === "handoff") {
      // Agent accepts/claims the handoff
      requireFields(body as never, ["sessionId"]);
      if (!session) throw new HttpError(404, "NOT_FOUND");
      await db.intakeSession.update({
        where: { id: session.id },
        data: { status: "HUMAN_HANDOFF", operatorUserId: ctx?.userId ?? null },
      });
      await writeAudit({
        actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
        channel: session.channel,
        action: "T5_HANDOFF_ACCEPTED_BY_HUMAN",
        entityType: "IntakeSession",
        entityId: session.id,
        onWhoseAuthority: ctx.name,
      });
      return ok({ success: true });
    }

    // submit → create Application on the SAME record (B3: "writes to the same
    // record rather than a separate note")
    requireFields(body as never, ["sessionId"]);
    if (!session) throw new HttpError(404, "NOT_FOUND");
    const slots: Slots = JSON.parse(session.slotsJson || "{}");
    const missing = APPROVED_SLOTS.filter((s) => !slots[s]);
    if (missing.length > 0) {
      throw new HttpError(400, `VALIDATION_SLOTS_INCOMPLETE:${missing.join(",")}`);
    }
    const fields = slotsToApplicationFields(slots);
    const channel = session.channel === "VOICE" ? "VOICE_IVR" : session.channel === "UDC" ? "ASSISTED_UDC" : "HELPLINE";
    const applicationId = await nextId(APP_PREFIX);

    const applicant = await db.applicant.create({
      data: {
        fullName: fields.applicantName,
        district: fields.district,
        primaryPhone: fields.contactNumber,
      },
    });
    const application = await db.application.create({
      data: {
        id: applicationId,
        applicantId: applicant.id,
        channel,
        status: "SUBMITTED",
        caseType: fields.caseType,
        narrative: fields.narrative,
        district: fields.district,
        office: `জেলা আইনি সহায়তা কার্যালয়, ${fields.district}`,
        sensitiveFlag: session.sensitiveFlag,
        urgencyFlag: session.sensitiveFlag,
        helplineOperatorUserId: session.operatorUserId,
        intakeSessionId: session.id,
        freeServiceNoticeShown: true,
      },
    });
    await db.recordEntry.create({
      data: {
        applicationId: application.id,
        provenance: session.sensitiveFlag ? "APPLICANT_CONFIRMED" : "APPLICANT_CONFIRMED",
        text: fields.narrative,
        language: session.language,
        statedByName: fields.applicantName,
        statedByRole: "APPLICANT",
        recordedByUserId: session.operatorUserId,
        channel,
        kind: "STATEMENT",
      },
    });
    await db.intakeSession.update({
      where: { id: session.id },
      data: { status: "CONVERTED", applicationId: application.id },
    });
    await db.task.create({
      data: {
        applicationId: application.id,
        title: `নতুন আবেদন পর্যালোচনা — ${applicationId}`,
        type: "REVIEW",
        ownerRole: "DLAO_OFFICER",
        priority: session.sensitiveFlag ? "HIGH" : "MEDIUM",
        reason: session.sensitiveFlag ? "T5 হস্তান্তর: সংবেদনশীল সংকেত" : "নতুন আবেদন",
        sourceModule: "T5",
      },
    });
    await writeAudit({
      actor: { userId: ctx?.userId, name: ctx?.name ?? fields.applicantName, role: ctx?.role ?? "CITIZEN" },
      channel,
      action: "T5_INTAKE_CONVERTED_TO_APPLICATION",
      entityType: "Application",
      entityId: application.id,
      applicationId: application.id,
      after: "SUBMITTED",
      onWhoseAuthority: fields.applicantName,
      metadata: { sessionId: session.id, aiSlots: slots },
    });
    return ok({ applicationId: application.id }, 201);
  } catch (error) {
    return fail(error);
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (id) {
      const session = await db.intakeSession.findUnique({ where: { id } });
      if (!session) throw new HttpError(404, "NOT_FOUND");
      return ok({ session });
    }
    const sessions = await db.intakeSession.findMany({
      where: { status: { in: ["HUMAN_HANDOFF", "IN_PROGRESS", "AWAITING_CONFIRMATION"] } },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    return ok({ sessions });
  } catch (error) {
    return fail(error);
  }
}
