"use client";

// 16699 helpline console (B3) — shared case look-up on the SAME record as the
// DLAO + Bangla assisted intake that writes to the shared record, not a note.

import { useState } from "react";
import { api, errorLabelBn } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorNote, ProvenanceBadge, SectionCard, StateChip, STATUS_BN, bnDateTime } from "@/components/dlas/shared";
import type { Nav, SessionCtx } from "@/components/dlas/DlasApp";
import { Headset, PhoneIncoming, NotebookPen } from "lucide-react";

interface LookupResult {
  found: boolean;
  reference: string;
  caseId: string | null;
  status: string;
  headline: string;
  nextStep: string;
  safeContactActive: boolean;
  applicantName: string;
  provenanceEntries: { id: string; provenance: string; text: string; withdrawn: boolean; createdAt: string }[];
}

export default function HelplineConsole({ session, nav }: { session: SessionCtx | null; nav: Nav }) {
  const [ref, setRef] = useState("APP-2026-0001");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function lookup() {
    setError("");
    setMsg("");
    try {
      const d = await api<LookupResult>(`/api/status?reference=${encodeURIComponent(ref.trim())}`);
      setResult(d);
    } catch (e) {
      setResult(null);
      setError(errorLabelBn(e));
    }
  }

  async function addNote() {
    if (!result) return;
    setError("");
    try {
      // B3: the agent's note becomes a provenance-tagged entry on the SAME record
      await api("/api/entries", {
        body: {
          applicationId: result.reference,
          provenance: "STAFF_ENTERED",
          text: `[১৬৬৯৯ এজেন্ট নোট] ${note}`,
          statedByName: result.applicantName,
          channel: "HELPLINE",
          kind: "NOTE",
        },
      });
      setMsg("নোটটি একই রেকর্ডে যোগ হয়েছে (আলাদা নোট-সিস্টেম নয় — G1/B3)।");
      setNote("");
      await lookup();
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }

  return (
    <div className="space-y-4">
      <SectionCard kicker="B3 · শেয়ারড রেকর্ড লুকআপ" title="১৬৬৯৯ হেল্পলাইন কনসোল" icon={<Headset className="h-4 w-4" aria-hidden />} subtitle="একই রেকর্ড লুকআপ + বাংলা ইনটেক/অবস্থা — ডিএলএও যা দেখেন, এজেন্টও অনুমোদিত অংশটি দেখেন">
        <div className="flex flex-wrap gap-2">
          <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="APP-… / CASE-…" className="h-9 max-w-xs text-sm" aria-label="রেফারেন্স লুকআপ" />
          <Button className="bg-primary hover:bg-primary/90" onClick={lookup}>লুকআপ</Button>
          <Button variant="outline" onClick={() => nav("intake-chat")}>নতুন কথোপকথনমূলক ইনটেক (T5)</Button>
          <Button variant="outline" onClick={() => nav("voice")}>ভয়েস-দরজা সিমুলেটর</Button>
        </div>
        <ErrorNote message={error} />
        {result ? (
          <div className="mt-3 space-y-3">
            <div className="rounded-md bg-emerald-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-primary">{result.applicantName} — {result.reference}{result.caseId ? ` / ${result.caseId}` : ""}</p>
                <StateChip state="info" label={STATUS_BN[result.status] ?? result.status} />
                {result.safeContactActive ? <StateChip state="warn" label="নিরাপদ যোগাযোগ-নিয়ম সক্রিয় — নম্বর/সময় মেনে কল" /> : null}
              </div>
              <p className="mt-1 text-sm text-primary">{result.headline} — {result.nextStep}</p>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">রেকর্ডের সাম্প্রতিক এন্ট্রি (উৎস-প্রমাণসহ):</p>
              <ul className="space-y-1.5">
                {result.provenanceEntries.map((e) => (
                  <li key={e.id} className="rounded-md border border-border bg-card p-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <ProvenanceBadge provenance={e.provenance} />
                      <span className="text-muted-foreground/70">{bnDateTime(e.createdAt)}</span>
                      {e.withdrawn ? <StateChip state="warn" label="প্রত্যাহৃত" /> : null}
                    </div>
                    <p className="mt-1 text-foreground/85">{e.text}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">কলের নোট যোগ করুন (একই রেকর্ডে):</p>
              <div className="flex gap-2">
                <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-9 flex-1 text-sm" placeholder="যা কলার বললেন…" />
                <Button variant="outline" onClick={addNote} disabled={note.trim().length < 3}>যোগ করুন</Button>
              </div>
            </div>
            {msg ? <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-primary">{msg}</div> : null}
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
