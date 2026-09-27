// T6 briefing endpoint — document summary + checklist comparison.

import { db } from "@/lib/db";
import { ok, fail, readJson, requireFields } from "@/lib/api";
import { requireRole, HttpError } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { buildDocumentBriefing } from "@/lib/ai/document-briefing";

export async function POST(req: Request) {
  try {
    const ctx = await requireRole("DLAO_OFFICER", "CASE_SUPPORT", "UDC", "ADMIN");
    const body = await readJson<{ caseId: string }>(req);
    requireFields(body as never, ["caseId"]);

    // Prefer server-side truth: fetch the case + its documents directly
    const kase = await db.case.findUnique({
      where: { id: body.caseId },
      include: { application: { include: { documents: true } }, documents: true },
    });
    if (!kase) throw new HttpError(404, "CASE_NOT_FOUND");
    const caseType = kase.caseType;
    const allDocs = [...kase.documents, ...kase.application.documents].map((d) => ({
      id: d.id,
      title: d.title,
      docType: d.docType,
      status: d.status,
      textContent: d.textContent,
    }));

    const briefing = await buildDocumentBriefing(caseType, allDocs);

    // Persist the latest briefing on the primary case document (AI_INFERRED —
    // officer verifies; the value itself is shown with provenance in UI).
    const primaryDoc = (kase.documents.length > 0 ? kase.documents : kase.application.documents)[0];
    if (primaryDoc) {
      await db.documentRecord.update({
        where: { id: primaryDoc.id },
        data: { aiBriefing: briefing.summaryBn },
      }).catch(() => undefined);
    }

    await writeAudit({
      actor: { userId: ctx.userId, name: ctx.name, role: ctx.role },
      channel: "WEB",
      action: "T6_DOCUMENT_BRIEFING",
      entityType: "Case",
      entityId: body.caseId,
      caseId: body.caseId,
      after: `${allDocs.length} নথি বিশ্লেষণ; ai=${briefing.aiAvailable}`,
      onWhoseAuthority: "এআই ব্রিফিং — কর্মকর্তা যাচাই করবেন (T6 guardrail)",
    });
    return ok(briefing);
  } catch (error) {
    return fail(error);
  }
}
