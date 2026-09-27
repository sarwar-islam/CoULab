"use client";

// ============================================================================
// Case record — THE one authoritative record (G1). Every provider's actions
// land here: lifecycle timeline, provenance-tagged entries, versioned
// documents, contact rules/attempts, consents, referrals, lawyer assignments,
// hearings, tasks, and the audit trail (G10).
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { api, errorLabelBn } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorNote, OverrideBox, ProvenanceBadge, SectionCard, StateChip, STATUS_BN, PRIORITY_BN, bnDate, bnDateTime } from "@/components/dlas/shared";
import type { Nav, SessionCtx } from "@/components/dlas/DlasApp";
import { FileText, History, FileSearch, ShieldCheck, UserRound, ListChecks, ArrowRightLeft, Gavel, ScrollText } from "lucide-react";

interface CaseDetail {
  id: string;
  status: string;
  caseType: string;
  office: string;
  district: string;
  priority: string;
  priorityReason: string | null;
  prioritySource: string | null;
  sensitivity: string;
  incidentGroupId: string | null;
  createdAt: string;
  application: {
    id: string;
    channel: string;
    status: string;
    narrative: string;
    applicant: { fullName: string; district: string; primaryPhone: string | null; contactNote: string | null; nidRef: string | null };
  };
  entries: { id: string; provenance: string; text: string; originalText: string | null; language: string; statedByName: string; kind: string; withdrawn: boolean; withdrawnReason: string | null; createdAt: string; channel: string }[];
  documents: { id: string; title: string; docType: string; version: number; isCurrent: boolean; status: string; sensitivity: string; provenance: string; uploadedByName: string; incidentGroupId: string | null; qualityFlags: string; createdAt: string }[];
  consents: { id: string; scope: string; scopeDetail: string; authorityStatus: string; representativeName: string; relationship: string; grantedAt: string }[];
  contactRules: { id: string; mode: string; safeNumber: string | null; safeTimeWindow: string | null; blockedNumbers: string; reason: string; active: boolean; createdAt: string }[];
  contactAttempts: { id: string; attemptedNumber: string; attemptType: string; outcome: string; notes: string | null; createdAt: string }[];
  tasks: { id: string; title: string; type: string; ownerRole: string; status: string; reason: string | null; dueAt: string | null; sourceModule: string | null }[];
  referrals: { id: string; kind: string; fromOffice: string; toOffice: string; reason: string; ackStatus: string; returnCount: number; ackDeadline: string; createdAt: string }[];
  lawyerAssignments: { id: string; status: string; lawyer: { name: string; nameBn: string | null }; stage: string; paymentStatus: string; lastUpdateAt: string | null; updates: { id: string; text: string; submittedAt: string }[] }[];
  lawyerChangeRequests: { id: string; requestedByName: string; reason: string; status: string; createdAt: string }[];
  hearings: { id: string; hearingDate: string; location: string; status: string }[];
  mediationSessions: { id: string; scheduledAt: string; mode: string; status: string; outcome: string | null }[];
  triageRuns: { id: string; finalRecommendation: string; status: string; conflictsDetected: boolean; createdAt: string }[];
  audit: { id: string; action: string; actorName: string; actorRole: string; channel: string; after: string | null; reason: string | null; onWhoseAuthority: string | null; createdAt: string }[];
}

