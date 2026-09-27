"use client";

// ============================================================================
// Admin center — B7 reports from already-captured data, G10 audit trail,
// T9 sync/conflict review, T10 low-bandwidth PWA panel.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { api, errorLabelBn } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { ErrorNote, SectionCard, StateChip, bnDateTime } from "@/components/dlas/shared";
import type { Nav, SessionCtx } from "@/components/dlas/DlasApp";
import { BarChart3, ScrollText, CloudOff, Smartphone } from "lucide-react";

// ----------------------------- B7 REPORTS -----------------------------
function ReportsDocket() {
  const [report, setReport] = useState<{
    generatedAt: string;
    report: {
      applications: { total: number; pendingReview: number; accepted: number; rejected: number; acceptanceRate: number };
      cases: { total: number; closed: number; medianDaysToClosure: number | null; medianOpenAgeDays: number };
      workload: { openTasks: number; overdueTasks: number; overdueRate: number };
      referrals: { sent: number; acknowledged: number; ackRate: number };
    };
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<typeof report>("/api/reports").then(setReport).catch((e) => setError(errorLabelBn(e)));
  }, []);

  return (
    <SectionCard kicker="B7 · রেকর্ড থেকেই" title="রুটিন রিপোর্ট / পরিসংখ্যান" icon={<BarChart3 className="h-4 w-4" aria-hidden />} subtitle="প্রতিটি সংখ্যা কেস-রেকর্ডে ইতিমধ্যে ধারণকৃত তথ্য থেকে — একবার ধারণ, বারবার ব্যবহার; পুনঃপ্রবেশ নেই">
      <ErrorNote message={error} />
      {report ? (
        <div className="space-y-3 text-xs">
          <p className="text-muted-foreground/70">তৈরি: {bnDateTime(report.generatedAt)}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["মোট আবেদন", report.report.applications.total],
              ["পর্যালোচনাধীন", report.report.applications.pendingReview],
              ["অনুমোদিত", report.report.applications.accepted],
              ["অনুমোদন-হার", `${report.report.applications.acceptanceRate}%`],
              ["মোট কেস", report.report.cases.total],
              ["বন্ধ", report.report.cases.closed],
              ["চূড়ান্ত-বন্ধের মধ্যক দিন", report.report.cases.medianDaysToClosure ?? "—"],
              ["খোলা কেসের মধ্যক বয়স", `${report.report.cases.medianOpenAgeDays} দিন`],
              ["খোলা কার্য", report.report.workload.openTasks],
              ["অতিরিক্ত কার্য", report.report.workload.overdueTasks],
              ["অতিরিক্ত-হার", `${report.report.workload.overdueRate}%`],
              ["রেফারেল স্বীকৃতি-হার", `${report.report.referrals.ackRate}%`],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-md border border-border bg-card p-3 text-center">
                <div className="text-xl font-bold text-primary">{value as string}</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">{label as string}</div>
              </div>
            ))}
          </div>
          <p className="rounded-md bg-muted/50 p-2.5 text-[11px] text-muted-foreground">
            কর্মী/ফাইল বদলেও জ্ঞান হারায় না — সার্চ ও সংস্করণ-ইতিহাসসহ কাঠামোবদ্ধ রেকর্ড (B7)। এই ভিউটি একই ডেটা-স্পাইন থেকে তৈরি।
          </p>
        </div>
      ) : <p className="text-xs text-muted-foreground/70">লোড হচ্ছে…</p>}
    </SectionCard>
  );
}

