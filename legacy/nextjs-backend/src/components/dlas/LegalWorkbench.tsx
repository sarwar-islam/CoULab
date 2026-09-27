"use client";

// ============================================================================
// Legal workbench — B2 mediation workflow (registration → scheduling/notices →
// attendance/documents → mediation → outcome; remote/hybrid + in-person
// fallback), T7 settlement drafting (AI marks + human review), T11 async
// e-signature (offline signing + independent verification).
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { api, errorLabelBn } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorNote, OverrideBox, ProvenanceBadge, SectionCard, StateChip, STATUS_BN, bnDate, bnDateTime } from "@/components/dlas/shared";
import { sha256Hex } from "@/lib/client/offline-queue";
import type { Nav, SessionCtx } from "@/components/dlas/DlasApp";
import { Scale, FileSignature, PenLine } from "lucide-react";

interface CaseLite { id: string; caseType: string; application: { applicant: { fullName: string } } }

// ----------------------------- B2 MEDIATION -----------------------------
function MediationDocket({ session }: { session: SessionCtx | null }) {
  const [sessions, setSessions] = useState<MedSession[]>([]);
  const [cases, setCases] = useState<CaseLite[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ caseId: "", scheduledAt: "", mode: "HYBRID", locationOrLink: "", partyAName: "", partyBName: "" });

  interface MedSession {
    id: string; caseId: string; scheduledAt: string; mode: string; status: string; outcome: string | null;
    locationOrLink: string; partyAName: string; partyBName: string; attendanceJson: string; noticesJson: string; inPersonFallbackReason: string | null;
    case: { id: string; caseType: string; application: { applicant: { fullName: string } } };
  }

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([
        api<{ sessions: MedSession[] }>("/api/mediation"),
        api<{ cases: CaseLite[] }>("/api/cases"),
      ]);
      setSessions(s.sessions);
      setCases(c.cases);
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function schedule() {
    try {
      await api("/api/mediation", {
        body: { ...form, locationOrLink: form.locationOrLink || (form.mode === "IN_PERSON" ? "জেলা আইনি সহায়তা কার্যালয়" : "") },
      });
      setMsg("মধ্যস্থতা নির্ধারিত — একই রেকর্ডে (B2)।");
      await load();
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }

  async function act(sessionId: string, action: string, extra: Record<string, unknown> = {}) {
    try {
      await api("/api/mediation", { method: "PATCH", body: { sessionId, action, ...extra } });
      await load();
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }

  return (
    <SectionCard kicker="B2 · মধ্যস্থতাকারী" title="মধ্যস্থতা ওয়ার্কফ্লো" icon={<Scale className="h-4 w-4" aria-hidden />} subtitle="নিবন্ধন → সময়সূচি/নোটিশ → উপস্থিতি/নথি → মধ্যস্থতা → ফল; দূরবর্তী/হাইব্রিড বিকল্প যেখানে আইনগত ও বাস্তবসম্মত; সশরীরে-ফলব্যাক সংরক্ষিত">
      <ErrorNote message={error} />
      {msg ? <div className="mb-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs text-primary">{msg}</div> : null}
      <div className="mb-3 grid gap-2 rounded-md border border-dashed border-border bg-muted/50 p-3 text-xs md:grid-cols-3">
        <select value={form.caseId} onChange={(e) => setForm((f) => ({ ...f, caseId: e.target.value }))} className="h-8 rounded border border-border text-xs" aria-label="কেস">
          <option value="">কেস নির্বাচন…</option>
          {cases.map((c) => <option key={c.id} value={c.id}>{c.id} — {c.application.applicant.fullName}</option>)}
        </select>
        <Input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))} className="h-8 text-xs" aria-label="তারিখ" />
        <select value={form.mode} onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))} className="h-8 rounded border border-border text-xs" aria-label="মোড">
          <option value="IN_PERSON">সশরীরে</option>
          <option value="REMOTE">দূরবর্তী</option>
          <option value="HYBRID">হাইব্রিড</option>
        </select>
        <Input value={form.locationOrLink} onChange={(e) => setForm((f) => ({ ...f, locationOrLink: e.target.value }))} placeholder="স্থান/লিংক (দূরবর্তী হলে আবশ্যক)" className="h-8 text-xs" />
        <Input value={form.partyAName} onChange={(e) => setForm((f) => ({ ...f, partyAName: e.target.value }))} placeholder="পক্ষ-ক" className="h-8 text-xs" />
        <Input value={form.partyBName} onChange={(e) => setForm((f) => ({ ...f, partyBName: e.target.value }))} placeholder="পক্ষ-খ" className="h-8 text-xs" />
        <div className="md:col-span-3">
          <Button size="sm" className="bg-emerald-800 text-white hover:bg-emerald-700" onClick={schedule} disabled={!form.caseId || !form.scheduledAt || !form.partyAName || !form.partyBName}>নির্ধারণ করুন</Button>
        </div>
      </div>
      <ul className="space-y-2 text-xs">
        {sessions.map((s) => (
          <li key={s.id} className="rounded-md border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-bold text-primary">{s.caseId}</span>
              <span className="font-semibold">{s.partyAName} ↔ {s.partyBName}</span>
              <StateChip state={s.mode === "IN_PERSON" ? "info" : "ok"} label={s.mode === "IN_PERSON" ? "সশরীরে" : s.mode === "REMOTE" ? "দূরবর্তী" : "হাইব্রিড"} />
              <StateChip state={s.status === "COMPLETED" ? "ok" : "warn"} label={STATUS_BN[s.status] ?? s.status} />
              <span className="text-muted-foreground/70">{bnDateTime(s.scheduledAt)} · {s.locationOrLink}</span>
              {s.outcome ? <StateChip state="ok" label={`ফল: ${s.outcome}`} /> : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => act(s.id, "send_notices")}>নোটিশ পাঠান</Button>
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => act(s.id, "record_attendance", { attendance: { partyA: "PRESENT", partyB: "REMOTE" } })}>উপস্থিতি রেকর্ড (পক্ষ-খ দূরবর্তী)</Button>
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => { const r = window.prompt("সশরীরে-ফলব্যাকের কারণ:"); if (r) act(s.id, "fallback_in_person", { fallbackReason: r }); }}>সশরীরে-ফলব্যাক</Button>
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => act(s.id, "record_outcome", { outcome: "SETTLED", outcomeDetails: "মধ্যস্থতায় নিষ্পত্তি (মানব-সিদ্ধান্ত)" })}>ফল রেকর্ড (নিষ্পত্তি)</Button>
            </div>
            {s.inPersonFallbackReason ? <p className="mt-1 text-[10px] text-amber-800">ফলব্যাক-কারণ: {s.inPersonFallbackReason}</p> : null}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

