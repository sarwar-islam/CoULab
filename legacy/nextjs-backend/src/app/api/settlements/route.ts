// T7 settlement drafts — AI draft (marked) -> explicit human review -> finalize.

import { db } from "@/lib/db";
import { ok, fail, readJson, requireFields } from "@/lib/api";
import { requireRole, requireSession, HttpError } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { draftSettlement } from "@/lib/ai/settlement";
import { sha256 } from "@/lib/crypto-server";

export async function GET(req: Request) {
  try {
    await requireSession();
    const { searchParams } = new URL(req.url);
    const caseId = searchParams.get("caseId");
    const drafts = await db.settlementDraft.findMany({
      where: caseId ? { caseId } : {},
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return ok({ drafts });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireRole("MEDIATOR", "ADMIN");
    const body = await readJson<{ caseId: string; templateType: string; mediatorNotes: string; mediationSessionId?: string }>(req);
    requireFields(body as never, ["caseId", "templateType", "mediatorNotes"]);

    const result = await draftSettlement({
      templateType: body.templateType,
      mediatorNotes: body.mediatorNotes,
      caseId: body.caseId,
    });

    const draft = await db.settlementDraft.create({
      data: {
        caseId: body.caseId,
        mediationSessionId: body.mediationSessionId ?? null,
        templateType: result.templateType,
        mediatorNotes: body.mediatorNotes,
        draftText: result.draftText,
        aiSegmentsJson: JSON.stringify(result.aiSegments),
        warningsJson: JSON.stringify(result.warnings),
        status: "DRAFT",
      },
    });
    await writeAudit({
      actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
      channel: "WEB",
      action: "T7_DRAFT_GENERATED",
      entityType: "SettlementDraft",
      entityId: draft.id,
      caseId: body.caseId,
      after: `template=${result.templateType}, ai=${result.aiAvailable}`,
      onWhoseAuthority: "এআই খসড়া — মানব-পর্যালোচনা বাধ্যতামূলক",
      metadata: { warnings: result.warnings.length, aiSegments: result.aiSegments.length },
    });
    return ok({ draft, aiAvailable: result.aiAvailable }, 201);
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await requireRole("MEDIATOR", "ADMIN");
    const body = await readJson<{
      draftId: string;
      action: "start_review" | "finalize" | "edit";
      reviewNotes?: string;
      editedText?: string;
    }>(req);
    requireFields(body as never, ["draftId", "action"]);
    const draft = await db.settlementDraft.findUnique({ where: { id: body.draftId } });
    if (!draft) throw new HttpError(404, "NOT_FOUND");

    if (body.action === "start_review") {
      await db.settlementDraft.update({ where: { id: draft.id }, data: { status: "UNDER_HUMAN_REVIEW" } });
      await writeAudit({
        actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
        channel: "WEB", action: "T7_HUMAN_REVIEW_STARTED",
        entityType: "SettlementDraft", entityId: draft.id, caseId: draft.caseId, onWhoseAuthority: ctx.name,
      });
      return ok({ success: true });
    }
    if (body.action === "edit") {
      if (!body.editedText) throw new HttpError(400, "VALIDATION_EDITED_TEXT_REQUIRED");
      await db.settlementDraft.update({
        where: { id: draft.id },
        data: { draftText: body.editedText, version: draft.version + 1 },
      });
      await writeAudit({
        actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
        channel: "WEB", action: "T7_DRAFT_EDITED_BY_HUMAN",
        entityType: "SettlementDraft", entityId: draft.id, caseId: draft.caseId,
        before: `v${draft.version}`, after: `v${draft.version + 1}`, onWhoseAuthority: ctx.name,
      });
      return ok({ success: true });
    }
    // finalize — only after explicit human review
    if (!body.reviewNotes) throw new HttpError(400, "VALIDATION_REVIEW_NOTES_REQUIRED");
    const finalizedText = body.editedText ?? draft.draftText;
    await db.settlementDraft.update({
      where: { id: draft.id },
      data: { status: "FINALIZED", reviewedByUserId: ctx.userId, reviewNotes: body.reviewNotes, finalizedText },
    });
    await writeAudit({
      actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
      channel: "WEB", action: "T7_DRAFT_FINALIZED_BY_HUMAN",
      entityType: "SettlementDraft", entityId: draft.id, caseId: draft.caseId,
      after: "FINALIZED", reason: body.reviewNotes, onWhoseAuthority: `${ctx.name} (মানব-আইনি পর্যালোচনা সম্পন্ন)`,
      metadata: { checksum: sha256(finalizedText) },
    });
    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}
