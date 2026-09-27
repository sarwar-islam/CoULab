// ============================================================================
// Applications — created at submission through ANY door (CHANNEL RULE: a
// channel is an interface, not a separate case-management system).
// Every creation path writes: Applicant, Application, RecordEntry(s) with
// provenance, Consent (if assisted), free-service notice flag, and audit.
// ============================================================================

import { db } from "@/lib/db";
import { ok, fail, readJson, requireFields } from "@/lib/api";
import { requireRole, requireSession, getSessionContext, HttpError } from "@/lib/session";
import { nextId, APP_PREFIX } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import { CHANNEL_LIST, CASE_TYPE_IDS, PROVENANCE_LIST } from "@/lib/constants";

export async function GET(req: Request) {
  try {
    const ctx = await requireSession();
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim();
    const status = url.searchParams.get("status")?.trim();

    // Role-based privacy (G9): each role sees what it needs — no more.
    let where: Record<string, unknown> = {};
    if (ctx.role === "CITIZEN" || ctx.role === "REPRESENTATIVE") {
      where = { id: ctx.citizenApplicationId ?? "__none__" };
    } else if (ctx.role === "RECEIVING_DLAO") {
      // sees applications of cases referred to their office (via cases)
      where = { cases: { some: { referrals: { some: { toOffice: ctx.office ?? "__none__" } } } } };
    }

    if (status) where.status = status;
    if (q) {
      where.OR = [
        { id: { contains: q } },
        { narrative: { contains: q } },
        { applicant: { is: { fullName: { contains: q } } } },
      ];
    }

    const applications = await db.application.findMany({
      where,
      include: { applicant: true, cases: { select: { id: true, status: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return ok({ applications });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getSessionContext();
    const body = await readJson<{
      channel: string;
      caseType: string;
      narrative: string;
      district: string;
      applicantName: string;
      applicantPhone?: string;
      applicantNidRef?: string;
      upazila?: string;
      urgencyFlag?: boolean;
      sensitiveFlag?: boolean;
      language?: string;
      // provenance
      provenance: string;
      originalText?: string; // e.g. what was said in Marma before translation
      statedByName?: string; // who actually spoke
      // assisted intake (B4/A4)
      assistedByUserId?: string;
      assistedScope?: string;
      representativeUserId?: string;
      representativeName?: string;
      representativeRelationship?: string;
      consentScope?: string;
      contactNote?: string; // "number belongs to UDC entrepreneur"
      contactIsApplicantOwn?: boolean;
      helplineOperatorUserId?: string;
      intakeSessionId?: string;
      tempUuid?: string; // T9 offline sync dedup
      deviceId?: string;
    }>(req);

    requireFields(body as never, ["channel", "caseType", "narrative", "district", "applicantName", "provenance"]);
    if (!CHANNEL_LIST.includes(body.channel)) throw new HttpError(400, `INVALID_CHANNEL:${body.channel}`);
    if (!CASE_TYPE_IDS.includes(body.caseType as never)) throw new HttpError(400, `INVALID_CASE_TYPE:${body.caseType}`);
    if (!PROVENANCE_LIST.includes(body.provenance)) throw new HttpError(400, `INVALID_PROVENANCE:${body.provenance}`);

    // T9 idempotency: the same tempUuid can never create two applications
    if (body.tempUuid) {
      const existing = await db.offlineSyncRecord.findUnique({ where: { tempUuid: body.tempUuid } });
      if (existing) {
        return ok({ applicationId: existing.syncedEntityId, duplicateOfTempUuid: body.tempUuid, alreadySynced: true }, 200);
      }
    }

    const actor = ctx
      ? { userId: ctx.userId, name: ctx.name, role: ctx.role }
      : { name: "নাগরিক (অথেন্টিকেটেড দরজা)", role: "CITIZEN" };

    // UDC assisted intake: consent + free-service notice + bounded contact are mandatory
    const isAssisted = body.channel === "ASSISTED_UDC";
    if (isAssisted) {
      requireFields(body as never, ["assistedByUserId", "consentScope"]);
    }

    const applicationId = await nextId(APP_PREFIX);
    const office = `জেলা আইনি সহায়তা কার্যালয়, ${body.district}`;

    const application = await db.$transaction(async (tx) => {
      const applicant = await tx.applicant.create({
        data: {
          fullName: body.applicantName,
          district: body.district,
          upazila: body.upazila ?? null,
          nidRef: body.applicantNidRef ?? null,
          primaryPhone: body.applicantPhone ?? null,
          contactNote: body.contactNote ?? null,
        },
      });

      const app = await tx.application.create({
        data: {
          id: applicationId,
          applicantId: applicant.id,
          channel: body.channel,
          status: "SUBMITTED",
          caseType: body.caseType,
          narrative: body.narrative,
          district: body.district,
          office,
          language: body.language ?? "bn",
          urgencyFlag: body.urgencyFlag ?? false,
          sensitiveFlag: body.sensitiveFlag ?? false,
          freeServiceNoticeShown: isAssisted || body.channel === "HELPLINE",
          assistedByUserId: body.assistedByUserId ?? null,
          helplineOperatorUserId: body.helplineOperatorUserId ?? null,
          intakeSessionId: body.intakeSessionId ?? null,
        },
      });

      // Provenance-tagged record entry (G2)
      await tx.recordEntry.create({
        data: {
          applicationId: app.id,
          provenance: body.provenance,
          text: body.narrative,
          originalText: body.originalText ?? null,
          language: body.language ?? "bn",
          statedByName: body.statedByName ?? body.applicantName,
          statedByRole:
            body.provenance === "APPLICANT_CONFIRMED"
              ? "APPLICANT"
              : body.provenance === "REPRESENTATIVE_REPORTED"
                ? "REPRESENTATIVE"
                : body.provenance === "INTERMEDIARY_TRANSLATED"
                  ? "INTERMEDIARY"
                  : body.provenance === "AI_INFERRED"
                    ? "AI"
                    : "STAFF",
          recordedByUserId: ctx?.userId ?? null,
          channel: body.channel,
          kind: "STATEMENT",
        },
      });

      // Consent for assisted / representative intake (A2/A4/B4)
      if (isAssisted || body.representativeUserId) {
        await tx.consent.create({
          data: {
            applicationId: app.id,
            scope: isAssisted ? "ASSISTED_INTAKE" : "REPRESENTATION",
            scopeDetail:
              body.consentScope ??
              (isAssisted
                ? "ইউডিসি উদ্যোক্তা আবেদনপত্র পূরণ ও নথি তুলতে সহায়তা করেছেন; নম্বরটি তাঁর — পরবর্তী যোগাযোগ সীমিত প্রবেশাধিকারে"
                : "প্রতিনিধি আবেদন জানানোর ক্ষেত্রে নির্দিষ্ট পরিসরে প্রতিনিধিত্ব করবেন"),
            authorityStatus: "ACTIVE",
            grantedByApplicantId: applicant.id,
            representativeUserId: body.representativeUserId ?? body.assistedByUserId ?? null,
            representativeName: body.representativeName ?? "ইউডিসি উদ্যোক্তা",
            relationship: body.representativeRelationship ?? "সহায়তাকারী",
            channel: body.channel,
            recordedByUserId: ctx?.userId ?? null,
          },
        });
      }
      return app;
    });

    // T9 offline sync record (queued → synced)
    if (body.tempUuid) {
      await db.offlineSyncRecord.create({
        data: {
          tempUuid: body.tempUuid,
          deviceId: body.deviceId ?? "unknown-device",
          payloadType: "APPLICATION",
          payloadJson: JSON.stringify(body),
          integrityHash: "n/a-client-hash",
          status: "SYNCED",
          syncedAt: new Date(),
          syncedEntityId: application.id,
        },
      }).catch(() => undefined);
    }

    await writeAudit({
      actor,
      channel: body.channel,
      action: "APPLICATION_SUBMITTED",
      entityType: "Application",
      entityId: application.id,
      applicationId: application.id,
      after: "SUBMITTED",
      onWhoseAuthority: isAssisted ? `${body.applicantName} (ইউডিসি সহায়তায়)` : body.applicantName,
      metadata: { provenance: body.provenance, assisted: isAssisted, tempUuid: body.tempUuid ?? null },
    });

    // Review task for the office (B1 queue)
    await db.task.create({
      data: {
        applicationId: application.id,
        title: `নতুন আবেদন পর্যালোচনা — ${applicationId}`,
        type: "REVIEW",
        ownerRole: "DLAO_OFFICER",
        priority: body.urgencyFlag || body.sensitiveFlag ? "HIGH" : "MEDIUM",
        reason: body.urgencyFlag ? "জরুরি পতাকা সহ আবেদন" : "নতুন আবেদন — যোগ্যতা ও নথি যাচাই প্রয়োজন",
        sourceModule: body.channel,
      },
    });

    return ok({ applicationId: application.id }, 201);
  } catch (error) {
    return fail(error);
  }
}
