// ============================================================================
// T11 Offline-capable secure e-signature.
// Async signing linked to the mediation record; one party may sign offline and
// sync later; cryptographic verification (SHA-256 binding); independent
// verification recomputes hashes.
// GUARDRAIL: cryptographic validity does NOT establish legal validity,
// identity, capacity, informed consent or enforceability — stated in UI.
// ============================================================================

import { db } from "@/lib/db";
import { ok, fail, readJson, requireFields } from "@/lib/api";
import { requireRole, requireSession, HttpError } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { sha256 } from "@/lib/crypto-server";

export async function GET(req: Request) {
  try {
    await requireSession();
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    const where = sessionId ? { id: sessionId } : {};
    const sessions = await db.signatureSession.findMany({
      where,
      include: { signatures: true, settlementDraft: { select: { id: true, finalizedText: true, version: true, caseId: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return ok({ sessions });
  } catch (error) {
    return fail(error);
  }
}

/** Init a signing session from a FINALIZED settlement draft. */
export async function POST(req: Request) {
  try {
    const ctx = await requireRole("MEDIATOR", "ADMIN");
    const body = await readJson<{
      draftId: string;
      parties: { name: string; role: string }[];
    }>(req);
    requireFields(body as never, ["draftId"]);
    const draft = await db.settlementDraft.findUnique({ where: { id: body.draftId } });
    if (!draft) throw new HttpError(404, "DRAFT_NOT_FOUND");
    if (draft.status !== "FINALIZED" || !draft.finalizedText) {
      throw new HttpError(400, "VALIDATION_DRAFT_MUST_BE_FINALIZED_BY_HUMAN_REVIEW_FIRST");
    }
    const docHash = sha256(draft.finalizedText);
    const parties = body.parties?.length
      ? body.parties
      : [
          { name: "পক্ষ-ক", role: "APPLICANT" },
          { name: "পক্ষ-খ", role: "OPPOSING_PARTY" },
        ];
    const session = await db.signatureSession.create({
      data: {
        caseId: draft.caseId,
        settlementDraftId: draft.id,
        documentHash: docHash,
        docVersion: draft.version,
        partiesJson: JSON.stringify(parties),
        status: "PENDING",
      },
    });
    // one signature record per party, nonce issued upfront (offline signing possible)
    for (const p of parties) {
      await db.signatureRecord.create({
        data: {
          sessionId: session.id,
          partyName: p.name,
          partyRole: p.role,
          nonce: crypto.randomUUID(),
          method: "ONLINE",
          syncStatus: "SYNCED",
        },
      });
    }
    await writeAudit({
      actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
      channel: "WEB",
      action: "T11_SIGNING_SESSION_OPENED",
      entityType: "SignatureSession",
      entityId: session.id,
      caseId: draft.caseId,
      after: `docHash=${docHash.slice(0, 16)}…`,
      onWhoseAuthority: ctx.name,
    });
    return ok({ session: { ...session, documentHash: docHash, parties } }, 201);
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await requireSession();
    const body = await readJson<{
      action: "sign" | "verify" | "sync_offline";
      sessionId: string;
      signatureRecordId?: string;
      partyName?: string;
      method?: "ONLINE" | "OFFLINE_QUEUED";
      // sign payload: computed by the client over (documentHash|partyName|signedAtIso|nonce)
      signatureHash?: string;
      signedAt?: string;
      offlineQueuedAt?: string;
    }>(req);
    requireFields(body as never, ["action", "sessionId"]);
    const session = await db.signatureSession.findUnique({
      where: { id: body.sessionId },
      include: { signatures: true, settlementDraft: true },
    });
    if (!session) throw new HttpError(404, "NOT_FOUND");
    const actor = { userId: ctx.userId, name: ctx.name, role: ctx.role };

    if (body.action === "sign") {
      requireFields(body as never, ["signatureRecordId", "signatureHash", "signedAt"]);
      const record = session.signatures.find((s) => s.id === body.signatureRecordId);
      if (!record) throw new HttpError(404, "SIGNATURE_RECORD_NOT_FOUND");
      if (record.signatureHash) throw new HttpError(400, "ALREADY_SIGNED");
      // Independent verification of the client-computed hash:
      const expected = sha256(
        `${session.documentHash}|${record.partyName}|${new Date(body.signedAt!).toISOString()}|${record.nonce}`,
      );
      const verified = expected === body.signatureHash;
      if (!verified) throw new HttpError(400, "SIGNATURE_HASH_MISMATCH");
      const isOffline = body.method === "OFFLINE_QUEUED";
      await db.signatureRecord.update({
        where: { id: record.id },
        data: {
          signatureHash: body.signatureHash!,
          signedAt: new Date(body.signedAt!),
          method: isOffline ? "OFFLINE_QUEUED" : "ONLINE",
          syncStatus: isOffline ? "PENDING" : "SYNCED",
          verified: true,
          verifiedAt: new Date(),
          verifyResult: "HASH_BINDING_VERIFIED",
        },
      });
      const signedCount = session.signatures.filter((s) => s.id !== record.id && s.signatureHash).length + 1;
      await db.signatureSession.update({
        where: { id: session.id },
        data: { status: signedCount >= session.signatures.length ? "COMPLETED" : "PARTIAL" },
      });
      await writeAudit({
        actor, channel: isOffline ? "ASSISTED_UDC" : "WEB",
        action: isOffline ? "T11_SIGNED_OFFLINE_QUEUED" : "T11_SIGNED",
        entityType: "SignatureRecord", entityId: record.id, caseId: session.caseId,
        after: `${record.partyName} স্বাক্ষরিত (${isOffline ? "অফলাইন" : "অনলাইন"})`,
        onWhoseAuthority: record.partyName,
      });
      return ok({ success: true, verified });
    }

    if (body.action === "sync_offline") {
      const pending = session.signatures.filter((s) => s.syncStatus === "PENDING");
      for (const s of pending) {
        await db.signatureRecord.update({ where: { id: s.id }, data: { syncStatus: "SYNCED" } });
      }
      await writeAudit({
        actor, channel: "WEB", action: "T11_OFFLINE_SIGNATURES_SYNCED",
        entityType: "SignatureSession", entityId: session.id, caseId: session.caseId,
        after: `${pending.length}টি স্বাক্ষর সিংক হয়েছে`, onWhoseAuthority: ctx.name,
      });
      return ok({ synced: pending.length });
    }

    // verify — INDEPENDENT verification method: recompute from finalized text
    const finalized = session.settlementDraft.finalizedText;
    const recomputedDocHash = sha256(finalized ?? "");
    const docIntact = recomputedDocHash === session.documentHash;
    const allSigned = session.signatures.every((s) => s.signatureHash);
    let allBindingValid = true;
    for (const s of session.signatures) {
      if (!s.signatureHash) continue;
      const expected = sha256(`${session.documentHash}|${s.partyName}|${s.signedAt!.toISOString()}|${s.nonce}`);
      if (expected !== s.signatureHash) allBindingValid = false;
    }
    await db.signatureSession.update({
      where: { id: session.id },
      data: { status: docIntact && allSigned && allBindingValid ? "VERIFIED" : session.status },
    });
    await writeAudit({
      actor, channel: "WEB", action: "T11_VERIFICATION_RUN",
      entityType: "SignatureSession", entityId: session.id, caseId: session.caseId,
      after: `document=${docIntact ? "UNCHANGED" : "CHANGED"}, signatures=${allSigned ? "COMPLETE" : "INCOMPLETE"}, bindings=${allBindingValid ? "VALID" : "INVALID"}`,
      onWhoseAuthority: "স্বাধীন যাচাই (হ্যাশ-পুনঃগণনা)",
    });
    return ok({
      documentIntact: docIntact,
      allSigned,
      allBindingValid,
      recomputedDocHash,
      originalDocHash: session.documentHash,
      disclaimer:
        "ক্রিপ্টোগ্রাফিক যাচাই প্রমাণ করে দলিল স্বাক্ষরের পর অপরিবর্তিত আছে; এটি নিজে থেকে আইনি বৈধতা, পরিচয়, যোগ্যতা, অবগত-সম্মতি বা প্রয়োগযোগ্যতা প্রতিষ্ঠা করে না।",
    });
  } catch (error) {
    return fail(error);
  }
}