// ----------------------------- G10 AUDIT -----------------------------
function AuditDocket() {
  const [entries, setEntries] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");

  interface AuditRow {
    id: string; actorName: string; actorRole: string; channel: string; action: string; entityType: string; entityId: string;
    caseId: string | null; applicationId: string | null; after: string | null; reason: string | null; onWhoseAuthority: string | null; createdAt: string;
  }

  const load = useCallback(async (query = "") => {
    try {
      const d = await api<{ entries: AuditRow[]; total: number }>(`/api/audit${query ? `?action=${encodeURIComponent(query)}` : ""}`);
      setEntries(d.entries);
      setTotal(d.total);
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <SectionCard
      kicker="G10 · পুনর্গঠনযোগ্য" title={`সম্পূর্ণ অডিট ট্রেইল (${total} এন্ট্রি)`} icon={<ScrollText className="h-4 w-4" aria-hidden />}
      subtitle="কে কী করল, কখন, কোন চ্যানেল/ভূমিকায়, কার কর্তৃত্বে — পুনর্গঠনযোগ্য"
      actions={
        <div className="flex gap-1.5">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="action দিয়ে ফিল্টার (যেমন T8_)" className="h-8 w-40 rounded-md border border-border px-2 text-xs" aria-label="অডিট ফিল্টার" />
          <Button size="sm" variant="outline" onClick={() => load(q)}>ফিল্টার</Button>
        </div>
      }
    >
      <ErrorNote message={error} />
      <div className="max-h-[520px] overflow-x-auto overflow-y-auto rounded-md border border-border">
        <table className="w-full min-w-[760px] text-left text-[11px]">
          <thead className="sticky top-0 bg-muted/70 text-muted-foreground">
            <tr><th className="px-2 py-1.5">সময়</th><th className="px-2 py-1.5">অ্যাকশন</th><th className="px-2 py-1.5">অভিনেতা</th><th className="px-2 py-1.5">চ্যানেল</th><th className="px-2 py-1.5">টার্গেট</th><th className="px-2 py-1.5">কর্তৃত্ব / কারণ</th></tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-border/70 align-top">
                <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">{bnDateTime(e.createdAt)}</td>
                <td className="px-2 py-1.5 font-semibold">{e.action}{e.after ? <span className="block font-normal text-muted-foreground">→ {e.after}</span> : null}</td>
                <td className="px-2 py-1.5">{e.actorName}<span className="block text-muted-foreground/70">{e.actorRole}</span></td>
                <td className="px-2 py-1.5 text-muted-foreground">{e.channel}</td>
                <td className="px-2 py-1.5 font-mono text-[10px]">{e.entityId}{e.caseId ? <span className="block text-primary">{e.caseId}</span> : null}</td>
                <td className="px-2 py-1.5 text-muted-foreground">{e.onWhoseAuthority ?? "—"}{e.reason ? <span className="block text-muted-foreground">কারণ: {e.reason}</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ----------------------------- T9 SYNC REVIEW -----------------------------
function SyncDocket() {
  interface Rec { id: string; tempUuid: string; deviceId: string; payloadType: string; status: string; conflictWithId: string | null; resolution: string | null; integrityHash: string; syncedEntityId: string | null; createdAt: string }
  const [rows, setRows] = useState<Rec[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api<{ records: Rec[] }>("/api/sync");
      setRows(d.records);
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function resolve(recordId: string, resolution: "APPLY_OFFLINE_EDIT" | "KEEP_SERVER_COPY") {
    const note = window.prompt("সিদ্ধান্তের নোট (বাধ্যতামূলক):");
    if (!note) return;
    try {
      await api("/api/sync", { method: "PATCH", body: { recordId, resolution, note } });
      await load();
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }

  return (
    <SectionCard kicker="T9 · সংঘর্ষ মানুষের কাছে" title="অফলাইন-প্রথম সিংক ও সংঘর্ষ-পর্যালোচনা" icon={<CloudOff className="h-4 w-4" aria-hidden />} subtitle="temp UUID আইডেম্পোটেন্সি; সংঘর্ষ মানুষের কাছে — নীরব ওভাররাইট নয়; অখণ্ডতা-হ্যাশ যাচাই">
      <ErrorNote message={error} />
      <ul className="space-y-1.5 text-xs">
        {rows.map((r) => (
          <li key={r.id} className="rounded-md border border-border bg-card p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] text-muted-foreground">{r.tempUuid.slice(0, 13)}…</span>
              <span className="rounded bg-muted px-1.5 text-[10px]">{r.payloadType} · {r.deviceId}</span>
              <StateChip state={r.status === "SYNCED" ? "ok" : r.status === "CONFLICT" ? "error" : "warn"} label={r.status === "SYNCED" ? `সিংক → ${r.syncedEntityId ?? "—"}` : r.status === "CONFLICT" ? "সংঘর্ষ — মানব-পর্যালোচনা" : "কিউতে"} />
              <span className="text-muted-foreground/70">{bnDateTime(r.createdAt)}</span>
              {r.integrityHash ? <span className="font-mono text-[10px] text-muted-foreground/70">hash {r.integrityHash.slice(0, 10)}…</span> : null}
            </div>
            {r.status === "CONFLICT" && !r.resolution ? (
              <div className="mt-1.5 flex gap-1.5">
                <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => resolve(r.id, "APPLY_OFFLINE_EDIT")}>অফলাইন-সম্পাদনা প্রয়োগ</Button>
                <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => resolve(r.id, "KEEP_SERVER_COPY")}>সার্ভার-কপি রাখুন</Button>
              </div>
            ) : null}
            {r.resolution ? <p className="mt-1 text-[10px] text-muted-foreground">সমাধান: {r.resolution}</p> : null}
          </li>
        ))}
        {rows.length === 0 ? <li className="text-muted-foreground/70">রেকর্ড নেই — ইউডিসি ভিউ থেকে অফলাইন আবেদন সিংক করুন।</li> : null}
      </ul>
    </SectionCard>
  );
}

// ----------------------------- T10 PWA INFO -----------------------------
function PwaDocket() {
  const [swStatus, setSwStatus] = useState("জানা যায়নি");
  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((r) => setSwStatus(r ? "নিবন্ধিত ও সক্রিয়" : "ব্রাউজার সমর্থন করে — নিবন্ধন চলছে/লোডে হবে"));
    } else {
      setSwStatus("এই ব্রাউজারে service worker নেই");
    }
  }, []);

  return (
    <SectionCard kicker="T10 · নিরাপদ ক্যাশ-নীতি" title="লো-ব্যান্ডউইথ PWA" icon={<Smartphone className="h-4 w-4" aria-hidden />} subtitle="ইনস্টলেবল; নিরাপদ অফলাইন-ক্যাশ; অ্যাডাপটিভ লাইট মোড; থ্রটলড নেটওয়ার্কে পরীক্ষা">
      <div className="space-y-2.5 text-xs text-foreground/85">
        <p><b>সার্ভিস ওয়ার্কার:</b> {swStatus}</p>
        <p><b>লাইট মোড:</b> উপরের হেডারে "☀ লাইট মোড" চালু করুন — হালকা রেন্ডারিং চালু হবে (কম-মেমোরি অ্যান্ড্রয়েড ডিভাইসের জন্য)। একই থ্রটলড প্রোফাইলে সাধারণ ও লাইট মোডের লোড-পার্থক্য তুলনা করুন (ব্রাউজার DevTools → Network throttling: Slow 3G)।</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>শুধু অ্যাপ-শেল (স্ট্যাটিক অ্যাসেট) ক্যাশ হয় — কেস-ডেটা/এপিআই প্রতিক্রিয়া ক্যাশ হয় না।</li>
          <li>শেয়ার্ড ডিভাইসে (ইউডিসি) সংবেদনশীল ডেটা অবশিষ্ট রাখা হয় না; লগআউটে সেশন কুকি মুছে যায়।</li>
          <li>অফলাইনে জমা ইনপুট শুধু স্পষ্ট কিউ-আইটেম হিসেবে লোকালে থাকে (T9) — ইউজার দেখতে পারেন ও মুছতে পারেন।</li>
          <li>থ্রটল প্রোফাইল: Slow 3G + 4× CPU slowdown ধরে বাংলা টেক্সট-প্রথম ইন্টারফেস ব্যবহারযোগ্য থাকে।</li>
        </ul>
        <p className="rounded-md bg-muted/50 p-2.5 text-[11px] text-muted-foreground">হুমকি-মডেল/সীমা: ক্যাশ-নীতি ইচ্ছাকৃতভাবে রক্ষণশীল; পুরো অফলাইন কেস-ম্যানেজমেন্ট দাবি করা হয় না — ইউডিসি ইনটেক ও অবস্থা-দরজার অফলাইন-সহনশীলতাই লক্ষ্য।</p>
      </div>
    </SectionCard>
  );
}

export default function AdminCenter({ session, nav, view }: { session: SessionCtx | null; nav: Nav; view: string }) {
  switch (view) {
    case "reports": return <ReportsDocket />;
    case "audit": return <AuditDocket />;
    case "offline-sync": return <SyncDocket />;
    case "pwa-info": return <PwaDocket />;
    default: return <p>অজানা ভিউ।</p>;
  }
}
