"use client";

// ============================================================================
// Shared UI primitives for DLAS — "ন্যায় / Nyaya Institutional" premium set.
// Provenance badges (G2), illustrative-data banner, visible state chips,
// override-with-reason dialog pattern (G5), page headers, stat cards and the
// Bangla-first labels. All views compose from here for a consistent look.
// ============================================================================

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { PROVENANCE_LABELS_BN, PROVENANCE_LABELS_EN, ILLUSTRATIVE_BANNER } from "@/lib/constants";
import { useEffect, useState, type ReactNode } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  CircleCheck,
  UserRoundCheck,
  UserRound,
  Languages,
  Keyboard,
  Sparkles,
  Inbox,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* G2 — provenance badge rendered wherever data can have mixed origin. */
/* ------------------------------------------------------------------ */
const PROVENANCE_STYLE: Record<string, string> = {
  APPLICANT_CONFIRMED: "bg-emerald-50 text-emerald-900 border-emerald-300/70",
  REPRESENTATIVE_REPORTED: "bg-amber-50 text-amber-900 border-amber-300/70",
  INTERMEDIARY_TRANSLATED: "bg-orange-50 text-orange-900 border-orange-300/70",
  STAFF_ENTERED: "bg-stone-50 text-stone-800 border-stone-300/70",
  AI_INFERRED: "bg-violet-50 text-violet-900 border-violet-300/70",
};
const PROVENANCE_ICON: Record<string, ReactNode> = {
  APPLICANT_CONFIRMED: <UserRoundCheck className="h-3 w-3" aria-hidden />,
  REPRESENTATIVE_REPORTED: <UserRound className="h-3 w-3" aria-hidden />,
  INTERMEDIARY_TRANSLATED: <Languages className="h-3 w-3" aria-hidden />,
  STAFF_ENTERED: <Keyboard className="h-3 w-3" aria-hidden />,
  AI_INFERRED: <Sparkles className="h-3 w-3" aria-hidden />,
};

export function ProvenanceBadge({ provenance, lang = "bn" }: { provenance: string; lang?: "bn" | "en" }) {
  const label = (lang === "bn" ? PROVENANCE_LABELS_BN : PROVENANCE_LABELS_EN)[provenance] ?? provenance;
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 text-[11px] font-medium",
        PROVENANCE_STYLE[provenance] ?? "bg-stone-50 text-stone-800 border-stone-300",
      )}
      title="উৎস-প্রমাণ (provenance)"
    >
      {PROVENANCE_ICON[provenance] ?? null}
      {label}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/* Responsible-Design rule: every screen carrying sample data shows it. */
