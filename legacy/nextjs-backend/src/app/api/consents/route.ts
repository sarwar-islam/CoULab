// Consent records — representation authority visible; bounded scope; revocable.

import { db } from "@/lib/db";
import { ok, fail, readJson, requireFields } from "@/lib/api";
import { requireSession, HttpError } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const ctx = await requireSession();
    const body = await readJson<{
      caseId?: string;
      applicationId?: string;
      scope: string;
      scopeDetail: string;
      representativeName: string;
      representativeUserId?: string;
      relationship?: string;
      channel?: string;
      grantedByApplicantName: string;
    }>(req);
    requireFields(body as never, ["scope", "scopeDetail", "representativeName", "grantedByApplicantName"]);

    const consent = await db.consent.create({
      data: {
        caseId: body.caseId ?? null,
        applicationId: body.applicationId ?? null,
        scope: body.scope,
        scopeDetail: body.scopeDetail,
        authorityStatus: "ACTIVE",
        representativeName: body.representativeName,
        representativeUserId: body.representativeUserId ?? null,
        relationship: body.relationship ?? "মনোনীত প্রতিনিধি",
        channel: body.channel ?? "WEB",
        recordedByUserId: ctx.userId ?? null,
      },
    });
    await writeAudit({
      actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
      channel: body.channel ?? "WEB",
      action: "CONSENT_GRANTED",
      entityType: "Consent",
      entityId: consent.id,
      caseId: body.caseId,
      applicationId: body.applicationId,
      after: `scope=${body.scope}`,
      onWhoseAuthority: body.grantedByApplicantName,
      metadata: { scopeDetail: body.scopeDetail },
    });
    return ok({ consent }, 201);
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await requireSession();
    const body = await readJson<{ consentId: string; action: "revoke"; reason: string }>(req);
    requireFields(body as never, ["consentId", "action", "reason"]);
    const consent = await db.consent.findUnique({ where: { id: body.consentId } });
    if (!consent) throw new HttpError(404, "NOT_FOUND");
    if (body.action !== "revoke") throw new HttpError(400, "INVALID_ACTION");
    await db.consent.update({
      where: { id: body.consentId },
      data: { authorityStatus: "REVOKED", revokedAt: new Date() },
    });
    await writeAudit({
      actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
      channel: "WEB",
      action: "CONSENT_REVOKED",
      entityType: "Consent",
      entityId: body.consentId,
      caseId: consent.caseId,
      applicationId: consent.applicationId,
      reason: body.reason,
      onWhoseAuthority: ctx.name,
    });
    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}
