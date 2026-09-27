// ============================================================================
// Status door — one endpoint for ALL low-tech doors (IVR, USSD, web status).
// Returns Bangla, screenless-friendly status + next step; neutral wording
// enforced when a ContactRule demands it (G3/A1).
// Also accepts citizen actions: correction request, lawyer-change request.
// ============================================================================

import { db } from "@/lib/db";
import { ok, fail, readJson, requireFields } from "@/lib/api";
import { requireSession, HttpError } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

function statusTextBn(status: string, caseType: string): { headline: string; nextStep: string } {
  switch (status) {
    case "SUBMITTED":
      return { headline: "আবেদন জমা হয়েছে", nextStep: "কার্যালয় আপনার আবেদন যাচাই করবে। সাধারণত কয়েকদিনের মধ্যে প্রাথমিক পর্যালোচনা সম্পন্ন হয়।" };
    case "UNDER_REVIEW":
      return { headline: "যাচাই-পর্যালোচনা চলছে", nextStep: "কর্মকর্তা আপনার তথ্য ও নথি পরীক্ষা করছেন। প্রয়োজনে কার্যালয় যোগাযোগ করবে।" };
    case "MORE_INFO_NEEDED":
      return { headline: "অতিরিক্ত তথ্য প্রয়োজন", nextStep: "কার্যালয়ে যোগাযোগ করে অনুরোধকৃত তথ্য/নথি জমা দিন।" };
    case "ACCEPTED":
    case "CONVERTED_TO_CASE":
      return { headline: "আবেদন অনুমোদিত — মামলা রেকর্ড খোলা হয়েছে", nextStep: `আপনার মামলা (${caseType}) প্রক্রিয়াধীন। পরবর্তী পদক্ষেপ সম্পর্কে জানতে এই নম্বরে আবার কল করুন।` };
    case "REJECTED":
      return { headline: "আবেদন অনুমোদিত হয়নি", nextStep: "কারণ জানতে ও পরবর্তী পথ-নির্দেশনার জন্য কার্যালয়ে যোগাযোগ করুন। আপিলের তথ্যও কার্যালয় দেবে।" };
    default:
      return { headline: "অবস্থা পাওয়া যায়নি", nextStep: "কার্যালয়ে যোগাযোগ করুন।" };
  }
}

