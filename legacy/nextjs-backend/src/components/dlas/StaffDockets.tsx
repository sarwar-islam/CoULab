"use client";

// ============================================================================
// Staff dockets — T8 triage pipeline, T4 duplicate review, T3 incident
// groups, T6 document agent, T1 lawyer-change, T2 jurisdiction escalation.
// Each docket demonstrates its guardrail: recommend → human decides → audit.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { api, errorLabelBn } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorNote, OverrideBox, ProvenanceBadge, SectionCard, StateChip, bnDate, bnDateTime } from "@/components/dlas/shared";
import type { Nav, SessionCtx } from "@/components/dlas/DlasApp";
import { Bot, Fingerprint, Link2, FileSearch, UserCog, ArrowRightLeft } from "lucide-react";

interface CaseLite { id: string; caseType: string; priority: string; application: { applicant: { fullName: string }; narrative: string }; documents: { id: string; title: string; docType: string; status: string; textContent: string | null }[] }

// ----------------------------- T8 TRIAGE -----------------------------
function TriageDocket({ nav }: { nav: Nav }) {
  const [cases, setCases] = useState<CaseLite[]>([]);
  const [runs, setRuns] = useState<Record<string, TriageRunView>>({});
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  interface TriageRunView {
    id: string;
    finalRecommendation: string;
    status: string;
    conflictsDetected: boolean;
    categoryResult: { agent: string; output: string; evidence: { reason: string; evidence: string }[]; confidence: number };
    complianceResult: { agent: string; output: string; evidence: { reason: string; evidence: string }[]; confidence: number };
    orchestrationResult: { agent: string; output: string; recommendedPriority: string; recommendedJurisdiction: string; conflicts: string[]; evidence: { reason: string; evidence: string }[] };
  }

  const load = useCallback(async () => {
    try {
      const d = await api<{ cases: CaseLite[] }>("/api/cases");
      setCases(d.cases.slice(0, 8));
      const r = await api<{ runs: { id: string; caseId: string | null; finalRecommendation: string; status: string; conflictsDetected: boolean; categoryResultJson: string; complianceResultJson: string; orchestrationResultJson: string }[] }>("/api/triage");
      const map: Record<string, TriageRunView> = {};
      for (const run of r.runs) {
        if (!run.caseId) continue;
        map[run.caseId] = {
          id: run.id, finalRecommendation: run.finalRecommendation, status: run.status, conflictsDetected: run.conflictsDetected,
          categoryResult: JSON.parse(run.categoryResultJson), complianceResult: JSON.parse(run.complianceResultJson), orchestrationResult: JSON.parse(run.orchestrationResultJson),
        };
      }
      setRuns(map);
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function run(caseId: string) {
    setError(""); setMsg("");
    try {
      await api("/api/triage", { body: { caseId } });
      setMsg(`ট্রায়াজ-রান সম্পন্ন: ${caseId}`);
      await load();
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }

  async function decide(runId: string, decision: "ACCEPT_RECOMMENDATION" | "OVERRIDE", reason: string, priority?: string) {
    try {
      await api("/api/triage", { method: "PATCH", body: { runId, decision, reason, priority } });
      setMsg("মানব-সিদ্ধান্ত রেকর্ড হয়েছে (G5) — অগ্রাধিকার/এখতিয়ার হালনাগাদ।");
      await load();
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }

  return (
    <SectionCard kicker="T8 · বহু-এজেন্ট পাইপলাইন" title="ট্রায়াজ পাইপলাইন" icon={<Bot className="h-4 w-4" aria-hidden />} subtitle="৩টি বিশেষায়িত কম্পোনেন্ট: শ্রেণিবিন্যাস + প্রক্রিয়া/নথি-যাচাই + অর্কেস্ট্রেশন; সংঘর্ষ মানব-পর্যালোচনায়; চূড়ান্ত সিদ্ধান্ত কর্মকর্তার">
      <ErrorNote message={error} />
      {msg ? <div className="mb-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs text-primary">{msg}</div> : null}
      <ul className="space-y-2.5">
        {cases.map((c) => {
          const run = runs[c.id];
          return (
            <li key={c.id} className="rounded-md border border-border bg-card p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-bold text-primary">{c.id}</span>
                <span className="font-semibold">{c.application.applicant.fullName}</span>
                <span className="rounded bg-muted px-1.5 text-[10px]">{c.caseType}</span>
                {run ? <StateChip state={run.conflictsDetected ? "error" : run.status === "RECOMMENDED" ? "warn" : "ok"} label={run.conflictsDetected ? "সংঘর্ষ — মানব-পর্যালোচনা" : run.status === "RECOMMENDED" ? "সুপারিশ প্রস্তুত" : `মানব-সিদ্ধান্ত: ${run.status}`} /> : null}
                {!run ? <Button size="sm" variant="outline" className="ml-auto h-7 text-[11px]" onClick={() => run(c.id)}>ট্রায়াজ চালান</Button> : (
                  <Button size="sm" variant="ghost" className="ml-auto h-7 text-[11px]" onClick={() => run(c.id)}>পুনরায় চালান</Button>
                )}
              </div>
              {run ? (
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  {[run.categoryResult, run.complianceResult, run.orchestrationResult].map((a) => (
                    <div key={a.agent} className="rounded border border-border/70 bg-muted/50 p-2">
                      <p className="font-bold text-foreground/85">{a.agent} <span className="font-normal text-muted-foreground/70">({a.confidence}%)</span></p>
                      <p className="mt-0.5 text-foreground/85">{a.output}</p>
                      <ul className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
                        {"recommendedPriority" in a ? <li>• প্রস্তাবিত অগ্রাধিকার: {a.recommendedPriority} · এখতিয়ার: {a.recommendedJurisdiction}</li> : null}
                        {"conflicts" in a && a.conflicts.length > 0 ? a.conflicts.map((cf, i) => <li key={i} className="text-red-800">⚠ {cf}</li>) : null}
                        {a.evidence.slice(0, 2).map((ev, i) => <li key={i}>• {ev.reason}: {ev.evidence}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : null}
              {run && run.status === "RECOMMENDED" ? (
                <div className="mt-2">
                  <OverrideBox
                    title="সুপারিশ গ্রহণ/ওভাররাইড করুন (মানব-সিদ্ধান্ত)"
                    actionLabel="গ্রহণ/ওভাররাইড নিশ্চিত"
                    note="ব্যাখ্যা = সংক্ষিপ্ত কারণ+প্রমাণ (লুকানো chain-of-thought নয়)। ওভাররাইড করলে কারণ অডিটে যায়।"
                    onConfirm={async (reason) => {
                      const isConflict = run.conflictsDetected;
                      await decide(run.id, isConflict ? "OVERRIDE" : "ACCEPT_RECOMMENDATION", reason);
                    }}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

// ----------------------------- T4 DUPLICATES -----------------------------
function DuplicateDocket() {
  interface Cand {
    id: string; score: number; status: string; matchedFieldsJson: string;
    applicationA: { id: string; applicant: { fullName: string; district: string; primaryPhone: string | null; nidRef: string | null } };
    applicationB: { id: string; applicant: { fullName: string; district: string; primaryPhone: string | null; nidRef: string | null } };
  }
  const [cands, setCands] = useState<Cand[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api<{ candidates: Cand[] }>("/api/duplicates");
      setCands(d.candidates);
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function scan() {
    setError("");
    try {
      const d = await api<{ created: number }>("/api/duplicates", { body: {} });
      setMsg(`স্ক্যান সম্পন্ন — ${d.created} নতুন প্রার্থী (থ্রেশহোল্ডের উপরে; কোনো স্বয়ংক্রিয় ব্যবস্থা নয়)।`);
      await load();
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }

  async function review(id: string, decision: "CONFIRMED_DUPLICATE" | "NOT_A_DUPLICATE") {
    const notes = window.prompt(decision === "CONFIRMED_DUPLICATE" ? "নিশ্চিত-ডুপ্লিকেটের পর্যালোচনা-নোট:" : "ভিন্ন-ব্যক্তির পর্যালোচনা-নোট:");
    if (!notes) return;
    try {
      await api("/api/duplicates", { method: "PATCH", body: { candidateId: id, decision, reviewNotes: notes } });
      await load();
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }

  return (
    <SectionCard kicker="T4 · মানব-পর্যালোচনা" title="ডুপ্লিকেট / প্রতারণা-ঝুঁকি শনাক্তকরণ" icon={<Fingerprint className="h-4 w-4" aria-hidden />} subtitle="বহু-গুণাঙ্গ ফাজি ম্যাচ + প্রমাণ-প্রদর্শন + পাশাপাশি মানব-পর্যালোচনা। কখনো স্বয়ংক্রিয় প্রত্যাখ্যান/মার্জ/‘প্রতারক’ লেবেল নয়।"
      actions={<Button size="sm" variant="outline" onClick={scan}>নতুন স্ক্যান চালান</Button>}>
      <ErrorNote message={error} />
      {msg ? <div className="mb-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs text-primary">{msg}</div> : null}
      {cands.length === 0 ? <p className="text-xs text-muted-foreground/70">প্রার্থী নেই — স্ক্যান চালান (সিড-করা ১২ রেকর্ডের কর্পাসে সত্যিক ডুপ্লিকেট ও ‘trap’ কেস আছে)।</p> : null}
      <ul className="space-y-2">
        {cands.map((c) => {
          const fields = JSON.parse(c.matchedFieldsJson) as { field: string; valueA: string; valueB: string; similarity: number }[];
          return (
            <li key={c.id} className="rounded-md border border-border bg-card p-3 text-xs">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <StateChip state={c.status === "PENDING" ? "warn" : c.status === "CONFIRMED_DUPLICATE" ? "error" : "ok"} label={c.status === "PENDING" ? "মানব-পর্যালোচনা অপেক্ষমাণ" : c.status === "CONFIRMED_DUPLICATE" ? "নিশ্চিত ডুপ্লিকেট" : "ভিন্ন ব্যক্তি"} />
                <span className="font-bold">সাদৃশ্য-স্কোর: {c.score}%</span>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {[c.applicationA, c.applicationB].map((a, i) => (
                  <div key={i} className="rounded border border-border/70 bg-muted/50 p-2">
                    <p className="font-mono text-[10px] text-muted-foreground">{a.id}</p>
                    <p className="font-semibold">{a.applicant.fullName}</p>
                    <p className="text-muted-foreground">জেলা: {a.applicant.district} · ফোন: {a.applicant.primaryPhone ?? "—"} · NID-রেফ: {a.applicant.nidRef ?? "—"} (মাস্কড, উদাহরণ)</p>
                  </div>
                ))}
              </div>
              <ul className="mt-2 grid gap-1 text-[10px] text-muted-foreground sm:grid-cols-4">
                {fields.map((f) => (
                  <li key={f.field} className="rounded bg-white px-1.5 py-1 ring-1 ring-stone-100">
                    <b>{f.field}:</b> {f.similarity}%<span className="block text-muted-foreground/70">{f.valueA} ↔ {f.valueB}</span>
                  </li>
                ))}
              </ul>
              {c.status === "PENDING" ? (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="destructive" className="h-7 text-[11px]" onClick={() => review(c.id, "CONFIRMED_DUPLICATE")}>নিশ্চিত ডুপ্লিকেট (মানব-সিদ্ধান্ত)</Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => review(c.id, "NOT_A_DUPLICATE")}>ভিন্ন ব্যক্তি (trap-কেস)</Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

// ----------------------------- T3 INCIDENT GROUPS -----------------------------
function IncidentDocket() {
  interface Group { id: string; name: string; description: string; location: string | null; cases: { id: string; caseType: string; application: { applicant: { fullName: string } } }[] }
  const [groups, setGroups] = useState<Group[]>([]);
  const [sharedDocs, setSharedDocs] = useState<{ id: string; title: string; incidentGroupId: string | null }[]>([]);
  const [allCases, setAllCases] = useState<CaseLite[]>([]);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [pick, setPick] = useState<string[]>([]);
  const [docPick, setDocPick] = useState<{ groupId: string; documentId: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const g = await api<{ groups: Group[]; sharedDocs: { id: string; title: string; incidentGroupId: string | null }[] }>("/api/incident-groups");
      setGroups(g.groups); setSharedDocs(g.sharedDocs);
      const c = await api<{ cases: CaseLite[] }>("/api/cases");
      setAllCases(c.cases);
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function createGroup() {
    try {
      await api("/api/incident-groups", { body: { name, description: desc, caseIds: pick } });
      setName(""); setDesc(""); setPick([]);
      await load();
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }

  async function shareDoc() {
    if (!docPick) return;
    try {
      await api("/api/incident-groups", { method: "PATCH", body: { action: "add_evidence", groupId: docPick.groupId, documentId: docPick.documentId } });
      setDocPick(null);
      await load();
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }

  return (
    <SectionCard kicker="T3 · লিংক, মার্জ নয়" title="একই ঘটনার একাধিক আবেদন" icon={<Link2 className="h-4 w-4" aria-hidden />} subtitle="লিংক, মার্জ নয় — গোপনীয়তা, নির্দেশনা ও ফল প্রতিটি কেসে পৃথক থাকে; সাধারণ প্রমাণ একবার আপলোড, গোটা গ্রুপে দৃশ্যমান">
      <ErrorNote message={error} />
      <div className="mb-3 space-y-2 rounded-md border border-dashed border-border bg-muted/50 p-3">
        <p className="text-xs font-semibold text-foreground/85">নতুন ঘটনা-গ্রুপ:</p>
        <div className="flex flex-wrap gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ঘটনার নাম" className="h-8 max-w-xs text-xs" />
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="বিবরণ" className="h-8 max-w-xs text-xs" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {allCases.slice(0, 12).map((c) => (
            <button key={c.id} onClick={() => setPick((p) => p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id])}
              className={`rounded border px-1.5 py-0.5 text-[10px] ${pick.includes(c.id) ? "border-primary/45 bg-primary/8 text-primary" : "border-border text-muted-foreground"}`}>
              {c.id} ({c.application.applicant.fullName})
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={createGroup} disabled={!name.trim() || !desc.trim() || pick.length < 1}>গ্রুপ তৈরি ও লিংক</Button>
      </div>
      <ul className="space-y-2 text-xs">
        {groups.map((g) => (
          <li key={g.id} className="rounded-md border border-border bg-card p-3">
            <p className="font-bold">{g.name}</p>
            <p className="text-muted-foreground">{g.description}</p>
            <p className="mt-1 font-semibold text-foreground/85">সংযুক্ত কেস ({g.cases.length}) — পৃথক রেকর্ড:</p>
            <ul className="mt-0.5 space-y-0.5 text-muted-foreground">
              {g.cases.map((c) => <li key={c.id}>• <span className="font-mono">{c.id}</span> {c.application.applicant.fullName} — নিজস্ব নির্দেশনা/ফল অক্ষুণ্ণ</li>)}
            </ul>
            <p className="mt-1.5 font-semibold text-foreground/85">গ্রুপ-শেয়ারড প্রমাণ:</p>
            <ul className="mt-0.5 space-y-0.5 text-muted-foreground">
              {sharedDocs.filter((d) => d.incidentGroupId === g.id).map((d) => <li key={d.id}>📎 {d.title} (একবার আপলোড — গোটা গ্রুপে)</li>)}
            </ul>
            {g.cases.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <select className="h-7 rounded border border-border text-[11px]" onChange={(e) => setDocPick({ groupId: g.id, documentId: e.target.value })} defaultValue="">
                  <option value="">প্রমাণ যোগ করুন…</option>
                  {allCases.filter((c) => c.id === g.cases[0]?.id).flatMap((c) => c.documents ?? []).map((d) => (
                    <option key={d.id} value={d.id}>{d.title}</option>
                  ))}
                </select>
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={shareDoc} disabled={!docPick || docPick.groupId !== g.id}>গ্রুপে শেয়ার</Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

// ----------------------------- T6 DOCUMENT AGENT -----------------------------
function DocumentAgentDocket() {
  const [cases, setCases] = useState<CaseLite[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [briefing, setBriefing] = useState<{ summaryBn: string; points: { point: string; sourceDocumentTitle: string; confidence: string }[]; checklist: { label: string; required: boolean; state: string; note?: string }[]; aiAvailable: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ cases: CaseLite[] }>("/api/cases").then((d) => {
      setCases(d.cases);
      const docCase = d.cases.find((c) => c.documents.length >= 4);
      if (docCase) setSelected(docCase.id);
    }).catch((e) => setError(errorLabelBn(e)));
  }, []);

  async function analyze() {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const kase = cases.find((c) => c.id === selected)!;
      const d = await api<typeof briefing>("/api/documents/briefing", { body: { caseId: selected, caseType: kase.caseType, documents: kase.documents } });
      setBriefing(d);
    } catch (e) {
      setError(errorLabelBn(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard kicker="T6 · উৎসসহ ব্রিফিং" title="নথি-সারাংশ ও চেকলিস্ট এজেন্ট" icon={<FileSearch className="h-4 w-4" aria-hidden />} subtitle="সংক্ষিপ্ত ব্রিফিং; প্রতিটি গুরুত্বপূর্ণ বিন্দুর উৎস; অসম্পূর্ণ/অস্পষ্ট পতাকা — অস্পষ্ট বিষয় অনুমান নয়; কর্মকর্তা ব্রিফিং যাচাই করেন">
      <div className="mb-3 flex flex-wrap gap-2">
        <select value={selected} onChange={(e) => setSelected(e.target.value)} className="h-9 rounded-md border border-border bg-white px-2 text-xs" aria-label="কেস নির্বাচন">
          <option value="">কেস নির্বাচন…</option>
          {cases.map((c) => <option key={c.id} value={c.id}>{c.id} — {c.application.applicant.fullName} ({c.documents.length} নথি)</option>)}
        </select>
        <Button size="sm" className="bg-emerald-800 text-white hover:bg-emerald-700" onClick={analyze} disabled={!selected || busy}>{busy ? "বিশ্লেষণ চলছে…" : "ব্রিফিং তৈরি করুন"}</Button>
      </div>
      <ErrorNote message={error} />
      {briefing ? (
        <div className="grid gap-3 text-xs md:grid-cols-2">
          <div className="rounded-md border border-border bg-card p-3">
            <div className="mb-2 flex items-center gap-2">
              <StateChip state={briefing.aiAvailable ? "ok" : "warn"} label={briefing.aiAvailable ? "এআই ব্রিফিং (AI_INFERRED — যাচাই করুন)" : "এআই অনুপলব্ধ — নিয়ম-ভিত্তিক চেকলিস্ট নিচে"} />
            </div>
            <p className="leading-relaxed text-foreground">{briefing.summaryBn}</p>
            <ul className="mt-2 space-y-1.5">
              {briefing.points.map((p, i) => (
                <li key={i} className="rounded border border-border/70 bg-muted/50 p-2">
                  <p className="text-foreground">{p.point}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">উৎস: {p.sourceDocumentTitle} · আত্মবিশ্বাস: {p.confidence}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-md border border-border bg-card p-3">
            <p className="mb-2 font-semibold text-foreground/85">কেস-টাইপ চেকলিস্ট তুলনা:</p>
            <ul className="space-y-1">
              {briefing.checklist.map((c) => (
                <li key={c.label} className="flex flex-wrap items-center gap-1.5 rounded border border-border/70 px-2 py-1.5">
                  <StateChip state={c.state === "PRESENT" ? "ok" : c.state === "UNCLEAR" ? "warn" : c.required ? "error" : "info"} label={c.state === "PRESENT" ? "জমা" : c.state === "UNCLEAR" ? "অস্পষ্ট" : "অনুপস্থিত"} />
                  <span>{c.label}</span>
                  {c.required ? <span className="text-[10px] text-red-700">প্রয়োজনীয়</span> : null}
                  {c.note ? <span className="text-[10px] text-muted-foreground/70">{c.note}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}

// ----------------------------- T1 LAWYER CHANGE -----------------------------
function LawyerChangeDocket() {
  interface Req { id: string; caseId: string; requestedByName: string; reason: string; status: string; createdAt: string; case: { id: string; lawyerAssignments: { id: string; lawyer: { name: string } }[] } }
  const [reqs, setReqs] = useState<Req[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api<{ requests: Req[] }>("/api/lawyer/change-requests");
      setReqs(d.requests);
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function decide(id: string, decision: string) {
    const notes = window.prompt("পর্যালোচনা-নোট (মানব-সিদ্ধান্ত):");
    if (!notes) return;
    try {
      await api("/api/lawyer/change-requests", { method: "PATCH", body: { requestId: id, decision, reviewNotes: notes } });
      await load();
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }

  return (
    <SectionCard kicker="T1 · মানব-পর্যালোচনা কিউ" title="আইনজীবী-পরিবর্তনের অনুরোধ কিউ" icon={<UserCog className="h-4 w-4" aria-hidden />} subtitle="নাগরিকের অনুরোধ → ডিএলএও কিউ → মানব-পর্যালোচনা/পুনর্নিয়োগ → পর্যায়ভিত্তিক পরিশোধ-পুনর্মূল্যায়ন → আলাদা প্যাটার্ন-সতর্কতা (নিষ্ক্রিয়তা প্যাটার্ন পর্যালোচনা-ট্রিগার মাত্র, অসদাচরণ-প্রমাণ নয়)">
      <ErrorNote message={error} />
      <ul className="space-y-2 text-xs">
        {reqs.length === 0 ? <li className="text-muted-foreground/70">কোনো অনুরোধ নেই।</li> : null}
        {reqs.map((r) => (
          <li key={r.id} className="rounded-md border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-bold text-primary">{r.caseId}</span>
              <span className="font-semibold">{r.requestedByName}</span>
              <StateChip state={r.status === "SUBMITTED" ? "warn" : r.status === "REASSIGNED" ? "ok" : "info"} label={r.status} />
              <span className="text-muted-foreground/70">{bnDate(r.createdAt)}</span>
              <span className="text-muted-foreground">· বর্তমান আইনজীবী: {r.case.lawyerAssignments[0]?.lawyer.name ?? "—"}</span>
            </div>
            <p className="mt-1.5 text-foreground/85">কারণ: {r.reason}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => decide(r.id, "UNDER_REVIEW")}>পর্যালোচনায় নিন</Button>
              <Button size="sm" className="h-7 bg-primary text-[11px] hover:bg-primary/90" onClick={() => decide(r.id, "REASSIGNED")}>পুনর্নিয়োগ নিশ্চিত (পরিশোধ-পুনর্মূল্যায়ন সহ)</Button>
              <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => decide(r.id, "DISMISSED")}>খারিজ</Button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <OverrideBox title="প্যাটার্ন-সতর্কতা মানব-পর্যালোচনা নোট" note="প্যাটার্ন-সতর্কতা (T1_PATTERN_ALERT) শুধু পর্যালোচনার জন্য — এটি নিজে অসদাচরণ বা উদ্ধারযোগ্য অর্থ-পরিমাণ প্রতিষ্ঠা করে না।" actionLabel="পর্যালোচনা-নোট রেকর্ড করুন"
          onConfirm={async (reason) => { await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: `T1 প্যাটার্ন-পর্যালোচনা নোট: ${reason}`, type: "LAWYER_UPDATE", ownerRole: "DLAO_OFFICER", reason, sourceModule: "T1_HUMAN_REVIEW" }) }); }} />
      </div>
    </SectionCard>
  );
}

// ----------------------------- T2 JURISDICTION -----------------------------
function JurisdictionDocket() {
  interface Ref { id: string; caseId: string; kind: string; fromOffice: string; toOffice: string; reason: string; ackStatus: string; returnCount: number; escalationLevel: number; createdAt: string }
  const [refs, setRefs] = useState<Ref[]>([]);
  const [finalOffice, setFinalOffice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api<{ referrals: Ref[] }>("/api/referrals");
      setRefs(d.referrals);
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function action(referralId: string, act: string, extra: Record<string, unknown> = {}) {
    try {
      await api("/api/referrals", { method: "PATCH", body: { referralId, action: act, ...extra } });
      await load();
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }

  return (
    <SectionCard kicker="T2 · ২ ফেরতে উত্তোলন" title="এখতিয়ার টানাটানি (পিং-পং)" icon={<ArrowRightLeft className="h-4 w-4" aria-hidden />} subtitle="বারবার স্থানান্তর/ফেরত শনাক্ত → ফেরতের কারণ বাধ্যতামূলক → ২ বারের পর উত্তোলন → চূড়ান্ত রাউটিং-সিদ্ধান্ত অনুমোদিত মানুষের (সিস্টেম কখনো এখতিয়ার-সিদ্ধান্ত নেয় না)">
      <ErrorNote message={error} />
      <ul className="space-y-2 text-xs">
        {refs.map((r) => (
          <li key={r.id} className="rounded-md border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-bold text-primary">{r.caseId}</span>
              <StateChip state={r.ackStatus === "ESCALATED" ? "error" : r.ackStatus === "SENT" ? "warn" : "ok"} label={r.ackStatus} />
              <span>{r.fromOffice} ↔ {r.toOffice}</span>
              <span className="rounded bg-muted px-1.5 text-[10px]">ফেরত: {r.returnCount} · উত্তোলন: {r.escalationLevel}</span>
              <span className="text-muted-foreground/70">{bnDate(r.createdAt)}</span>
            </div>
            <p className="mt-1 text-muted-foreground">কারণ: {r.reason}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => action(r.id, "acknowledge")}>স্বীকৃতি দিন</Button>
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => { const reason = window.prompt("ফেরতের কারণ (বাধ্যতামূলক):"); if (reason) action(r.id, "return", { reason }); }}>ফেরত পাঠান (কারণসহ)</Button>
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => action(r.id, "escalate", { reason: "স্বয়ংক্রিয় অনুসরণ" })}>উত্তোলন</Button>
            </div>
            {r.ackStatus === "ESCALATED" ? (
              <div className="mt-2 rounded-md border border-red-300 bg-red-50 p-2.5">
                <p className="font-semibold text-red-900">উত্তোলিত — চূড়ান্ত রাউটিং-সিদ্ধান্ত প্রয়োজন (T2 guardrail: সিদ্ধান্তটি মানুষের):</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <Input value={finalOffice} onChange={(e) => setFinalOffice(e.target.value)} placeholder="চূড়ান্ত কার্যালয়…" className="h-8 max-w-xs text-xs" />
                  <Button size="sm" className="h-7 bg-stone-800 text-[11px]" onClick={() => { const reason = window.prompt("চূড়ান্ত সিদ্ধান্তের কারণ:"); if (reason && finalOffice.trim()) action(r.id, "route", { reason, finalOffice: finalOffice.trim() }); }} disabled={finalOffice.trim().length < 3}>
                    চূড়ান্ত সিদ্ধান্ত রেকর্ড করুন
                  </Button>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

export default function StaffDockets({ session, nav, view }: { session: SessionCtx | null; nav: Nav; view: string }) {
  switch (view) {
    case "triage": return <TriageDocket nav={nav} />;
    case "duplicates": return <DuplicateDocket />;
    case "incident-groups": return <IncidentDocket />;
    case "document-agent": return <DocumentAgentDocket />;
    case "lawyer-change": return <LawyerChangeDocket />;
    case "jurisdiction": return <JurisdictionDocket />;
    default: return <p>অজানা ডকেট।</p>;
  }
}
