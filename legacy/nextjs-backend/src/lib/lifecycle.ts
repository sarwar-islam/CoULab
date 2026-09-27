import { db } from "@/lib/db";
import { nextId, APP_PREFIX, CASE_PREFIX } from "@/lib/ids";
import { writeAudit, AuditActor, SYSTEM_ACTOR } from "@/lib/audit";
import { CHANNELS, APPLICATION_STATUSES, CASE_STATUSES } from "@/lib/constants";

/**
 * Case lifecycle engine (PDF backbone):
 *   ENTRY CHANNEL -> APPLICATION ID -> VERIFICATION / REVIEW -> CASE ID -> ...
 * A Case ID is minted ONLY on acceptance, and every transition writes one
 * AuditEntry (G1, G10).
 */

export const APPLICATION_TRANSITIONS: Record<string, string[]> = {
  SUBMITTED: ["UNDER_REVIEW", "REJECTED"],
  UNDER_REVIEW: ["MORE_INFO_NEEDED", "ACCEPTED", "REJECTED"],
  MORE_INFO_NEEDED: ["UNDER_REVIEW", "REJECTED"],
  ACCEPTED: ["CONVERTED_TO_CASE"],
  REJECTED: [],
  CONVERTED_TO_CASE: [],
};

export async function assertApplicationTransition(from: string, to: string) {
  if (!APPLICATION_STATUSES.includes(from) || !APPLICATION_STATUSES.includes(to)) {
    throw new Error(`INVALID_STATUS:${from}->${to}`);
  }
  const allowed = APPLICATION_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(`ILLEGAL_TRANSITION:${from}->${to}`);
  }
}

/** Accept an application and mint exactly one Case with a new Case ID. */
export async function acceptApplication(
  applicationId: string,
  actor: AuditActor,
  channel: string,
  opts: { priority?: string; priorityReason?: string; sensitive?: boolean } = {},
) {
  const application = await db.application.findUnique({ where: { id: applicationId } });
  if (!application) throw new Error("APPLICATION_NOT_FOUND");
  await assertApplicationTransition(application.status, "ACCEPTED");

  const caseId = await nextId(CASE_PREFIX);
  const [updatedApp, newCase] = await db.$transaction([
    db.application.update({
      where: { id: applicationId },
      data: { status: "CONVERTED_TO_CASE", caseId },
    }),
    db.case.create({
      data: {
        id: caseId,
        applicationId,
        status: "OPEN",
        caseType: application.caseType,
        office: application.office,
        district: application.district,
        acceptedByUserId: actor.userId ?? "unknown",
        priority: opts.priority ?? "MEDIUM",
        priorityReason: opts.priorityReason ?? "গ্রহণের সময় কর্মকর্তার প্রাথমিক মূল্যায়ন",
        prioritySource: "OFFICER_DECISION",
        sensitivity: opts.sensitive ? "SENSITIVE" : "NORMAL",
      },
    }),
  ]);

  await writeAudit({
    actor,
    channel,
    action: "APPLICATION_ACCEPTED_CASE_MINTED",
    entityType: "Application",
    entityId: applicationId,
    caseId,
    applicationId,
    before: application.status,
    after: "CONVERTED_TO_CASE",
    onWhoseAuthority: actor.name,
  });
  await writeAudit({
    actor: SYSTEM_ACTOR,
    channel: "SYSTEM",
    action: "CASE_CREATED",
    entityType: "Case",
    entityId: caseId,
    caseId,
    applicationId,
    after: "OPEN",
  });
  return newCase;
}

export async function transitionCase(
  caseId: string,
  to: string,
  actor: AuditActor,
  channel: string,
  extra?: { outcome?: string },
) {
  const record = await db.case.findUnique({ where: { id: caseId } });
  if (!record) throw new Error("CASE_NOT_FOUND");
  if (!CASE_STATUSES.includes(to)) throw new Error(`INVALID_CASE_STATUS:${to}`);
  const before = record.status;
  const updated = await db.case.update({
    where: { id: caseId },
    data: {
      status: to,
      outcome: extra?.outcome ?? record.outcome,
      closedAt: to === "CLOSED" ? new Date() : record.closedAt,
      closedByUserId: to === "CLOSED" ? actor.userId : record.closedByUserId,
    },
  });
  await writeAudit({
    actor,
    channel,
    action: "CASE_TRANSITION",
    entityType: "Case",
    entityId: caseId,
    caseId,
    applicationId: record.applicationId,
    before,
    after: to,
    onWhoseAuthority: actor.name,
  });
  return updated;
}

export { CHANNELS };
