"use client";

// ============================================================================
// Lawyer center — B5 panel-lawyer worklist (accept/decline, hearings,
// updates, overdue alerts, safe client notifications) and B6 referral
// receiving office (complete package, acknowledge/accept/return, follow-up).
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { api, errorLabelBn } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { ErrorNote, SectionCard, StateChip, STATUS_BN, bnDate, bnDateTime } from "@/components/dlas/shared";
import type { Nav, SessionCtx } from "@/components/dlas/DlasApp";
import { Briefcase, Inbox } from "lucide-react";

// ----------------------------- B5 WORKLIST -----------------------------
function WorklistDocket({ session }: { session: SessionCtx | null }) {
  interface Assignment {
    id: string; caseId: string; status: string; stage: string; paymentStatus: string; assignedAt: string; acceptedAt: string | null; lastUpdateAt: string | null;
    overdueUpdate: boolean;
    case: { id: string; caseType: string; application: { applicant: { fullName: string; primaryPhone: string | null; contactNote: string | null } }; hearings: { id: string; hearingDate: string; status: string; location: string }[]; tasks: { id: string; title: string; status: string; dueAt: string | null; reason: string | null }[]; documents: { id: string; title: string }[] };
    updates: { id: string; text: string; submittedAt: string }[];
    lawyer: { name: string };
  }
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api<{ assignments: Assignment[] }>("/api/lawyer?view=worklist");
      setAssignments(d.assignments);
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(assignmentId: string, action: string, extra: Record<string, unknown> = {}) {
    try {
      await api("/api/lawyer", { method: "PATCH", body: { action, assignmentId, ...extra } });
      setMsg(`সম্পন্ন: ${action} — ডিএলএও স্বয়ংক্রিয়ভাবে দেখবেন; আলাদা ফোন-চেজ লাগবে না (B5)。`);
      await load();
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }

  return (
    <SectionCard kicker="B5 · প্যানেল আইনজীবী" title="আইনজীবী ওয়ার্কলিস্ট" icon={<Briefcase className="h-4 w-4" aria-hidden />} subtitle="এক দৃশ্যে নিয়োগ, নথি, হিয়ারিং, সময়সীমা ও প্রয়োজনীয় হালনাগাদ; ডিজিটাল গ্রহণ/অপ্রত্যাখ্যান; অতিরিক্ত হলে ডিএলএও-তে স্বয়ংক্রিয় সতর্কতা">
      <ErrorNote message={error} />
      {msg ? <div className="mb-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs text-primary">{msg}</div> : null}
      <ul className="space-y-2.5 text-xs">
        {assignments.length === 0 ? <li className="text-muted-foreground/70">কোনো নিয়োগ নেই (এই অ্যাকাউন্টে)। ডেমো: lawyer.kabir লগইন করলে T1-নমুনা ও মালেকের কেস দেখা যাবে।</li> : null}
        {assignments.map((a) => (
          <li key={a.id} className={`rounded-md border p-3 ${a.overdueUpdate ? "border-red-300 bg-red-50/40" : "border-border bg-card"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-bold text-primary">{a.caseId}</span>
              <span className="font-semibold">{a.case.application.applicant.fullName}</span>
              <span className="rounded bg-muted px-1.5 text-[10px]">{a.case.caseType}</span>
              <StateChip state={a.status === "ACCEPTED" ? "ok" : a.status === "PROPOSED" ? "warn" : "info"} label={STATUS_BN[a.status] ?? a.status} />
              <span className="text-muted-foreground">পর্যায়: {a.stage}</span>
              {a.overdueUpdate ? <StateChip state="error" label="হালনাগাদ অতিরিক্ত" /> : null}
              {a.lastUpdateAt ? <span className="text-muted-foreground/70">শেষ হালনাগাদ {bnDate(a.lastUpdateAt)}</span> : null}
            </div>
            {a.status === "PROPOSED" ? (
              <div className="mt-2 flex gap-2">
                <Button size="sm" className="h-7 bg-primary text-[11px] hover:bg-primary/90" onClick={() => act(a.id, "accept")}>গ্রহণ</Button>
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => { const r = window.prompt("অপ্রত্যাখ্যানের কারণ:"); if (r) act(a.id, "decline", { reason: r }); }}>অপ্রত্যাখ্যান</Button>
              </div>
            ) : (
              <>
                <p className="mt-2 font-semibold text-foreground/85">হিয়ারিং:</p>
                <ul className="mt-0.5 space-y-0.5 text-muted-foreground">
                  {a.case.hearings.map((h) => (
                    <li key={h.id} className="flex flex-wrap items-center gap-1.5">
                      <StateChip state={h.status === "MISSED" ? "error" : h.status === "SCHEDULED" ? "warn" : "ok"} label={STATUS_BN[h.status] ?? h.status} />
                      {bnDate(h.hearingDate)} · {h.location}
                      {h.status === "SCHEDULED" ? (
                        <>
                          <button className="text-[10px] underline" onClick={() => act(a.id, "hearing_status", { hearingId: h.id, hearingStatus: "HELD" })}>অনুষ্ঠিত রেকর্ড</button>
                          <button className="text-[10px] text-red-700 underline" onClick={() => act(a.id, "hearing_status", { hearingId: h.id, hearingStatus: "MISSED" })}>মিসড রেকর্ড (T1 ট্রিগার)</button>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 font-semibold text-foreground/85">প্রয়োজনীয় হালনাগাদ/সময়সীমা:</p>
                <ul className="mt-0.5 space-y-0.5 text-muted-foreground">
                  {a.case.tasks.map((t) => (
                    <li key={t.id}>• {t.title} {t.dueAt ? `(সীমা ${bnDate(t.dueAt)})` : ""} {t.reason ? `— ${t.reason}` : ""}</li>
                  ))}
                </ul>
                <p className="mt-2 font-semibold text-foreground/85">কেস-নথি: {a.case.documents.map((d) => d.title).join(" · ") || "—"}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => { const t = window.prompt("হালনাগাদের বিবরণ:"); if (t) act(a.id, "update", { updateText: t }); }}>
                    হালনাগাদ জমা দিন (নিরাপদ নোটিফিকেশন সহ)
                  </Button>
                </div>
              </>
            )}
            <p className="mt-1.5 text-[10px] text-muted-foreground/70">
              ক্লায়েন্ট-যোগাযোগ: {a.case.application.applicant.primaryPhone ?? "—"} {a.case.application.applicant.contactNote ? `(${a.case.application.applicant.contactNote})` : ""} — বার্তা নিরপেক্ষ ভাষায়, কেসের বিষয় প্রকাশ নয় (G3)。
            </p>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

// ----------------------------- B6 RECEIVING -----------------------------
function ReferralInbox({ session }: { session: SessionCtx | null }) {
  interface Ref {
    id: string; caseId: string; kind: string; fromOffice: string; toOffice: string; reason: string; historySummary: string;
    responsibleActor: string; expectedAction: string; ackStatus: string; returnCount: number; ackDeadline: string; deadline: string; sensitive: boolean; createdAt: string;
    case: { id: string; caseType: string; sensitivity: string; application: { applicant: { fullName: string } } };
  }
  const [refs, setRefs] = useState<Ref[]>([]);
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

  async function act(referralId: string, action: string, extra: Record<string, unknown> = {}) {
    try {
      await api("/api/referrals", { method: "PATCH", body: { referralId, action, ...extra } });
      await load();
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }

  return (
    <SectionCard kicker="B6 · গ্রহণকারী কার্যালয়" title="রেফারেল ইনবক্স" icon={<Inbox className="h-4 w-4" aria-hidden />} subtitle="সম্পূর্ণ প্যাকেজ: কারণ, ইতিহাস, নথি, দায়িত্বপ্রাপ্ত কর্মকর্তা, প্রত্যাশিত পদক্ষেপ; স্বীকৃতি/গ্রহণ/ফেরত — উভয় কার্যালয়ে অবস্থা দৃশ্যমান; স্বীকৃতি-বিলম্বে অনুসরণ-সতর্কতা">
      <ErrorNote message={error} />
      <ul className="space-y-2.5 text-xs">
        {refs.length === 0 ? <li className="text-muted-foreground/70">ইনবক্স খালি (এই অ্যাকাউন্টে)।</li> : null}
        {refs.map((r) => {
          const overdue = r.ackStatus === "SENT" && new Date(r.ackDeadline).getTime() < Date.now();
          return (
            <li key={r.id} className={`rounded-md border p-3 ${overdue ? "border-red-300 bg-red-50/40" : "border-border bg-card"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-bold text-primary">{r.caseId}</span>
                <span className="font-semibold">{r.case.application.applicant.fullName}</span>
                <span className="rounded bg-muted px-1.5 text-[10px]">{r.case.caseType}</span>
                <StateChip state={r.ackStatus === "SENT" ? (overdue ? "error" : "warn") : r.ackStatus === "ESCALATED" || r.ackStatus === "RETURNED" ? "error" : "ok"} label={STATUS_BN[r.ackStatus] ?? r.ackStatus} />
                {r.sensitive ? <StateChip state="error" label="সংবেদনশীল — প্রবেশাধিকার সীমিত (A3)" /> : null}
                {r.kind === "JURISDICTION_TRANSFER" ? <StateChip state="warn" label="T2 স্থানান্তর" /> : null}
                <span className="ml-auto text-muted-foreground/70">স্বীকৃতি-সীমা {bnDate(r.ackDeadline)}</span>
              </div>
              <div className="mt-2 grid gap-1.5 text-muted-foreground md:grid-cols-2">
                <p><b>কারণ:</b> {r.reason}</p>
                <p><b>প্রেরক:</b> {r.fromOffice} → <b>প্রাপক:</b> {r.toOffice}</p>
                <p><b>দায়িত্বপ্রাপ্ত:</b> {r.responsibleActor}</p>
                <p><b>প্রত্যাশিত পদক্ষেপ:</b> {r.expectedAction}</p>
                <p className="md:col-span-2"><b>ইতিহাস-সারাংশ:</b> {r.historySummary}</p>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => act(r.id, "acknowledge")}>স্বীকৃতি দিন</Button>
                <Button size="sm" className="h-7 bg-primary text-[11px] hover:bg-primary/90" onClick={() => { const n = window.prompt("গ্রহণের নোট:"); if (n) act(r.id, "accept", { reason: n }); }}>গ্রহণ</Button>
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => { const n = window.prompt("ফেরতের কারণ (বাধ্যতামূলক — T2):"); if (n) act(r.id, "return", { reason: n }); }}>ফেরত (কারণসহ)</Button>
                <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => navToCase(r.caseId)}>রেকর্ড দেখুন</Button>
              </div>
              {overdue ? <p className="mt-1.5 text-[10px] text-red-800">স্বীকৃতি-সময়সীমা অতিক্রান্ত — প্রেরক কার্যালয়ে অনুসরণ-সতর্কতা যেতে হবে (A3 failure test)。</p> : null}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

function navToCase(caseId: string) {
  const qs = new URLSearchParams({ view: "case", id: caseId });
  window.history.pushState(null, "", `/?${qs}`);
  window.location.reload();
}

export default function LawyerCenter({ session, nav, view }: { session: SessionCtx | null; nav: Nav; view: string }) {
  switch (view) {
    case "worklist": return <WorklistDocket session={session} />;
    case "referrals": return <ReferralInbox session={session} />;
    default: return <p>অজানা ভিউ।</p>;
  }
}