export async function GET(req: Request) {
  try {
    const ctx = await requireSession();
    const { searchParams } = new URL(req.url);
    const reference = searchParams.get("reference")?.trim(); // APP- or CASE- id

    // Scope-limited citizen: only own application
    const ref = reference ?? ctx.citizenApplicationId;
    if (!ref) throw new HttpError(400, "VALIDATION_REFERENCE_REQUIRED");

    let application = null as null | Awaited<ReturnType<typeof db.application.findFirst>>;
    let kase = null as null | Awaited<ReturnType<typeof db.case.findFirst>>;
    if (ref.startsWith("APP-")) {
      application = await db.application.findUnique({
        where: { id: ref },
        include: { applicant: true, entries: { orderBy: { createdAt: "desc" }, take: 5 } },
      });
      if (application) {
        kase = await db.case.findUnique({ where: { applicationId: application.id } });
      }
    } else if (ref.startsWith("CASE-")) {
      kase = await db.case.findUnique({
        where: { id: ref },
        include: { application: { include: { applicant: true } }, hearings: { orderBy: { hearingDate: "desc" }, take: 3 }, lawyerAssignments: { include: { lawyer: { select: { name: true } } } } },
      });
      application = kase?.application ?? null;
    } else {
      throw new HttpError(400, "VALIDATION_REFERENCE_FORMAT");
    }
    if (!application) throw new HttpError(404, "NOT_FOUND");

    // Citizen scope check
    if ((ctx.role === "CITIZEN" || ctx.role === "REPRESENTATIVE") && ctx.citizenApplicationId !== application.id) {
      throw new HttpError(403, "FORBIDDEN_SCOPE");
    }

    const contactRule = kase
      ? await db.contactRule.findFirst({ where: { caseId: kase.id, active: true } })
      : null;

    const safeStatus = statusTextBn(kase?.status ?? application.status, application.caseType);
    const neutral = contactRule?.neutralWording ?? false;

    // Next hearing (A5: no more informal hearing-date learning)
    const nextHearing = kase
      ? await db.hearing.findFirst({ where: { caseId: kase.id, status: "SCHEDULED", hearingDate: { gte: new Date() } }, orderBy: { hearingDate: "asc" } })
      : null;

    // Failed contact attempts count (A5 evidence)
    const failedAttempts = kase
      ? await db.contactAttempt.count({ where: { caseId: kase.id, outcome: { in: ["NO_ANSWER", "FAILED", "BLOCKED_UNSAFE"] } } })
      : 0;

    await writeAudit({
      actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
      channel: ctx.role === "CITIZEN" || ctx.role === "REPRESENTATIVE" ? "WEB" : ctx.role,
      action: "STATUS_LOOKED_UP",
      entityType: application.id,
      entityId: application.id,
      applicationId: application.id,
      caseId: kase?.id,
      onWhoseAuthority: application.applicant.fullName,
    });

    return ok({
      found: true,
      reference: application.id,
      caseId: kase?.id ?? null,
      status: kase?.status ?? application.status,
      headline: neutral ? "আপনার আবেদন সংরক্ষিত আছে" : safeStatus.headline,
      nextStep: safeStatus.nextStep,
      caseType: neutral ? null : application.caseType,
      nextHearing: nextHearing && !neutral
        ? { date: nextHearing.hearingDate.toISOString(), location: nextHearing.location }
        : null,
      failedContactAttempts: failedAttempts,
      safeContactActive: Boolean(contactRule),
      applicantName: application.applicant.fullName,
      provenanceEntries: application.entries.map((e) => ({
        id: e.id,
        provenance: e.provenance,
        text: e.text.slice(0, 300),
        withdrawn: e.withdrawn,
        createdAt: e.createdAt,
      })),
    });
  } catch (error) {
    return fail(error);
  }
}

/** Citizen actions through the door: correction/withdrawal request. */
export async function POST(req: Request) {
  try {
    const ctx = await requireSession();
    const body = await readJson<{ reference: string; action: "CORRECTION_REQUEST" | "WITHDRAWAL_REQUEST"; entryId?: string; text: string }>(req);
    requireFields(body as never, ["reference", "action", "text"]);
    const application = await db.application.findUnique({ where: { id: body.reference }, include: { applicant: true } });
    if (!application) throw new HttpError(404, "NOT_FOUND");
    if ((ctx.role === "CITIZEN" || ctx.role === "REPRESENTATIVE") && ctx.citizenApplicationId !== application.id) {
      throw new HttpError(403, "FORBIDDEN_SCOPE");
    }

    // Correction requests become record entries + officer task (human review)
    const entry = await db.recordEntry.create({
      data: {
        applicationId: application.id,
        provenance: "APPLICANT_CONFIRMED",
        text: body.text,
        language: "bn",
        statedByName: application.applicant.fullName,
        statedByRole: "APPLICANT",
        channel: "WEB",
        kind: body.action === "WITHDRAWAL_REQUEST" ? "WITHDRAWAL_NOTICE" : "CORRECTION",
        supersedesEntryId: body.entryId ?? null,
      },
    });
    await db.task.create({
      data: {
        applicationId: application.id,
        title: body.action === "WITHDRAWAL_REQUEST" ? "তথ্য প্রত্যাহারের অনুরোধ — মানব-পর্যালোচনা" : "সংশোধনের অনুরোধ — মানব-পর্যালোচনা",
        type: "CORRECTION_REQUEST",
        ownerRole: "DLAO_OFFICER",
        reason: "নাগরিক নিজের তথ্য সংশোধন/প্রত্যাহার চেয়েছেন (A1)",
        sourceModule: "CITIZEN_DOOR",
      },
    });
    await writeAudit({
      actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
      channel: "WEB",
      action: body.action,
      entityType: "RecordEntry",
      entityId: entry.id,
      applicationId: application.id,
      reason: body.text.slice(0, 200),
      onWhoseAuthority: application.applicant.fullName,
    });
    return ok({ success: true }, 201);
  } catch (error) {
    return fail(error);
  }
}