// ----------------------------- T7 SETTLEMENT -----------------------------
function SettlementDocket({ session }: { session: SessionCtx | null }) {
  const [cases, setCases] = useState<CaseLite[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [form, setForm] = useState({ caseId: "", templateType: "MAINTENANCE", mediatorNotes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  interface Draft {
    id: string; caseId: string; templateType: string; draftText: string; aiSegmentsJson: string; warningsJson: string;
    status: string; reviewedByUserId: string | null; finalizedText: string | null; version: number; createdAt: string;
  }

  const load = useCallback(async () => {
    try {
      const [c, d] = await Promise.all([api<{ cases: CaseLite[] }>("/api/cases"), api<{ drafts: Draft[] }>("/api/settlements")]);
      setCases(c.cases);
      setDrafts(d.drafts);
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function generate() {
    setBusy(true); setError("");
    try {
      await api("/api/settlements", { body: form });
      setMsg("খসড়া তৈরি হয়েছে — এআই-অনুমিত অংশ চিহ্নিত; সতর্কতা দেখুন; মানব-পর্যালোচনা বাধ্যতামূলক।");
      await load();
    } catch (e) {
      setError(errorLabelBn(e));
    } finally {
      setBusy(false);
    }
  }

  async function act(draftId: string, action: string, extra: Record<string, unknown> = {}) {
    try {
      await api("/api/settlements", { method: "PATCH", body: { draftId, action, ...extra } });
      await load();
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }

  function renderMarked(draft: Draft) {
    const segments = JSON.parse(draft.aiSegmentsJson || "[]") as { text: string; reason: string }[];
    let text = draft.draftText;
    for (const seg of segments) {
      if (seg.text && text.includes(seg.text)) {
        text = text.replace(
          seg.text,
          `⟦এআই-অনুমিত: ${seg.text}⟧`,
        );
      }
    }
    return text.split("⟦").map((part, i) =>
      part.includes("⟧") ? (
        <mark key={i} className="rounded bg-violet-200 px-0.5 text-violet-950">{part.replace("⟧", "")}</mark>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  }

  return (
    <SectionCard kicker="T7 · এআই খসড়া + মানব-পর্যালোচনা" title="নিষ্পত্তি-খসড়া সহায়ক" icon={<FileSignature className="h-4 w-4" aria-hidden />} subtitle="মধ্যস্থতাকারীর নোট → অনুমোদিত টেমপ্লেটে খসড়া; এআই-অনুমিত অংশ দৃশ্যমান; অন্তর্নিহিত অসামঞ্জস্য পতাকা; মানব-আইনি পর্যালোচনা বাধ্যতামূলক">
      <ErrorNote message={error} />
      {msg ? <div className="mb-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs text-primary">{msg}</div> : null}
      <div className="mb-3 grid gap-2 rounded-md border border-dashed border-border bg-muted/50 p-3 text-xs md:grid-cols-3">
        <select value={form.caseId} onChange={(e) => setForm((f) => ({ ...f, caseId: e.target.value }))} className="h-8 rounded border border-border text-xs" aria-label="কেস">
          <option value="">কেস নির্বাচন…</option>
          {cases.map((c) => <option key={c.id} value={c.id}>{c.id} — {c.application.applicant.fullName}</option>)}
        </select>
        <select value={form.templateType} onChange={(e) => setForm((f) => ({ ...f, templateType: e.target.value }))} className="h-8 rounded border border-border text-xs" aria-label="টেমপ্লেট">
          <option value="MAINTENANCE">ভরণপোষণ</option>
          <option value="PROPERTY">সম্পত্তি</option>
          <option value="LABOUR">শ্রম</option>
        </select>
        <Button size="sm" className="bg-emerald-800 text-white hover:bg-emerald-700" onClick={generate} disabled={!form.caseId || busy}>{busy ? "…" : "খসড়া তৈরি করুন"}</Button>
        <textarea
          value={form.mediatorNotes}
          onChange={(e) => setForm((f) => ({ ...f, mediatorNotes: e.target.value }))}
          rows={3}
          className="md:col-span-3 w-full rounded border border-border p-2 text-xs"
          placeholder="মধ্যস্থতাকারীর নোট — যেমন: পক্ষ-ক …, পক্ষ-খ …; মাসিক ৫,০০০ টাকা ১০ তারিখে; বকেয়া ১৫,০০০ টাকা…"
          aria-label="মধ্যস্থতাকারীর নোট"
        />
      </div>
      <ul className="space-y-3 text-xs">
        {drafts.map((d) => {
          const warnings = JSON.parse(d.warningsJson || "[]") as { warning: string; severity: string }[];
          return (
            <li key={d.id} className="rounded-md border border-border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-bold text-primary">{d.caseId}</span>
                <span className="rounded bg-muted px-1.5 text-[10px]">{d.templateType}</span>
                <span className="rounded bg-muted px-1.5 text-[10px]">v{d.version}</span>
                <StateChip state={d.status === "FINALIZED" ? "ok" : d.status === "UNDER_HUMAN_REVIEW" ? "warn" : "info"} label={d.status === "FINALIZED" ? "মানব-পর্যালোচনায় চূড়ান্ত" : d.status === "UNDER_HUMAN_REVIEW" ? "মানব-পর্যালোচনাধীন" : "খসড়া (এআই)"} />
                <span className="text-muted-foreground/70">{bnDate(d.createdAt)}</span>
              </div>
              {warnings.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {warnings.map((w, i) => (
                    <li key={i} className={`rounded px-2 py-1 text-[11px] ${w.severity === "HIGH" ? "bg-red-50 text-red-900" : "bg-amber-50 text-amber-900"}`}>⚠ {w.warning}</li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-2 whitespace-pre-wrap rounded bg-muted/50 p-2.5 leading-relaxed text-foreground">{renderMarked(d)}</div>
              <p className="mt-1.5 text-[10px] text-muted-foreground/70">রঙিন অংশ = এআই-অনুমিত (AI_INFERRED) — মানব-পর্যালোচনায় যাচাই/সম্পাদনা করতে হবে।</p>
              {d.status !== "FINALIZED" ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => act(d.id, "start_review")}>মানব-পর্যালোচনা শুরু</Button>
                  <Button size="sm" className="h-7 bg-primary text-[11px] hover:bg-primary/90" onClick={() => { const n = window.prompt("পর্যালোচনা-নোট (বাধ্যতামূলক):"); if (n) act(d.id, "finalize", { reviewNotes: n }); }}>চূড়ান্ত করুন (মানব-পর্যালোচনা সম্পন্ন)</Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

// ----------------------------- T11 SIGNATURES -----------------------------
function SignatureDocket({ session }: { session: SessionCtx | null }) {
  const [sessions, setSessions] = useState<SigSession[]>([]);
  const [finalizedDrafts, setFinalizedDrafts] = useState<{ id: string; caseId: string; finalizedText: string | null; status: string }[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  interface SigSession {
    id: string; caseId: string; documentHash: string; docVersion: number; status: string; partiesJson: string;
    signatures: { id: string; partyName: string; partyRole: string; signatureHash: string | null; nonce: string; signedAt: string | null; method: string; syncStatus: string; verified: boolean | null }[];
    settlementDraft: { id: string; finalizedText: string | null };
  }

  const load = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([api<{ sessions: SigSession[] }>("/api/signatures"), api<{ drafts: { id: string; caseId: string; finalizedText: string | null; status: string }[] }>("/api/settlements")]);
      setSessions(s.sessions);
      setFinalizedDrafts(d.drafts.filter((x) => x.status === "FINALIZED"));
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function openSession(draftId: string) {
    try {
      await api("/api/signatures", { body: { draftId, parties: [] } });
      setMsg("স্বাক্ষর-সেশন খোলা হয়েছে — প্রতিটি পক্ষের জন্য nonce জারি; এক পক্ষ অফলাইনেও স্বাক্ষর করতে পারেন।");
      await load();
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }

  async function sign(s: SigSession, record: SigSession["signatures"][number], method: "ONLINE" | "OFFLINE_QUEUED") {
    if (!s.settlementDraft.finalizedText) return;
    const signedAt = new Date();
    // Client computes the binding: SHA-256(documentHash | signer | signedAt | nonce)
    const hash = await sha256Hex(`${s.documentHash}|${record.partyName}|${signedAt.toISOString()}|${record.nonce}`);
    try {
      await api("/api/signatures", {
        method: "PATCH",
        body: {
          action: "sign", sessionId: s.id, signatureRecordId: record.id, signatureHash: hash,
          signedAt: signedAt.toISOString(), method,
        },
      });
      setMsg(method === "OFFLINE_QUEUED" ? "অফলাইন স্বাক্ষর সংরক্ষিত — সিংকের অপেক্ষায় (T11)।" : "স্বাক্ষর সম্পন্ন ও যাচাইকৃত।");
      await load();
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }

  async function verify(s: SigSession) {
    try {
      const d = await api<{ documentIntact: boolean; allSigned: boolean; allBindingValid: boolean; disclaimer: string }>("/api/signatures", {
        method: "PATCH", body: { action: "verify", sessionId: s.id },
      });
      setMsg(`স্বাধীন যাচাই: দলিল=${d.documentIntact ? "অপরিবর্তিত" : "পরিবর্তিত!"}, স্বাক্ষর=${d.allSigned ? "সম্পূর্ণ" : "অসম্পূর্ণ"}, বাইন্ডিং=${d.allBindingValid ? "বৈধ" : "অবৈধ"}। ${d.disclaimer}`);
      await load();
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }

  async function syncOffline(s: SigSession) {
    try {
      await api("/api/signatures", { method: "PATCH", body: { action: "sync_offline", sessionId: s.id } });
      setMsg("অফলাইন স্বাক্ষর সিংক হয়েছে।");
      await load();
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }

  return (
    <SectionCard kicker="T11 · ক্রিপ্টোগ্রাফিক যাচাই" title="অ্যাসিনক্রোনাস নিরাপদ ই-স্বাক্ষর" icon={<PenLine className="h-4 w-4" aria-hidden />} subtitle="মধ্যস্থতা-রেকর্ডের সাথে লিংকড; এক পক্ষ অফলাইনে স্বাক্ষর করে পরে সিংক; স্বাধীন ক্রিপ্টোগ্রাফিক যাচাই। ক্রিপ্টোগ্রাফিক বৈধতা = আইনি বৈধতা নয়।">
      <ErrorNote message={error} />
      {msg ? <div className="mb-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs text-primary">{msg}</div> : null}
      <div className="mb-3 rounded-md border border-dashed border-border bg-muted/50 p-3 text-xs">
        <p className="font-semibold text-foreground/85">চূড়ান্ত (মানব-পর্যালোচিত) খসড়া থেকে সেশন খুলুন:</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {finalizedDrafts.length === 0 ? <p className="text-muted-foreground/70">চূড়ান্ত খসড়া নেই — আগে T7-তে চূড়ান্ত করুন।</p> : null}
          {finalizedDrafts.map((d) => (
            <Button key={d.id} size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => openSession(d.id)}>
              {d.caseId} — সেশন খুলুন
            </Button>
          ))}
        </div>
      </div>
      <ul className="space-y-3 text-xs">
        {sessions.map((s) => (
          <li key={s.id} className="rounded-md border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-bold text-primary">{s.caseId}</span>
              <StateChip state={s.status === "VERIFIED" ? "ok" : s.status === "COMPLETED" ? "info" : "warn"} label={s.status} />
              <span className="rounded bg-muted px-1.5 font-mono text-[10px]">docHash {s.documentHash.slice(0, 12)}… (v{s.docVersion})</span>
            </div>
            <ul className="mt-2 space-y-1.5">
              {s.signatures.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 rounded border border-border/70 px-2 py-1.5">
                  <span className="font-semibold">{r.partyName}</span>
                  <span className="text-muted-foreground/70">nonce {r.nonce.slice(0, 8)}…</span>
                  {r.signatureHash ? (
                    <>
                      <StateChip state="ok" label={`স্বাক্ষরিত (${r.method === "OFFLINE_QUEUED" ? "অফলাইন" : "অনলাইন"} · ${r.syncStatus === "PENDING" ? "সিংক-অপেক্ষমাণ" : "সিংকড"})`} />
                      <span className="font-mono text-[10px] text-muted-foreground/70">sig {r.signatureHash.slice(0, 10)}…</span>
                    </>
                  ) : (
                    <>
                      <StateChip state="warn" label="অপেক্ষমাণ" />
                      <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => sign(s, r, "ONLINE")}>অনলাইন স্বাক্ষর</Button>
                      <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => sign(s, r, "OFFLINE_QUEUED")}>অফলাইনে স্বাক্ষর (সিমুলেট)</Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => verify(s)}>স্বাধীন যাচাই চালান</Button>
              {s.signatures.some((r) => r.syncStatus === "PENDING") ? (
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => syncOffline(s)}>অফলাইন স্বাক্ষর সিংক</Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        নিয়ন্ত্রণ-রেখা: ক্রিপ্টোগ্রাফিক যাচাই প্রমাণ করে স্বাক্ষরের পর দলিল অপরিবর্তিত — এটি নিজে আইনি বৈধতা, পরিচয়,
        যোগ্যতা, অবগত-সম্মতি বা প্রয়োগযোগ্যতা প্রতিষ্ঠা করে না (T11 guardrail)। হুমকি-মডেল: ট্রান্সমিশন/হ্যাশ-বাইন্ডিং যাচাই;
          দুর্বল ডিভাইসে nonce স্থানীয়ভাবে তৈরি হয়।
      </p>
    </SectionCard>
  );
}

export default function LegalWorkbench({ session, nav, view }: { session: SessionCtx | null; nav: Nav; view: string }) {
  switch (view) {
    case "mediation": return <MediationDocket session={session} />;
    case "settlement": return <SettlementDocket session={session} />;
    case "signatures": return <SignatureDocket session={session} />;
    default: return <p>অজানা ভিউ।</p>;
  }
}
