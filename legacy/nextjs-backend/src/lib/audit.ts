import { db } from "@/lib/db";

export interface AuditActor {
  userId?: string | null;
  name: string; // "system" for engine-generated entries
  role: string; // Role constant or "SYSTEM"
}

export interface AuditInput {
  actor: AuditActor;
  channel: string; // WEB | VOICE_IVR | USSD_SMS | ASSISTED_UDC | HELPLINE | DLAO_WALKIN | SYSTEM
  action: string; // verb phrase, e.g. "APPLICATION_SUBMITTED"
  entityType: string;
  entityId: string;
  caseId?: string | null;
  applicationId?: string | null;
  before?: string | null;
  after?: string | null;
  reason?: string | null; // mandatory for overrides / blocks (G3, G5)
  onWhoseAuthority?: string | null; // G10: whose human authority
  metadata?: Record<string, unknown>;
}

/**
 * Append-only audit writer (G10). Every consequential action in every module
 * goes through this single function so the trail is uniform and reconstructable:
 * who did what, when, through which channel/role, on whose authority.
 */
export async function writeAudit(input: AuditInput) {
  return db.auditEntry.create({
    data: {
      actorUserId: input.actor.userId ?? null,
      actorName: input.actor.name,
      actorRole: input.actor.role,
      channel: input.channel,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      caseId: input.caseId ?? null,
      applicationId: input.applicationId ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      reason: input.reason ?? null,
      onWhoseAuthority: input.onWhoseAuthority ?? null,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });
}

export const SYSTEM_ACTOR: AuditActor = { name: "system", role: "SYSTEM" };
