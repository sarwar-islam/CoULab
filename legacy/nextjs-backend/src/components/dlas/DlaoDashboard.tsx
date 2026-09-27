"use client";

// DLAO unified operational view (B1) — new / pending / overdue / priority with
// a REASON for every flag; drill into history; final prioritisation stays with
// the officer (G5). One view over the shared record — files, calls, messages
// are no longer separate registers.

import { useCallback, useEffect, useState } from "react";
import { api, errorLabelBn } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorNote, SectionCard, StateChip, PRIORITY_BN, STATUS_BN, bnDate, StatCard, EmptyState } from "@/components/dlas/shared";
import type { Nav, SessionCtx } from "@/components/dlas/DlasApp";
import { LayoutDashboard, Flame, AlarmClock, History, CircleCheck, Search } from "lucide-react";

interface CaseRow {
  id: string;
  status: string;
  caseType: string;
  priority: string;
  sensitivity: string;
  office: string;
  ageDays: number;
  openTaskCount: number;
  flags: { type: string; reason: string }[];
  application: { applicant: { fullName: string }; district: string };
  tasks: { id: string; title: string; reason: string | null; status: string; dueAt: string | null }[];
}

export default function DlaoDashboard({ session, nav }: { session: SessionCtx | null; nav: Nav }) {
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (query = "") => {
    setError("");
    try {
      const d = await api<{ cases: CaseRow[] }>(`/api/cases${query ? `?q=${encodeURIComponent(query)}` : ""}`);
      setRows(d.cases);
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const grouped = {
    urgent: rows.filter((r) => r.priority === "URGENT" || r.flags.some((f) => f.type === "PRIORITY")),
    overdue: rows.filter((r) => r.flags.some((f) => f.type === "OVERDUE" || f.type === "REFERRAL_NO_ACK" || f.type === "LAWYER_INACTIVE") && r.priority !== "URGENT"),
    ageing: rows.filter((r) => r.flags.some((f) => f.type === "AGEING") && r.priority !== "URGENT" && !r.flags.some((f) => f.type === "OVERDUE" || f.type === "LAWYER_INACTIVE")),
    pending: rows.filter((r) => r.flags.length === 0),
  };

  function Row({ r }: { r: CaseRow }) {
    return (
      <li className="rounded-md border border-border bg-card">
        <button className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-left text-xs hover:bg-muted/50" onClick={() => setExpanded(expanded === r.id ? null : r.id)} aria-expanded={expanded === r.id}>
          <span className="font-mono font-bold text-primary">{r.id}</span>
          <span className="font-semibold">{r.application.applicant.fullName}</span>
          <span className="text-muted-foreground">· {r.application.district}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{PRIORITY_BN[r.priority] ?? r.priority}</span>
          {r.sensitivity !== "NORMAL" ? <StateChip state="error" label="সংবেদনশীল" /> : null}
          {r.flags.map((f) => (
            <StateChip key={f.type} state={f.type === "PRIORITY" || f.type === "REFERRAL_NO_ACK" || f.type === "LAWYER_INACTIVE" ? "error" : "warn"} label={f.type} />
          ))}
          <span className="ml-auto text-muted-foreground/70">{expanded === r.id ? "▲" : "▼"} {r.openTaskCount} কার্য</span>
        </button>
        {expanded === r.id ? (
          <div className="border-t border-border/70 px-3 py-2.5 text-xs">
            <p className="font-semibold text-foreground/85">পতাকার কারণসমূহ (B1: প্রতিটি পতাকার কারণ দৃশ্যমান):</p>
            <ul className="mt-1 space-y-1 text-muted-foreground">
              {r.flags.length === 0 ? <li>কোনো পতাকা নেই — স্বাভাবিক প্রবাহ।</li> : null}
              {r.flags.map((f) => (
                <li key={f.type}>• <b>{f.type}:</b> {f.reason}</li>
              ))}
            </ul>
            <p className="mt-2 font-semibold text-foreground/85">খোলা কার্য:</p>
            <ul className="mt-1 space-y-1 text-muted-foreground">
              {r.tasks.length === 0 ? <li>কোনো খোলা কার্য নেই।</li> : null}
              {r.tasks.slice(0, 5).map((t) => (
                <li key={t.id}>• {t.title} {t.dueAt ? `(সময়সীমা ${bnDate(t.dueAt)})` : ""} {t.reason ? `— ${t.reason}` : ""}</li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => nav("case", { id: r.id })}>রেকর্ড খুলুন</Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => nav("triage")}>T8 ট্রায়াজ</Button>
            </div>
          </div>
        ) : null}
      </li>
    );
  }

  return (
    <div className="space-y-4">
      <SectionCard
        kicker="B1 · ইউনিফাইড অপারেশন"
        title="ডিএলএও কার্য-দৃশ্য"
        subtitle="নতুন, অসম্পূর্ণ, জরুরি, অপেক্ষমাণ ও সময়সীমা-অতিক্রান্ত — এক দৃশ্যে, প্রতিটি পতাকার কারণসহ; চূড়ান্ত অগ্রাধিকার কর্মকর্তার (G5)"
        icon={<LayoutDashboard className="h-4 w-4" aria-hidden />}
        actions={
          <div className="flex gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="নাম/আইডি খুঁজুন" className="h-8 w-44 text-xs" aria-label="খুঁজুন" />
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => load(q)}><Search className="h-3.5 w-3.5" aria-hidden />খুঁজুন</Button>
          </div>
        }
      >
        <ErrorNote message={error} />
        <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatCard label="জরুরি / অগ্রাধিকার" value={grouped.urgent.length} tone="danger" icon={<Flame className="h-4 w-4" aria-hidden />} />
          <StatCard label="সময়সীমা-অতিক্রান্ত / অনুসরণ" value={grouped.overdue.length} tone="warn" icon={<AlarmClock className="h-4 w-4" aria-hidden />} />
          <StatCard label="দীর্ঘস্থায়ী (ageing)" value={grouped.ageing.length} tone="gold" icon={<History className="h-4 w-4" aria-hidden />} />
          <StatCard label="অপেক্ষমাণ (স্বাভাবিক)" value={grouped.pending.length} icon={<CircleCheck className="h-4 w-4" aria-hidden />} />
        </div>
        <div className="space-y-4">
          {[
            ["জরুরি / অগ্রাধিকার", grouped.urgent, "error"],
            ["সময়সীমা-অতিক্রান্ত / অনুসরণ", grouped.overdue, "warn"],
            ["দীর্ঘস্থায়ী (ageing)", grouped.ageing, "info"],
            ["অপেক্ষমাণ (স্বাভাবিক)", grouped.pending, "ok"],
          ].map(([title, list, tone]) => (
            <div key={title as string}>
              <p className="mb-1.5 text-xs font-bold text-muted-foreground">
                {title as string} <span className="font-normal text-muted-foreground/70">({(list as CaseRow[]).length})</span>
              </p>
              {(list as CaseRow[]).length === 0 ? <EmptyState message="খালি — এই গোষ্ঠীতে কোনো কেস নেই।" /> : (
                <ul className="space-y-1.5">{(list as CaseRow[]).slice(0, 12).map((r) => <Row key={r.id} r={r} />)}</ul>
              )}
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
