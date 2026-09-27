// B7 reporting — every number generated from data ALREADY captured in the
// case record (captured once, reused). No re-entry.

import { db } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { requireRole } from "@/lib/session";

export async function GET() {
  try {
    await requireRole("CASE_SUPPORT", "DLAO_OFFICER", "ADMIN");
    const [totalApps, accepted, rejected, pending, totalCases, closed, openTasks, overdueTasks, referralsSent, referralsAck, avgAge] = await Promise.all([
      db.application.count(),
      db.application.count({ where: { status: { in: ["ACCEPTED", "CONVERTED_TO_CASE"] } } }),
      db.application.count({ where: { status: "REJECTED" } }),
      db.application.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW", "MORE_INFO_NEEDED"] } } }),
      db.case.count(),
      db.case.count({ where: { status: "CLOSED" } }),
      db.task.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
      db.task.count({ where: { status: "OVERDUE" } }),
      db.referral.count(),
      db.referral.count({ where: { ackStatus: { in: ["ACKNOWLEDGED", "ACCEPTED", "ROUTED", "COMPLETED"] } } }),
      db.case.findMany({ select: { createdAt: true, closedAt: true, status: true } }),
    ]);

    const closedCases = avgAge.filter((c) => c.closedAt);
    const medianDaysToClosure = closedCases.length
      ? Math.round(
          closedCases
            .map((c) => (c.closedAt!.getTime() - c.createdAt.getTime()) / 86400_000)
            .sort((a, b) => a - b)
            .slice(Math.floor(closedCases.length / 2), Math.floor(closedCases.length / 2) + 1)[0] ?? 0,
        )
      : null;
    const openCases = avgAge.filter((c) => !c.closedAt);
    const medianOpenAge = openCases.length
      ? Math.round(
          openCases
            .map((c) => (Date.now() - c.createdAt.getTime()) / 86400_000)
            .sort((a, b) => a - b)[Math.floor(openCases.length / 2)],
        )
      : 0;

    return ok({
      generatedAt: new Date().toISOString(),
      report: {
        applications: {
          total: totalApps,
          pendingReview: pending,
          accepted,
          rejected,
          acceptanceRate: totalApps ? Math.round((accepted / totalApps) * 100) : 0,
        },
        cases: {
          total: totalCases,
          closed,
          medianDaysToClosure,
          medianOpenAgeDays: medianOpenAge,
        },
        workload: {
          openTasks,
          overdueTasks,
          overdueRate: openTasks + overdueTasks ? Math.round((overdueTasks / (openTasks + overdueTasks)) * 100) : 0,
        },
        referrals: {
          sent: referralsSent,
          acknowledged: referralsAck,
          ackRate: referralsSent ? Math.round((referralsAck / referralsSent) * 100) : 0,
        },
      },
    });
  } catch (error) {
    return fail(error);
  }
}
