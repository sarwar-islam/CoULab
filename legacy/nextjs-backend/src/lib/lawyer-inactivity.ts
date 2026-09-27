// ============================================================================
// T1 helper — panel-lawyer inactivity pattern detection.
// GUARDRAIL (case PDF): pattern detection may trigger REVIEW only; it does
// NOT itself establish misconduct or a recoverable amount.
// ============================================================================

import { db } from "@/lib/db";
import { INACTIVITY_PATTERN_THRESHOLD } from "@/lib/constants";

export interface InactivitySignals {
  missedHearings: number;
  missedUpdates: number; // overdue update tasks on this case
  daysSinceLastUpdate: number | null;
}

/** Signals for one assignment: missed hearings + missed/overdue updates. */
export async function collectSignals(assignmentId: string): Promise<InactivitySignals> {
  const assignment = await db.lawyerAssignment.findUnique({
    where: { id: assignmentId },
    include: { case: { include: { hearings: true, tasks: true } } },
  });
  if (!assignment) return { missedHearings: 0, missedUpdates: 0, daysSinceLastUpdate: null };
  const missedHearings = assignment.case.hearings.filter((h) => h.status === "MISSED").length;
  const missedUpdates = assignment.case.tasks.filter(
    (t) => t.type === "LAWYER_UPDATE" && (t.status === "OVERDUE" || t.status === "OPEN"),
  ).length;
  const daysSinceLastUpdate = assignment.lastUpdateAt
    ? Math.floor((Date.now() - assignment.lastUpdateAt.getTime()) / 86_400_000)
    : null;
  return { missedHearings, missedUpdates, daysSinceLastUpdate };
}

/**
 * Cross-case pattern: does this lawyer show similar inactivity on OTHER cases?
 * Returns count of other cases with missed hearings OR overdue updates.
 */
export async function crossCaseInactivityCount(lawyerUserId: string, excludeCaseId: string) {
  const assignments = await db.lawyerAssignment.findMany({
    where: { lawyerUserId, status: { in: ["ACCEPTED", "PROPOSED"] } },
    include: { case: { include: { hearings: true, tasks: true } } },
  });
  return assignments
    .filter((a) => a.caseId !== excludeCaseId)
    .filter(
      (a) =>
        a.case.hearings.some((h) => h.status === "MISSED") ||
        a.case.tasks.some((t) => t.type === "LAWYER_UPDATE" && (t.status === "OVERDUE" || t.status === "OPEN")),
    ).length;
}

/** Fire the SEPARATE pattern alert when the defined threshold is met. */
export async function checkAndFlagPattern(assignmentId: string) {
  const signals = await collectSignals(assignmentId);
  const assignment = await db.lawyerAssignment.findUnique({ where: { id: assignmentId } });
  if (!assignment) return null;
  const otherCount = await crossCaseInactivityCount(assignment.lawyerUserId, assignment.caseId);
  const patternMet =
    signals.missedHearings >= INACTIVITY_PATTERN_THRESHOLD &&
    otherCount >= INACTIVITY_PATTERN_THRESHOLD;
  if (patternMet && !assignment.inactivityFlaggedAt) {
    await db.lawyerAssignment.update({
      where: { id: assignmentId },
      data: { inactivityFlaggedAt: new Date() },
    });
    await db.task.create({
      data: {
        caseId: assignment.caseId,
        title: "প্যাটার্ন-সতর্কতা: প্যানেল আইনজীবীর বারবার নিষ্ক্রিয়তা (মানব-পর্যালোচনা)",
        titleBn: "Repeated-inactivity review alert",
        type: "LAWYER_UPDATE",
        ownerRole: "DLAO_OFFICER",
        priority: "HIGH",
        status: "OPEN",
        sourceModule: "T1_PATTERN_ALERT",
        reason: `এই মামলায় মিসড হিয়ারিং ${signals.missedHearings}টি; একই আইনজীবীর অন্য ${otherCount}টি মামলায় অনুরূপ নিষ্ক্রিয়তা। প্যাটার্ন-সতর্কতা শুধু পর্যালোচনার জন্য — এটি নিজে দুর্নীতি/অসদাচরণ প্রমাণ করে না।`,
      },
    });
  }
  return { signals, otherCount, patternMet };
}