export default function CaseRecord({ session, nav, caseId }: { session: SessionCtx | null; nav: Nav; caseId?: string }) {
  const [data, setData] = useState<CaseDetail | null>(null);
  const [error, setError] = useState("");
  const [newEntry, setNewEntry] = useState("");
  const [newEntryProv, setNewEntryProv] = useState("STAFF_ENTERED");
  const [contactNumber, setContactNumber] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    if (!caseId) return;
    setError("");
    try {
      const d = await api<{ case: CaseDetail }>(`/api/cases/${caseId}`);
      setData(d.case);
    } catch (e) {
      setError(errorLabelBn(e));
      setData(null);
    }
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  if (!caseId) {
    return <SectionCard title="কেস রেকর্ড" subtitle="কভারেজ ইনডেক্স বা কার্য-দৃশ্য থেকে একটি কেস নির্বাচন করুন"><Input placeholder="CASE-…" className="h-9 max-w-xs text-sm" onKeyDown={(e) => { if (e.key === "Enter") nav("case", { id: (e.target as HTMLInputElement).value.trim() }); }} /></SectionCard>;
  }
  if (error) return <SectionCard title="কেস রেকর্ড"><ErrorNote message={error} /></SectionCard>;
  if (!data) return <p className="text-sm text-muted-foreground">লোড হচ্ছে…</p>;

  async function addEntry() {
    if (!newEntry.trim()) return;
    try {
      await api("/api/entries", { body: { caseId: data!.id, provenance: newEntryProv, text: newEntry, channel: "WEB" } });
      setNewEntry("");
      await load();
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }

  async function withdrawEntry(entryId: string) {
    const reason = window.prompt("প্রত্যাহারের কারণ (অডিটে সংরক্ষিত):");
    if (!reason) return;
    try {
      await api("/api/entries", { method: "PATCH", body: { entryId, action: "withdraw", reason } });
      await load();
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }

  async function testContact(number: string) {
    try {
      const d = await api<{ evaluation: { allowed: boolean; outcome: string; reason: string } }>("/api/contact", {
        body: { action: "attempt", caseId: data!.id, attemptedNumber: number, attemptType: "CALL", claimedIdentity: "সিমুলেটেড কলার" },
      });
      setMsg(`কল-সিমুলেশন: ${d.evaluation.outcome} — ${d.evaluation.reason}`);
      await load();
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }

  const blocked = data.contactRules.length > 0 ? (JSON.parse(data.contactRules[0].blockedNumbers || "[]") as string[]) : [];

  return (
    <div className="space-y-4">
      <SectionCard
        kicker="G1 · এক অথরিটেটিভ রেকর্ড"
        title={data.id}
        icon={<FileText className="h-4 w-4" aria-hidden />}
        subtitle={`${data.application.applicant.fullName} · ${data.application.applicant.district} · চ্যানেল: ${data.application.channel} · আবেদন: ${data.application.id}`}
        actions={
          <div className="flex flex-wrap gap-1.5">
            <StateChip state="info" label={STATUS_BN[data.status] ?? data.status} />
            <StateChip state={data.priority === "URGENT" ? "error" : data.priority === "HIGH" ? "warn" : "ok"} label={`অগ্রাধিকার: ${PRIORITY_BN[data.priority]}`} />
            {data.sensitivity !== "NORMAL" ? <StateChip state="error" label={`প্রবেশাধিকার: ${data.sensitivity} — প্রতিটি প্রবেশ লগ হয়`} /> : null}
          </div>
        }
      >
        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <p>কার্যালয়: {data.office}</p>
          <p>অগ্রাধিকারের উৎস: {data.prioritySource === "OFFICER_DECISION" ? "কর্মকর্তার সিদ্ধান্ত" : data.prioritySource === "TRIAGE_RECOMMENDATION" ? "ট্রায়াজ সুপারিশ (গৃহীত)" : "—"} {data.priorityReason ? `— ${data.priorityReason}` : ""}</p>
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard kicker="G2" title="রেকর্ড-এন্ট্রি ও উৎস-প্রমাণ" icon={<History className="h-4 w-4" aria-hidden />} subtitle="কে বলল, কে টাইপ করল, কে অনুবাদ করল, কে নিশ্চিত করল — সব আলাদা">
          <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {data.entries.map((e) => (
              <li key={e.id} className={`rounded-md border p-2.5 text-xs ${e.withdrawn ? "border-border bg-muted/50" : "border-border bg-card"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <ProvenanceBadge provenance={e.provenance} />
                  <span className="text-[10px] text-muted-foreground/70">{bnDateTime(e.createdAt)} · {e.channel}</span>
                  {e.withdrawn ? <StateChip state="warn" label="প্রত্যাহৃত" /> : null}
                  {["DLAO_OFFICER", "CASE_SUPPORT", "ADMIN"].includes(session?.role ?? "") && !e.withdrawn ? (
                    <button className="ml-auto text-[10px] text-muted-foreground underline" onClick={() => withdrawEntry(e.id)}>প্রত্যাহার</button>
                  ) : null}
                </div>
                <p className={`mt-1.5 leading-relaxed ${e.withdrawn ? "text-muted-foreground/70 line-through" : "text-foreground"}`}>{e.text}</p>
                {e.originalText ? (
                  <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-900">মূল বক্তব্য ({e.language}): {e.originalText}</p>
                ) : null}
                <p className="mt-1 text-[10px] text-muted-foreground/70">বক্তা: {e.statedByName} · ধরন: {e.kind}</p>
              </li>
            ))}
          </ul>
          {["DLAO_OFFICER", "CASE_SUPPORT", "HELPLINE", "ADMIN"].includes(session?.role ?? "") ? (
            <div className="mt-3 space-y-2 border-t border-border/70 pt-3">
              <div className="flex gap-2">
                <select value={newEntryProv} onChange={(e) => setNewEntryProv(e.target.value)} className="h-8 rounded-md border border-border bg-white px-1.5 text-xs" aria-label="উৎস-প্রমাণ">
                  <option value="APPLICANT_CONFIRMED">আবেদনকারীর নিশ্চিতকৃত</option>
                  <option value="REPRESENTATIVE_REPORTED">প্রতিনিধির জানানো</option>
                  <option value="INTERMEDIARY_TRANSLATED">মধ্যস্থকারীর অনূদিত</option>
                  <option value="STAFF_ENTERED">কর্মকর্তার প্রবেশকৃত</option>
                </select>
                <Input value={newEntry} onChange={(e) => setNewEntry(e.target.value)} placeholder="নতুন এন্ট্রি…" className="h-8 flex-1 text-xs" />
                <Button size="sm" variant="outline" onClick={addEntry} disabled={newEntry.trim().length < 3}>যোগ</Button>
              </div>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard kicker="G6" title="নথি" icon={<FileSearch className="h-4 w-4" aria-hidden />} subtitle="সংস্করণ-নিয়ন্ত্রিত; অস্পষ্ট/অনুপস্থিত স্পষ্টভাবে দেখানো হয় — নীরব মার্জ নয়">
          <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1 text-xs">
            {data.documents.map((d) => (
              <li key={d.id} className="rounded-md border border-border bg-card p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{d.title}</span>
                  <span className="rounded bg-muted px-1 text-[10px]">v{d.version}</span>
                  <StateChip state={d.status === "CURRENT" ? "ok" : d.status === "UNCLEAR" ? "warn" : "info"} label={d.status === "CURRENT" ? "চলতি" : d.status === "UNCLEAR" ? "অস্পষ্ট (অনুমান নয়)" : d.status === "SUPERSEDED" ? "প্রতিস্থাপিত" : d.status} />
                  {d.sensitivity !== "NORMAL" ? <StateChip state="error" label="সংবেদনশীল" /> : null}
                  {d.incidentGroupId ? <StateChip state="info" label="গ্রুপ-শেয়ারড (T3)" /> : null}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground/70">
                  <ProvenanceBadge provenance={d.provenance} />
                  <span>{d.uploadedByName} · {bnDate(d.createdAt)} · {d.docType}</span>
                </div>
                {JSON.parse(d.qualityFlags || "[]").length > 0 ? (
                  <p className="mt-1 text-[10px] text-amber-800">গুণগত পতাকা: {(JSON.parse(d.qualityFlags) as string[]).join(", ")}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard kicker="G3/A1" title="নিরাপদ যোগাযোগ" icon={<ShieldCheck className="h-4 w-4" aria-hidden />} subtitle="নিয়ম সেট করা, প্রচেষ্টা লগিং, ব্লক কারণসহ — কখনো নীরব নয়">
          {data.contactRules.length > 0 ? (
            <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
              <p className="font-semibold">সক্রিয় নিয়ম: {data.contactRules[0].mode}</p>
              <p>নিরাপদ নম্বর: {data.contactRules[0].safeNumber ?? "—"} · সময়সীমা: {data.contactRules[0].safeTimeWindow ?? "—"}</p>
              <p>ব্লকড: {(blocked.join(", ") || "—")}</p>
              <p className="mt-1">কারণ: {data.contactRules[0].reason}</p>
            </div>
          ) : <p className="text-xs text-muted-foreground/70">কোনো বিশেষ নিয়ম নেই।</p>}
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
            {data.contactAttempts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 rounded border border-border/70 px-2 py-1.5">
                <span className="font-mono text-[10px]">{a.attemptedNumber}</span>
                <StateChip state={a.outcome === "COMPLETED" ? "ok" : a.outcome === "BLOCKED_UNSAFE" ? "error" : "warn"} label={a.outcome === "COMPLETED" ? "সফল" : a.outcome === "BLOCKED_UNSAFE" ? "ব্লকড-অনিরাপদ" : a.outcome === "OUTSIDE_WINDOW" ? "সময়সীমার বাইরে" : a.outcome === "NO_ANSWER" ? "উত্তর নেই" : "ব্যর্থ"} />
                <span className="text-muted-foreground/70">{bnDateTime(a.createdAt)}</span>
                {a.notes ? <span className="text-muted-foreground">— {a.notes}</span> : null}
              </li>
            ))}
          </ul>
          {["DLAO_OFFICER", "CASE_SUPPORT", "ADMIN"].includes(session?.role ?? "") ? (
            <div className="mt-2 flex flex-wrap gap-2 border-t border-border/70 pt-2">
              <Input value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} placeholder="নম্বর দিয়ে কল-সিমুলেট (নিয়ম যাচাই)" className="h-8 max-w-xs text-xs" />
              <Button size="sm" variant="outline" onClick={() => testContact(contactNumber)} disabled={contactNumber.trim().length < 6}>কল সিমুলেট</Button>
              <Button size="sm" variant="ghost" onClick={() => testContact(blocked[0] ?? "01899887766")}>অনিরাপদ নম্বর পরীক্ষা (A1)</Button>
            </div>
          ) : null}
          {msg ? <p className="mt-2 rounded-md bg-muted/50 px-2 py-1.5 text-[11px] text-foreground/85">{msg}</p> : null}
        </SectionCard>

        <SectionCard kicker="A2/A4" title="প্রতিনিধিত্ব ও সম্মতি" icon={<UserRound className="h-4 w-4" aria-hidden />} subtitle="কর্তৃত্ব-পরিসর, অবস্থা ও প্রদানকারী দৃশ্যমান">
          <ul className="space-y-1.5 text-xs">
            {data.consents.length === 0 ? <li className="text-muted-foreground/70">কোনো সম্মতি-রেকর্ড নেই।</li> : null}
            {data.consents.map((c) => (
              <li key={c.id} className="rounded-md border border-border bg-card p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{c.representativeName}</span>
                  <span className="text-muted-foreground">({c.relationship})</span>
                  <StateChip state={c.authorityStatus === "ACTIVE" ? "ok" : "warn"} label={c.authorityStatus} />
                  <span className="text-muted-foreground/70">{bnDate(c.grantedAt)}</span>
                </div>
                <p className="mt-1 text-muted-foreground">পরিসর: {c.scope} — {c.scopeDetail}</p>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard kicker="G7" title="কার্য ও দায়িত্ব" icon={<ListChecks className="h-4 w-4" aria-hidden />} subtitle="মালিক, অবস্থা, সময়সীমা ও কারণ — এক ইঞ্জিন, সব ভিউ">
          <ul className="max-h-60 space-y-1 overflow-y-auto text-xs">
            {data.tasks.map((t) => (
              <li key={t.id} className="rounded border border-border/70 px-2 py-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <StateChip state={t.status === "OVERDUE" ? "error" : t.status === "DONE" ? "ok" : "info"} label={STATUS_BN[t.status] ?? t.status} />
                  <span className="font-medium">{t.title}</span>
                  <span className="text-muted-foreground/70">· মালিক: {t.ownerRole} {t.dueAt ? `· সীমা ${bnDate(t.dueAt)}` : ""} {t.sourceModule ? `· ${t.sourceModule}` : ""}</span>
                </div>
                {t.reason ? <p className="mt-0.5 text-[11px] text-muted-foreground">{t.reason}</p> : null}
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard kicker="B6/T2" title="রেফারেল ও এখতিয়ার" icon={<ArrowRightLeft className="h-4 w-4" aria-hidden />}>
          <ul className="space-y-1.5 text-xs">
            {data.referrals.length === 0 ? <li className="text-muted-foreground/70">রেফারেল নেই।</li> : null}
            {data.referrals.map((r) => (
              <li key={r.id} className="rounded-md border border-border bg-card p-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <StateChip state={r.ackStatus === "SENT" ? "warn" : r.ackStatus === "ESCALATED" || r.ackStatus === "RETURNED" ? "error" : "ok"} label={STATUS_BN[r.ackStatus] ?? r.ackStatus} />
                  <span className="font-medium">{r.fromOffice} → {r.toOffice}</span>
                  {r.kind === "JURISDICTION_TRANSFER" ? <StateChip state="warn" label="T2 স্থানান্তর" /> : null}
                </div>
                <p className="mt-1 text-muted-foreground">{r.reason} · ফেরত: {r.returnCount}বার · স্বীকৃতি-সীমা: {bnDate(r.ackDeadline)}</p>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard kicker="A5/B5/T1/B2" title="আইনজীবী, হিয়ারিং ও মধ্যস্থতা" icon={<Gavel className="h-4 w-4" aria-hidden />}>
          <ul className="space-y-1.5 text-xs">
            {data.lawyerAssignments.map((la) => (
              <li key={la.id} className="rounded-md border border-border bg-card p-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold">{la.lawyer.nameBn ?? la.lawyer.name}</span>
                  <StateChip state={la.status === "ACCEPTED" ? "ok" : la.status === "PROPOSED" ? "warn" : "info"} label={STATUS_BN[la.status] ?? la.status} />
                  <span className="text-muted-foreground">· পর্যায়: {la.stage} · পরিশোধ: {la.paymentStatus}</span>
                  {la.lastUpdateAt ? <span className="text-muted-foreground/70">· শেষ হালনাগাদ {bnDate(la.lastUpdateAt)}</span> : null}
                </div>
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                  {la.updates.slice(0, 2).map((u) => <li key={u.id}>• {u.text} ({bnDate(u.submittedAt)})</li>)}
                </ul>
              </li>
            ))}
            {data.hearings.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-1.5 rounded border border-border/70 px-2 py-1.5">
                <StateChip state={h.status === "MISSED" ? "error" : h.status === "SCHEDULED" ? "warn" : "ok"} label={STATUS_BN[h.status] ?? h.status} />
                <span>হিয়ারিং: {bnDate(h.hearingDate)} · {h.location}</span>
              </li>
            ))}
            {data.mediationSessions.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-1.5 rounded border border-border/70 px-2 py-1.5">
                <span>মধ্যস্থতা: {bnDate(m.scheduledAt)} · {m.mode} · {STATUS_BN[m.status] ?? m.status} {m.outcome ? `· ফল: ${m.outcome}` : ""}</span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard kicker="G10" title="অডিট ট্রেইল" icon={<ScrollText className="h-4 w-4" aria-hidden />} subtitle="কে, কী করল, কখন, কোন চ্যানেলে, কার কর্তৃত্বে">
          <ul className="max-h-64 space-y-1 overflow-y-auto text-[11px]">
            {data.audit.map((a) => (
              <li key={a.id} className="rounded border border-border/70 px-2 py-1">
                <span className="font-mono text-[10px] text-muted-foreground/70">{bnDateTime(a.createdAt)}</span> <b>{a.action}</b> — {a.actorName} ({a.actorRole}) @ {a.channel}
                {a.after ? <span className="text-muted-foreground"> → {a.after}</span> : null}
                {a.reason ? <span className="block text-muted-foreground">কারণ: {a.reason}</span> : null}
                {a.onWhoseAuthority ? <span className="block text-muted-foreground">কর্তৃত্ব: {a.onWhoseAuthority}</span> : null}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => nav("audit")}>পূর্ণ অডিট ভিউ</Button>
            <Button size="sm" variant="outline" onClick={() => nav("triage")}>T8 ট্রায়াজ চালান</Button>
          </div>
        </SectionCard>
      </div>
      <ErrorNote message={error} />
    </div>
  );
}
