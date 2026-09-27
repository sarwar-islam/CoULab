"use client";

// Application review inbox — verification/review: start review, request info,
// reject (human decision + reason), accept (mints Case ID — the backbone
// transition). Checklist comparison shown per case type (T6/B4 baseline).

import { useCallback, useEffect, useState } from "react";
import { api, errorLabelBn } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorNote, OverrideBox, ProvenanceBadge, SectionCard, StateChip, STATUS_BN, bnDateTime } from "@/components/dlas/shared";
import type { Nav, SessionCtx } from "@/components/dlas/DlasApp";
import { ClipboardCheck } from "lucide-react";

interface AppRow {
  id: string;
  status: string;
  caseType: string;
  narrative: string;
  district: string;
  channel: string;
  urgencyFlag: boolean;
  sensitiveFlag: boolean;
  createdAt: string;
  caseId: string | null;
  applicant: { fullName: string; district: string; primaryPhone: string | null; contactNote: string | null };
  entries: { id: string; provenance: string; text: string; withdrawn: boolean }[];
  documents: { id: string; title: string; status: string }[];
}

export default function ApplicationInbox({ session, nav }: { session: SessionCtx | null; nav: Nav }) {
  const [rows, setRows] = useState<AppRow[]>([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const d = await api<{ applications: AppRow[] }>(`/api/applications${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      setRows(d.applications);
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }, [q]);

  useEffect(() => { load(); }, [load]);

  async function act(id: string, action: string, extra: Record<string, unknown> = {}) {
    setError("");
    setMsg("");
    try {
      await api(`/api/applications/${id}`, { body: { action, ...extra } });
      setMsg(`কার্য সম্পন্ন: ${action}`);
      await load();
    } catch (e) {
      setError(errorLabelBn(e));
    }
  }

  return (
    <div className="space-y-4">
      <SectionCard
        kicker="মানব-সিদ্ধান্ত গেট"
        title="আবেদন-পর্যালোচনা"
        icon={<ClipboardCheck className="h-4 w-4" aria-hidden />}
        subtitle="যাচাই → অতিরিক্ত-তথ্য / প্রত্যাখ্যান (মানব-সিদ্ধান্ত) → গ্রহণ (Case ID তৈরি — ব্যাকবোন রূপান্তর)"
        actions={
          <div className="flex gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="খুঁজুন" className="h-8 w-40 text-xs" />
            <Button size="sm" variant="outline" onClick={load}>রিফ্রেশ</Button>
          </div>
        }
      >
        <ErrorNote message={error} />
        {msg ? <div className="mb-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs text-primary">{msg}</div> : null}
        <ul className="space-y-2">
          {rows.slice(0, 30).map((r) => (
            <li key={r.id} className="rounded-md border border-border bg-card">
              <button className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-left text-xs hover:bg-muted/50" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                <span className="font-mono font-bold text-primary">{r.id}</span>
                <span className="font-semibold">{r.applicant.fullName}</span>
                <span className="text-muted-foreground">· {r.district} · {bnDateTime(r.createdAt)}</span>
                <StateChip state={r.status === "REJECTED" ? "error" : r.status === "CONVERTED_TO_CASE" ? "ok" : "info"} label={STATUS_BN[r.status] ?? r.status} />
                {r.urgencyFlag ? <StateChip state="warn" label="জরুরি" /> : null}
                {r.sensitiveFlag ? <StateChip state="error" label="সংবেদনশীল" /> : null}
                <span className="ml-auto text-muted-foreground/70">{open === r.id ? "▲" : "▼"}</span>
              </button>
              {open === r.id ? (
                <div className="border-t border-border/70 px-3 py-3 text-xs">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="mb-1 font-semibold text-foreground/85">নথি ({r.documents.length}):</p>
                      <ul className="space-y-0.5 text-muted-foreground">
                        {r.documents.length === 0 ? <li className="text-muted-foreground/70">কোনো নথি নেই</li> : null}
                        {r.documents.map((d) => <li key={d.id}>• {d.title} <StateChip state={d.status === "CURRENT" ? "ok" : "warn"} label={d.status === "CURRENT" ? "চলতি" : d.status === "UNCLEAR" ? "অস্পষ্ট" : "প্রতিস্থাপিত"} /></li>)}
                      </ul>
                    </div>
                    <div>
                      <p className="mb-1 font-semibold text-foreground/85">বিবরণ-এন্ট্রি ও উৎস-প্রমাণ:</p>
                      <ul className="space-y-1">
                        {r.entries.map((e) => (
                          <li key={e.id} className="rounded border border-border/70 p-1.5">
                            <ProvenanceBadge provenance={e.provenance} />
                            <p className={`mt-1 leading-relaxed ${e.withdrawn ? "text-muted-foreground/70 line-through" : "text-foreground/85"}`}>{e.text}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <p className="mt-2 text-muted-foreground">যোগাযোগ: {r.applicant.primaryPhone ?? "—"} {r.applicant.contactNote ? `(${r.applicant.contactNote})` : ""}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.status === "SUBMITTED" ? <Button size="sm" variant="outline" onClick={() => act(r.id, "start_review")}>পর্যালোচনা শুরু</Button> : null}
                    {r.status === "UNDER_REVIEW" || r.status === "MORE_INFO_NEEDED" ? (
                      <>
                        <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={() => act(r.id, "accept")}>অনুমোদন → কেস তৈরি (Case ID)</Button>
                        <Button size="sm" variant="outline" onClick={() => { const reason = window.prompt("অতিরিক্ত কী তথ্য প্রয়োজন?"); if (reason) act(r.id, "request_info", { reason }); }}>অতিরিক্ত তথ্য চান</Button>
                        <div className="w-full">
                          <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="প্রত্যাখ্যানের কারণ (মানব-সিদ্ধান্ত — বাধ্যতামূলক)" className="h-8 text-xs" />
                        </div>
                        <Button size="sm" variant="destructive" disabled={rejectReason.trim().length < 5} onClick={() => { act(r.id, "reject", { reason: rejectReason }); setRejectReason(""); }}>
                          প্রত্যাখ্যান (কারণসহ)
                        </Button>
                      </>
                    ) : null}
                    {r.caseId ? <Button size="sm" variant="outline" onClick={() => nav("case", { id: r.caseId! })}>কেস রেকর্ড</Button> : null}
                  </div>
                  <OverrideBox
                    title="সিস্টেম/এআই সুপারিশ ওভাররাইড করতে?"
                    note="যেকোনো সিস্টেম-সুপারিশ কর্মকর্তা পর্যালোচনা/সংশোধন করতে পারেন; ওভাররাইড কারণসহ অডিটে থাকে (G5)।"
                    actionLabel="ওভাররাইড নিশ্চিত করুন"
                    onConfirm={async (reason) => {
                      await api("/api/audit", { method: "PATCH" }).catch(() => undefined);
                      await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applicationId: r.id, title: `মানব-ওভাররাইড নোট: ${reason}`, type: "REVIEW", ownerRole: "DLAO_OFFICER", reason, sourceModule: "G5_OVERRIDE" }) });
                      setMsg("ওভাররাইড নোট কার্য হিসেবে লগ হয়েছে (অডিটে দৃশ্যমান)।");
                    }}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
