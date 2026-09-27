"use client";

// Citizen web portal — status, next step, correction/withdrawal (A1),
// lawyer-change request (T1). Scope-limited session (G9).

import { useCallback, useEffect, useState } from "react";
import { api, errorLabelBn } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorNote, ProvenanceBadge, SectionCard, StateChip, bnDateTime } from "@/components/dlas/shared";
import type { Nav, SessionCtx } from "@/components/dlas/DlasApp";
import { UserRound, Search, History, PenLine, UserCog } from "lucide-react";

interface StatusResp {
  found: boolean;
  reference: string;
  caseId: string | null;
  status: string;
  headline: string;
  nextStep: string;
  caseType: string | null;
  nextHearing: { date: string; location: string } | null;
  failedContactAttempts: number;
  safeContactActive: boolean;
  applicantName: string;
  provenanceEntries: { id: string; provenance: string; text: string; withdrawn: boolean; createdAt: string }[];
}

export default function CitizenPortal({ session, nav }: { session: SessionCtx | null; nav: Nav }) {
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const [correction, setCorrection] = useState("");
  const [entryId, setEntryId] = useState("");
  const [lawyerReason, setLawyerReason] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async (ref?: string, explicit = true) => {
    setError("");
    try {
      const d = await api<StatusResp>(`/api/status${ref ? `?reference=${encodeURIComponent(ref)}` : ""}`);
      setStatus(d);
    } catch (e) {
      // প্রথম স্বয়ংক্রিয় লোডে ব্যর্থ হলে চুপচাপ অনুসন্ধান-ফর্ম দেখাই —
      // স্পষ্ট অনুসন্ধানে ব্যর্থ হলেই ত্রুটি-বার্তা (বাংলায়) দেখানো হয়।
      if (explicit) setError(errorLabelBn(e));
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    if (session && (session.role === "CITIZEN" || session.role === "REPRESENTATIVE")) load(undefined, false);
  }, [session, load]);

  if (!session || !(session.role === "CITIZEN" || session.role === "REPRESENTATIVE")) {
    return (
      <SectionCard kicker="সুযোগ-সীমিত প্রবেশ (G9)" title="নাগরিক পোর্টাল" subtitle="প্রবেশ করুন — আবেদন আইডি ও শেষ ৪ অঙ্ক দিয়ে" icon={<UserRound className="h-4 w-4" aria-hidden />}>
        <p className="text-sm text-muted-foreground">এই পোর্টাল সুযোগ-সীমিত নাগরিক প্রবেশের জন্য। প্রবেশ পাতা থেকে “দরজা-যাচাই” করুন।</p>
        <Button className="mt-3 bg-primary hover:bg-primary/90" onClick={() => nav("login")}>প্রবেশ পাতা</Button>
      </SectionCard>
    );
  }

  async function submitCorrection(action: "CORRECTION_REQUEST" | "WITHDRAWAL_REQUEST") {
    if (!status) return;
    setMsg("");
    try {
      await api("/api/status", { body: { reference: status.reference, action, entryId: entryId || undefined, text: correction } });
      setMsg(action === "CORRECTION_REQUEST" ? "সংশোধনের অনুরোধ রেকর্ডে যোগ হয়েছে — কর্মকর্তা পর্যালোচনা করবেন।" : "প্রত্যাহারের অনুরোধ যোগ হয়েছে — কর্মকর্তা পর্যালোচনা করবেন।");
      setCorrection("");
      setEntryId("");
      await load();
    } catch (e) {
      setMsg(errorLabelBn(e));
    }
  }

  async function submitLawyerChange() {
    if (!status?.caseId) return;
    setMsg("");
    try {
      await api("/api/lawyer/change-requests", { body: { caseId: status.caseId, reason: lawyerReason } });
      setMsg("আইনজীবী পরিবর্তনের অনুরোধ জমা হয়েছে — কর্মকর্তার মানব-পর্যালোচনার অপেক্ষায় (T1)।");
      setLawyerReason("");
    } catch (e) {
      setMsg(errorLabelBn(e));
    }
  }

  return (
    <div className="space-y-4">
      {session.role === "REPRESENTATIVE" ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          আপনি <b>প্রতিনিধি</b> হিসেবে দেখছেন (রিপন)। যা আবেদনকারী নিজে নিশ্চিত করেছেন তা আর যা আপনি জানিয়েছেন তা আলাদা চিহ্নিত।
          আপনার কর্তৃত্ব-পরিসর: আবেদন জানানো ও অবস্থা দেখা — সিদ্ধান্ত নয় (A2/G2)।
        </div>
      ) : null}

      {!status ? (
        <SectionCard kicker="অবস্থা ও পরবর্তী পদক্ষেপ" title="অবস্থা দেখুন" subtitle="স্মার্টফোন বা পড়ার সক্ষমতা ছাড়াও — ভয়েস/ইউএসএসডি দরজা খোলা আছে" icon={<Search className="h-4 w-4" aria-hidden />}>
          <div className="flex gap-2">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="APP-… বা CASE-…" className="h-9 max-w-xs text-sm" aria-label="রেফারেন্স" />
            <Button variant="outline" onClick={() => load(reference)}>দেখুন</Button>
          </div>
          {error ? <ErrorNote message={error} /> : (
            <p className="mt-2 text-[11px] text-muted-foreground">আপনার আবেদন আইডি দিয়ে অনুসন্ধান করুন — যেমন APP-2026-0001।</p>
          )}
        </SectionCard>
      ) : (
        <>
          <SectionCard kicker="সুযোগ-সীমিত নাগরিক পাঠ (G9)" title={`আপনার অবস্থা — ${status.reference}`} icon={<UserRound className="h-4 w-4" aria-hidden />} subtitle={status.caseId ? `কেস আইডি: ${status.caseId}` : "কেস রেকর্ড এখনো খোলা হয়নি"}>
            <div className="rounded-md bg-emerald-50 p-3">
              <p className="text-base font-bold text-primary">{status.headline}</p>
              <p className="mt-1 text-sm text-primary">{status.nextStep}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {status.safeContactActive ? <StateChip state="info" label="নিরাপদ যোগাযোগ-নিয়ম সক্রিয় (G3)" /> : null}
              {status.failedContactAttempts > 0 ? <StateChip state="warn" label={`${status.failedContactAttempts}টি ব্যর্থ যোগাযোগ-প্রচেষ্টা লগ হয়েছে`} /> : null}
              {status.nextHearing ? (
                <StateChip state="ok" label={`পরবর্তী হিয়ারিং: ${bnDateTime(status.nextHearing.date)} — ${status.nextHearing.location}`} />
              ) : null}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">ভ্রমণের আগে এই পাতা/ভয়েস রুট থেকে অবস্থা ও পরবর্তী পদক্ষেপ নিশ্চিত করুন — অনানুষ্ঠানিক তথ্যে নয় (A5)।</p>
          </SectionCard>

          <SectionCard kicker="G2 · কে কী জানিয়েছে" title="রেকর্ডের এন্ট্রি ও উৎস-প্রমাণ" icon={<History className="h-4 w-4" aria-hidden />} subtitle="কে কী জানিয়েছে — প্রতিনিধির জানানো বনাম আবেদনকারীর নিজের নিশ্চিতকরণ আলাদা">
            <ul className="space-y-2">
              {status.provenanceEntries.map((e) => (
                <li key={e.id} className={`rounded-md border p-2.5 text-xs ${e.withdrawn ? "border-border bg-muted/70 text-muted-foreground/70" : "border-border bg-card"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <ProvenanceBadge provenance={e.provenance} />
                    <span className="text-muted-foreground/70">{bnDateTime(e.createdAt)}</span>
                    {e.withdrawn ? <StateChip state="warn" label="প্রত্যাহৃত" /> : null}
                    {session.role === "CITIZEN" && !e.withdrawn ? (
                      <button className="ml-auto text-[11px] text-primary underline underline-offset-2" onClick={() => setEntryId(e.id)}>এটি সংশোধন/প্রত্যাহার</button>
                    ) : null}
                  </div>
                  <p className="mt-1.5 leading-relaxed text-foreground/85">{e.text}</p>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard kicker="A1 · মানব-পর্যালোচনার আগে কোনো মুছে-ফেলা নয়" title="নিজের তথ্য সংশোধন / প্রত্যাহার" icon={<PenLine className="h-4 w-4" aria-hidden />} subtitle="অনুরোধ রেকর্ডে যায় — কর্মকর্তার মানব-পর্যালোচনার আগে কিছু মুছে ফেলা/বদলানো হয় না">
            {entryId ? <p className="mb-2 text-[11px] text-primary">নির্বাচিত এন্ট্রি: {entryId.slice(0, 10)}…</p> : null}
            <Label className="text-xs">আপনার সংশোধন/প্রত্যাহারের বক্তব্য</Label>
            <textarea value={correction} onChange={(e) => setCorrection(e.target.value)} rows={3} className="mt-1 w-full rounded-md border border-border p-2 text-sm" aria-label="বক্তব্য" />
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => submitCorrection("CORRECTION_REQUEST")} disabled={correction.trim().length < 3}>সংশোধন-অনুরোধ</Button>
              <Button size="sm" variant="outline" onClick={() => submitCorrection("WITHDRAWAL_REQUEST")} disabled={correction.trim().length < 3}>প্রত্যাহার-অনুরোধ</Button>
              {entryId ? <Button size="sm" variant="ghost" onClick={() => setEntryId("")}>এন্ট্রি-নির্বাচন বাতিল</Button> : null}
            </div>
          </SectionCard>

          {status.caseId ? (
            <SectionCard kicker="T1 · কিউ → পর্যালোচনা → পুনর্নিয়োগ" title="আইনজীবী পরিবর্তনের অনুরোধ" icon={<UserCog className="h-4 w-4" aria-hidden />} subtitle="আবেদন → ডিএলএও কিউ → মানব-পর্যালোচনা → পুনর্নিয়োগ ও পরিশোধ-পুনর্মূল্যায়ন">
              <Label className="text-xs">কারণ</Label>
              <textarea value={lawyerReason} onChange={(e) => setLawyerReason(e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-border p-2 text-sm" aria-label="কারণ" />
              <Button size="sm" className="mt-2" variant="outline" onClick={submitLawyerChange} disabled={lawyerReason.trim().length < 5}>অনুরোধ জমা দিন</Button>
            </SectionCard>
          ) : null}

          <ErrorNote message={error} />
          {msg ? <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-primary">{msg}</div> : null}
        </>
      )}
    </div>
  );
}