/* ------------------------------------------------------------------ */
export function DataBanner() {
  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-amber-300/80 bg-gradient-to-br from-amber-50 to-amber-100/60 px-3 py-2 text-[12px] leading-relaxed text-amber-900"
      role="note"
    >
      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{ILLUSTRATIVE_BANNER}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SectionCard — the standard panel with optional kicker + icon.        */
/* ------------------------------------------------------------------ */
export function SectionCard({
  title,
  subtitle,
  children,
  actions,
  id,
  icon,
  kicker,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
  id?: string;
  icon?: ReactNode;
  kicker?: string;
}) {
  return (
    <Card
      id={id}
      className="overflow-hidden rounded-xl border-border/80 shadow-[0_1px_3px_oklch(0.3_0.04_168/0.06),0_8px_24px_-16px_oklch(0.3_0.04_168/0.12)]"
    >
      <CardHeader className="border-b border-border/60 bg-gradient-to-b from-muted/50 to-transparent pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-start gap-2.5">
            {icon ? (
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary ring-1 ring-primary/15">
                {icon}
              </span>
            ) : null}
            <div>
              {kicker ? <span className="kicker mb-0.5">{kicker}</span> : null}
              <CardTitle className="font-display text-[16px] font-bold leading-snug text-foreground">{title}</CardTitle>
              {subtitle ? <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-muted-foreground">{subtitle}</p> : null}
            </div>
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div> : null}
        </div>
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* PageHeader — view-level header: kicker chip, display title, actions. */
/* ------------------------------------------------------------------ */
export function PageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/70 pb-3">
      <div className="min-w-0">
        {kicker ? <span className="kicker mb-1">{kicker}</span> : null}
        <h1 className="font-display text-xl font-bold leading-snug text-foreground sm:text-[22px]">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* StatCard — number + label + optional hint, with tone accent.         */
/* ------------------------------------------------------------------ */
const STAT_TONE: Record<string, string> = {
  default: "text-primary",
  gold: "text-gold-deep",
  warn: "text-amber-700",
  danger: "text-red-700",
};
export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "gold" | "warn" | "danger";
  icon?: ReactNode;
}) {
  return (
    <div className="card-lift rounded-xl border border-border/80 bg-card px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium leading-snug text-muted-foreground">{label}</p>
        {icon ? <span className="text-primary/50">{icon}</span> : null}
      </div>
      <p className={cn("mt-1 font-display text-[22px] font-bold leading-[1.1]", STAT_TONE[tone])}>{value}</p>
      {hint ? <p className="mt-1 text-[10.5px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* StateChip — status pill with a semantic dot.                         */
/* ------------------------------------------------------------------ */
export function StateChip({ state, label }: { state: "ok" | "warn" | "error" | "info"; label: string }) {
  const styles = {
    ok: "bg-emerald-50 text-emerald-900 border-emerald-300/70",
    warn: "bg-amber-50 text-amber-900 border-amber-300/70",
    error: "bg-red-50 text-red-900 border-red-300/70",
    info: "bg-teal-50 text-teal-900 border-teal-300/70",
  } as const;
  const dot = {
    ok: "bg-emerald-500",
    warn: "bg-amber-500",
    error: "bg-red-500",
    info: "bg-teal-500",
  } as const;
  return (
    <Badge variant="outline" className={cn("gap-1.5 text-[11px] font-medium", styles[state])}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dot[state])} aria-hidden />
      {label}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/* G5 — every consequential system output ships an override control that
 * requires a human reason; the reason is written to the audit trail.   */
/* ------------------------------------------------------------------ */
export function OverrideBox({
  title,
  actionLabel,
  onConfirm,
  note,
}: {
  title: string;
  actionLabel: string;
  onConfirm: (reason: string) => Promise<void> | void;
  note?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-dashed border-gold/50 bg-gradient-to-br from-amber-50/80 to-transparent p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-gold-deep" aria-hidden />
        {title}
      </p>
      {note ? <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{note}</p> : null}
      {!open ? (
        <button
          className="mt-2 rounded-md border border-gold-deep/40 bg-white px-3 py-1.5 text-xs font-semibold text-gold-deep transition-colors hover:bg-amber-50"
          onClick={() => setOpen(true)}
        >
          মানব-পর্যালোচনা / ওভাররাইড
        </button>
      ) : (
        <div className="mt-2 space-y-2">
          <Label className="text-xs">কারণ (বাধ্যতামূলক — অডিটে সংরক্ষিত হবে)</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="মানব-সিদ্ধান্তের কারণ লিখুন…" className="h-8 bg-white text-xs" aria-label="ওভাররাইডের কারণ" />
          {error ? <p className="text-[11px] text-red-700">{error}</p> : null}
          <div className="flex gap-2">
            <button
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              disabled={busy || reason.trim().length < 3}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await onConfirm(reason.trim());
                  setOpen(false);
                  setReason("");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "ব্যর্থ");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "…" : actionLabel}
            </button>
            <button className="rounded-md border border-border bg-white px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted" onClick={() => setOpen(false)}>
              বাতিল
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Visible failure/success states (never a silent spinner).             */
/* ------------------------------------------------------------------ */
export function ErrorNote({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-2 flex items-start gap-2 rounded-lg border border-red-300/80 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-800">
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>ত্রুটি: {message}</span>
    </div>
  );
}

export function SuccessNote({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div role="status" className="mb-2 flex items-start gap-2 rounded-lg border border-emerald-300/80 bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-900">
      <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

export function EmptyState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
      <Inbox className="h-5 w-5 text-muted-foreground/60" aria-hidden />
      <p className="text-xs font-medium text-muted-foreground">{message}</p>
      {hint ? <p className="max-w-md text-[11px] text-muted-foreground/80">{hint}</p> : null}
    </div>
  );
}

export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function bnDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("bn-BD", { day: "numeric", month: "short", year: "numeric" });
}

export function bnDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("bn-BD", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export const CASE_TYPE_BN: Record<string, string> = {
  MAINTENANCE: "ভরণপোষণ",
  DOMESTIC_VIOLENCE: "পারিবারিক সহিংসতা",
  DOWRY: "যৌতুক",
  LAND_DISPUTE: "ভূমি বিরোধ",
  LABOUR_WAGES: "শ্রম ও মজুরি",
  CYBER_HARASSMENT: "অনলাইন হয়রানি",
  FRAUD: "প্রতারণা",
  OTHER: "অন্যান্য",
};

export const PRIORITY_BN: Record<string, string> = {
  LOW: "নিম্ন", MEDIUM: "মধ্যম", HIGH: "উচ্চ", URGENT: "জরুরি",
};

export const STATUS_BN: Record<string, string> = {
  SUBMITTED: "জমা দেওয়া হয়েছে",
  UNDER_REVIEW: "যাচাই চলছে",
  MORE_INFO_NEEDED: "অতিরিক্ত তথ্য প্রয়োজন",
  ACCEPTED: "অনুমোদিত",
  REJECTED: "অনুমোদিত হয়নি",
  CONVERTED_TO_CASE: "কেস রেকর্ড খোলা হয়েছে",
  OPEN: "খোলা",
  IN_MEDIATION: "মধ্যস্থতাধীন",
  LAWYER_ASSIGNED: "আইনজীবী নিয়োজিত",
  IN_SERVICE: "সেবাধীন",
  CLOSED: "বন্ধ",
  SENT: "পাঠানো হয়েছে",
  ACKNOWLEDGED: "স্বীকৃত",
  RETURNED: "ফেরত",
  ESCALATED: "উত্তোলিত",
  ROUTED: "রাউট নির্ধারিত",
  COMPLETED: "সম্পন্ন",
  PROPOSED: "প্রস্তাবিত",
  DECLINED: "অপ্রত্যাখ্যাত",
  REASSIGNED: "পুনর্নিযুক্ত",
  SCHEDULED: "নির্ধারিত",
  MISSED: "মিসড",
  HELD: "অনুষ্ঠিত",
  DONE: "সম্পন্ন",
  OVERDUE: "সময়সীমা অতিক্রান্ত",
  IN_PROGRESS: "চলমান",
  CANCELLED: "বাতিল",
};
