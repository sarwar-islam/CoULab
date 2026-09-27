"use client";

// ============================================================================
// Coverage Index — the 23 mandatory items, each a LIVE deep-link to the exact
// view/state that demonstrates it, plus live audit evidence counts (G10 by
// construction).
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { api, errorLabelBn } from "@/lib/client/api";
import { ErrorNote, SectionCard, StateChip } from "@/components/dlas/shared";
import { Input } from "@/components/ui/input";
import type { Nav, SessionCtx } from "@/components/dlas/DlasApp";
import { ListChecks, Database } from "lucide-react";

interface Item {
  id: string;
  title: string;
  titleBn: string;
  view: string;
  category: "A" | "B" | "C";
}

export default function CoverageIndex({ nav, session }: { nav: Nav; session: SessionCtx | null }) {
  const [items, setItems] = useState<Item[]>([]);
  const [auditEvidence, setAuditEvidence] = useState<Record<string, number>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("All");
  const [q, setQ] = useState("");

  useEffect(() => {
    api<{ items: Item[]; counts: Record<string, number>; auditEvidence: Record<string, number> }>("/api/coverage")
      .then((d) => {
        setItems(d.items);
        setCounts(d.counts);
        setAuditEvidence(d.auditEvidence);
      })
      .catch((e) => setError(errorLabelBn(e)));
  }, []);

  const shown = useMemo(
    () =>
      items.filter(
        (i) =>
          (filter === "All" || i.category === filter) &&
          (q === "" || `${i.id} ${i.title} ${i.titleBn}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [items, filter, q],
  );

  return (
    <div className="space-y-4">
      <SectionCard
        kicker="G1/G10 · লাইভ ট্রেসেবিলিটি"
        title="কভারেজ ইনডেক্স — ২৩টি বাধ্যতামূলক আইটেম"
        icon={<ListChecks className="h-4 w-4" aria-hidden />}
        subtitle="প্রতিটি আইটেম লাইভ ডিপ-লিংক + অডিট-প্রমাণ — এক রেকর্ড, দ্বীপ নয় (G1/G10)"
        actions={
          <div className="flex gap-1.5">
            {["All", "A", "B", "C"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md border px-2 py-1 text-[11px] ${filter === f ? "border-primary/45 bg-primary text-white" : "border-border bg-white text-muted-foreground"}`}
              >
                {f === "All" ? "সব" : f === "A" ? "নাগরিক (A)" : f === "B" ? "কর্মী (B)" : "টেকনিক্যাল (C)"}
              </button>
            ))}
          </div>
        }
      >
        <Input placeholder="আইডি বা শব্দ খুঁজুন — যেমন T4, ময়ূরী…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3 h-9 text-sm" aria-label="কভারেজ খুঁজুন" />
        <ErrorNote message={error} />
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="bg-muted/70 text-muted-foreground">
              <tr>
                <th className="px-3 py-2">আইডি</th>
                <th className="px-3 py-2">আইটেম</th>
                <th className="px-3 py-2">সরাসরি প্রদর্শনী</th>
                <th className="px-3 py-2">লাইভ অডিট-প্রমাণ</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.id} className="border-t border-border/70 hover:bg-primary/6">
                  <td className="px-3 py-2 font-mono font-bold text-primary">{i.id}</td>
                  <td className="px-3 py-2">
                    {i.titleBn}
                    <span className="block text-[10px] text-muted-foreground/70">{i.title}</span>
                  </td>
                  <td className="px-3 py-2">
                    <button className="rounded-md border border-emerald-700 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/8" onClick={() => nav(i.view, i.view.startsWith("case-") ? { id: i.view.replace("case-", "").toUpperCase() } : undefined)}>
                      খুলুন →
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <StateChip state={(auditEvidence[i.id] ?? 0) > 0 ? "ok" : "warn"} label={`${auditEvidence[i.id] ?? 0} অডিট এন্ট্রি`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!session ? <p className="mt-2 text-[11px] text-muted-foreground">লগইন করলে লাইভ রেকর্ড-ভিত্তিক ডিপ-লিংকগুলো আরও নির্দিষ্ট অবস্থায় খুলবে।</p> : null}
      </SectionCard>

      <SectionCard kicker="এক সিস্টেমের প্রমাণ" title="লাইভ রেকর্ড-গণনা" icon={<Database className="h-4 w-4" aria-hidden />} subtitle="সব সংখ্যা একই শেয়ারড ডেটা-স্পাইন থেকে — প্রমাণ যে এটি এক সিস্টেম">
        <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-5 lg:grid-cols-10">
          {[
            ["applications", "আবেদন"], ["cases", "কেস"], ["entries", "রেকর্ড-এন্ট্রি"], ["consents", "সম্মতি"],
            ["contactRules", "যোগাযোগ-নিয়ম"], ["contactAttempts", "কল-প্রচেষ্টা"], ["tasks", "কার্য"], ["documents", "নথি"],
            ["referrals", "রেফারেল"], ["lawyerAssignments", "আইনজীবী-নিয়োগ"], ["lawyerChangeRequests", "আইনজীবী-পরিবর্তন"],
            ["mediationSessions", "মধ্যস্থতা"], ["settlementDrafts", "খসড়া"], ["signatureSessions", "স্বাক্ষর-সেশন"],
            ["incidentGroups", "ঘটনা-গ্রুপ"], ["duplicateCandidates", "ডুপ্লিকেট-প্রার্থী"], ["triageRuns", "ট্রায়াজ-রান"],
            ["offlineRecords", "অফলাইন-রেকর্ড"], ["intakeSessions", "ইনটেক-সেশন"], ["audits", "অডিট-এন্ট্রি"],
          ].map(([k, label]) => (
            <div key={k} className="rounded-md border border-border bg-card px-2 py-2">
              <div className="text-lg font-bold text-primary">{counts[k] ?? 0}</div>
              <div className="text-[10px] text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
