"use client";

// ============================================================================
// DLAS root — ONE application, five doors, role-appropriate views of ONE
// record. All views are state-routed inside `/` (deep-linkable via ?view=).
// Premium shell: dark institutional sidebar, gold accents, Bangla-first.
// ============================================================================

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, errorLabelBn } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { DataBanner, PageHeader } from "@/components/dlas/shared";
import { registerServiceWorker } from "@/components/dlas/register-sw";
import { cn } from "@/lib/utils";
import {
  Scale, PhoneCall, MessageSquareText, MessagesSquare, Handshake, Headset,
  LayoutDashboard, ClipboardCheck, FileSignature, PenLine, Briefcase, Inbox,
  Bot, Fingerprint, Link2, FileSearch, UserCog, ArrowRightLeft, CloudOff,
  Smartphone, BarChart3, ScrollText, ListChecks, UserRound, ShieldCheck,
  Gavel, Menu, X, Sun, LogOut, Landmark, ChevronRight, AudioLines,
} from "lucide-react";
import LoginView from "@/components/dlas/LoginView";
import CoverageIndex from "@/components/dlas/CoverageIndex";
import CitizenPortal from "@/components/dlas/CitizenPortal";
import VoiceDoor from "@/components/dlas/VoiceDoor";
import UssdDoor from "@/components/dlas/UssdDoor";
import IntakeChat from "@/components/dlas/IntakeChat";
import UdcIntake from "@/components/dlas/UdcIntake";
import HelplineConsole from "@/components/dlas/HelplineConsole";
import DlaoDashboard from "@/components/dlas/DlaoDashboard";
import ApplicationInbox from "@/components/dlas/ApplicationInbox";
import CaseRecord from "@/components/dlas/CaseRecord";
import StaffDockets from "@/components/dlas/StaffDockets";
import LegalWorkbench from "@/components/dlas/LegalWorkbench";
import LawyerCenter from "@/components/dlas/LawyerCenter";
import AdminCenter from "@/components/dlas/AdminCenter";

export interface SessionCtx {
  userId?: string;
  role: string;
  name: string;
  office?: string | null;
  citizenApplicationId?: string;
}

export interface Nav {
  (view: string, params?: Record<string, string>): void;
}

const ROLE_HOME: Record<string, string> = {
  CITIZEN: "portal",
  REPRESENTATIVE: "portal",
  UDC: "udc-intake",
  HELPLINE: "helpline",
  DLAO_OFFICER: "dlao",
  MEDIATOR: "mediation",
  LAWYER: "lawyer-worklist",
  RECEIVING_DLAO: "referrals",
  CASE_SUPPORT: "reports",
  ADMIN: "dlao",
};

const ALL_ROLES = ["*"];

interface NavItem {
  key: string;
  label: string;
  hint: string;
  roles: string[];
  group: string;
  icon: ReactNode;
}

function ic(I: React.ComponentType<{ className?: string }>) {
  return <I className="h-[15px] w-[15px]" aria-hidden />;
}

export const NAV: NavItem[] = [
  // প্রবেশ-দরজা — the five doors into the same record
  { key: "portal", label: "নাগরিক পোর্টাল", hint: "অবস্থা ও সংশোধন", roles: ["CITIZEN", "REPRESENTATIVE", "ADMIN"], group: "প্রবেশ-দরজা", icon: ic(UserRound) },
  { key: "voice", label: "ভয়েস / ১৬৬৯৯", hint: "IVR রুট — অদৃষ্ট-বান্ধব", roles: ALL_ROLES, group: "প্রবেশ-দরজা", icon: ic(PhoneCall) },
  { key: "ussd", label: "ইউএসএসডি / এসএমএস", hint: "বেসিক ফোন রুট", roles: ALL_ROLES, group: "প্রবেশ-দরজা", icon: ic(MessageSquareText) },
  { key: "intake-chat", label: "কথোপকথনমূলক ইনটেক", hint: "T5 — বাংলা স্লট-ফিলিং", roles: ["HELPLINE", "CITIZEN", "REPRESENTATIVE", "ADMIN"], group: "প্রবেশ-দরজা", icon: ic(MessagesSquare) },
  { key: "udc-intake", label: "ইউডিসি সহায়তায় ইনটেক", hint: "B4/A4 — অফলাইন-সহ", roles: ["UDC", "CASE_SUPPORT", "ADMIN"], group: "প্রবেশ-দরজা", icon: ic(Handshake) },
  { key: "helpline", label: "১৬৬৯৯ কনসোল", hint: "B3 — শেয়ারড লুকআপ", roles: ["HELPLINE", "ADMIN"], group: "প্রবেশ-দরজা", icon: ic(Headset) },

  // সেবা-প্রবাহ — service delivery over the shared record
  { key: "dlao", label: "ডিএলএও কার্য-দৃশ্য", hint: "B1 — একক পরিচালন-দৃশ্য", roles: ["DLAO_OFFICER", "CASE_SUPPORT", "ADMIN"], group: "সেবা-প্রবাহ", icon: ic(LayoutDashboard) },
  { key: "applications", label: "আবেদন-পর্যালোচনা", hint: "যাচাই → গ্রহণ/প্রত্যাখ্যান", roles: ["DLAO_OFFICER", "CASE_SUPPORT", "ADMIN"], group: "সেবা-প্রবাহ", icon: ic(ClipboardCheck) },
  { key: "mediation", label: "মধ্যস্থতা ওয়ার্কবেঞ্চ", hint: "B2 — তারিখ→নোটিশ→ফল", roles: ["MEDIATOR", "DLAO_OFFICER", "ADMIN"], group: "সেবা-প্রবাহ", icon: ic(Scale) },
  { key: "settlement", label: "নিষ্পত্তি-খসড়া", hint: "T7 — এআই খসড়া + মানব-পর্যালোচনা", roles: ["MEDIATOR", "DLAO_OFFICER", "ADMIN"], group: "সেবা-প্রবাহ", icon: ic(FileSignature) },
  { key: "signatures", label: "ই-স্বাক্ষর", hint: "T11 — অ্যাসিনক্রোনাস যাচাই", roles: ["MEDIATOR", "DLAO_OFFICER", "ADMIN"], group: "সেবা-প্রবাহ", icon: ic(PenLine) },
  { key: "lawyer-worklist", label: "আইনজীবী ওয়ার্কলিস্ট", hint: "B5 — নিয়োগ, হিয়ারিং", roles: ["LAWYER", "ADMIN"], group: "সেবা-প্রবাহ", icon: ic(Briefcase) },
  { key: "referrals", label: "রেফারেল ইনবক্স", hint: "B6 — স্বীকৃতি/গ্রহণ/ফেরত", roles: ["RECEIVING_DLAO", "DLAO_OFFICER", "CASE_SUPPORT", "ADMIN"], group: "সেবা-প্রবাহ", icon: ic(Inbox) },

  // বুদ্ধিমান মডিউল — the eleven technical challenges
  { key: "triage", label: "ট্রায়াজ পাইপলাইন", hint: "T8 — ৩ এজেন্ট + সংঘর্ষ", roles: ["DLAO_OFFICER", "CASE_SUPPORT", "ADMIN"], group: "বুদ্ধিমান মডিউল", icon: ic(Bot) },
  { key: "duplicates", label: "ডুপ্লিকেট পর্যালোচনা", hint: "T4 — মানব-সিদ্ধান্ত", roles: ["DLAO_OFFICER", "CASE_SUPPORT", "ADMIN"], group: "বুদ্ধিমান মডিউল", icon: ic(Fingerprint) },
  { key: "incident-groups", label: "সংশ্লিষ্ট ঘটনা", hint: "T3 — লিংক, মার্জ নয়", roles: ["DLAO_OFFICER", "CASE_SUPPORT", "ADMIN"], group: "বুদ্ধিমান মডিউল", icon: ic(Link2) },
  { key: "document-agent", label: "নথি-ব্রিফিং এজেন্ট", hint: "T6 — চেকলিস্ট + উৎস", roles: ["DLAO_OFFICER", "CASE_SUPPORT", "UDC", "ADMIN"], group: "বুদ্ধিমান মডিউল", icon: ic(FileSearch) },
  { key: "lawyer-change", label: "আইনজীবী পরিবর্তন", hint: "T1 — পর্যালোচনা→পরিশোধ", roles: ["DLAO_OFFICER", "CASE_SUPPORT", "ADMIN"], group: "বুদ্ধিমান মডিউল", icon: ic(UserCog) },
  { key: "jurisdiction", label: "এখতিয়ার উত্তোলন", hint: "T2 — মানব-রাউটিং সিদ্ধান্ত", roles: ["DLAO_OFFICER", "CASE_SUPPORT", "ADMIN"], group: "বুদ্ধিমান মডিউল", icon: ic(ArrowRightLeft) },
  { key: "offline-sync", label: "অফলাইন সিংক", hint: "T9 — কিউ, সংঘর্ষ, অখণ্ডতা", roles: ["UDC", "CASE_SUPPORT", "DLAO_OFFICER", "ADMIN"], group: "বুদ্ধিমান মডিউল", icon: ic(CloudOff) },
  { key: "pwa-info", label: "লো-ব্যান্ডউইথ PWA", hint: "T10 — লাইট মোড", roles: ALL_ROLES, group: "বুদ্ধিমান মডিউল", icon: ic(Smartphone) },

  // শাসন ও প্রমাণ — governance, audit, traceability
  { key: "reports", label: "রিপোর্ট ও পরিসংখ্যান", hint: "B7 — রেকর্ড থেকেই", roles: ["CASE_SUPPORT", "DLAO_OFFICER", "ADMIN"], group: "শাসন ও প্রমাণ", icon: ic(BarChart3) },
  { key: "audit", label: "অডিট ট্রেইল", hint: "G10 — কে, কখন, কোন কর্তৃত্বে", roles: ["DLAO_OFFICER", "CASE_SUPPORT", "ADMIN", "MEDIATOR", "RECEIVING_DLAO"], group: "শাসন ও প্রমাণ", icon: ic(ScrollText) },
  { key: "coverage", label: "কভারেজ ইনডেক্স", hint: "২৩ আইটেম — লাইভ ডিপ-লিংক", roles: ALL_ROLES, group: "শাসন ও প্রমাণ", icon: ic(ListChecks) },
];

export default function DlasApp() {
  const [session, setSession] = useState<SessionCtx | null>(null);
  const [booted, setBooted] = useState(false);
  const [view, setView] = useState("landing");
  const [params, setParams] = useState<Record<string, string>>({});
  const [lightMode, setLightMode] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const nav = useCallback<Nav>((v, p) => {
    setView(v);
    setParams(p ?? {});
    setMenuOpen(false);
    const qs = new URLSearchParams({ view: v, ...(p ?? {}) }).toString();
    window.history.pushState(null, "", `/?${qs}`);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    registerServiceWorker();
    const qs = new URLSearchParams(window.location.search);
    const v = qs.get("view");
    if (v) {
      setView(v);
      setParams(Object.fromEntries(qs.entries()));
    }
    api<{ session: SessionCtx | null }>("/api/auth")
      .then((d) => setSession(d.session))
      .catch(() => setSession(null))
      .finally(() => setBooted(true));
    const onPop = () => {
      const q = new URLSearchParams(window.location.search);
      setView(q.get("view") ?? "landing");
      setParams(Object.fromEntries(q.entries()));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // T10 light mode — reduces heavy rendering on low-end devices
  useEffect(() => {
    document.documentElement.dataset.light = lightMode ? "true" : "false";
  }, [lightMode]);

  // Close the mobile drawer on Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const visibleNav = useMemo(() => {
    if (!session) return NAV.filter((n) => n.roles.includes("*"));
    return NAV.filter((n) => n.roles.includes(session.role) || n.roles.includes("*"));
  }, [session]);

  const groups = useMemo(() => {
    const order = ["প্রবেশ-দরজা", "সেবা-প্রবাহ", "বুদ্ধিমান মডিউল", "শাসন ও প্রমাণ"];
    return order
      .map((g) => ({ group: g, items: visibleNav.filter((n) => n.group === g) }))
      .filter((g) => g.items.length > 0);
  }, [visibleNav]);

  const currentLabel = useMemo(() => {
    if (view === "landing") return "হোম";
    if (view === "login") return "প্রবেশ";
    if (view === "case") return "কেস রেকর্ড";
    return NAV.find((n) => n.key === view)?.label ?? "DLAS";
  }, [view]);

  async function logout() {
    await api("/api/auth", { body: { mode: "logout" } }).catch(() => undefined);
    setSession(null);
    nav("landing");
  }

  function renderView() {
    const p = { ...params, nav } as { nav: Nav; [k: string]: unknown };
    switch (view) {
      case "landing": return <Landing nav={nav} session={session} />;
      case "login": return <LoginView onLogin={(s) => { setSession(s); nav(ROLE_HOME[s.role] ?? "coverage"); }} nav={nav} />;
      case "coverage": return <CoverageIndex nav={nav} session={session} />;
      case "portal": return <CitizenPortal session={session} nav={nav} />;
      case "voice": return <VoiceDoor session={session} nav={nav} />;
      case "ussd": return <UssdDoor session={session} nav={nav} />;
      case "intake-chat": return <IntakeChat session={session} nav={nav} />;
      case "udc-intake": return <UdcIntake session={session} nav={nav} />;
      case "helpline": return <HelplineConsole session={session} nav={nav} />;
      case "dlao": return <DlaoDashboard session={session} nav={nav} />;
      case "applications": return <ApplicationInbox session={session} nav={nav} />;
      case "case": return <CaseRecord session={session} nav={nav} caseId={params.id} />;
      case "triage": return <StaffDockets session={session} nav={nav} view="triage" />;
      case "duplicates": return <StaffDockets session={session} nav={nav} view="duplicates" />;
      case "incident-groups": return <StaffDockets session={session} nav={nav} view="incident-groups" />;
      case "document-agent": return <StaffDockets session={session} nav={nav} view="document-agent" />;
      case "lawyer-change": return <StaffDockets session={session} nav={nav} view="lawyer-change" />;
      case "jurisdiction": return <StaffDockets session={session} nav={nav} view="jurisdiction" />;
      case "mediation": return <LegalWorkbench session={session} nav={nav} view="mediation" />;
      case "settlement": return <LegalWorkbench session={session} nav={nav} view="settlement" />;
      case "signatures": return <LegalWorkbench session={session} nav={nav} view="signatures" />;
      case "lawyer-worklist": return <LawyerCenter session={session} nav={nav} view="worklist" />;
      case "referrals": return <LawyerCenter session={session} nav={nav} view="referrals" />;
      case "reports": return <AdminCenter session={session} nav={nav} view="reports" />;
      case "audit": return <AdminCenter session={session} nav={nav} view="audit" />;
      case "offline-sync": return <AdminCenter session={session} nav={nav} view="offline-sync" />;
      case "pwa-info": return <AdminCenter session={session} nav={nav} view="pwa-info" />;
      default:
        return (
          <PageHeader title="অজানা পাতা" description={`অনুরোধকৃত ভিউ পাওয়া যায়নি: ${view}`} />
        );
    }
  }

  if (!booted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
          <Scale className="h-5.5 w-5.5" aria-hidden />
        </span>
        <p className="font-display text-sm font-semibold text-muted-foreground">DLAS লোড হচ্ছে…</p>
      </div>
    );
  }

  const initials = session?.name?.trim().slice(0, 1) ?? "";

  return (
    <div className="flex min-h-screen bg-background">
      {/* ============================ Sidebar (desktop) ============================ */}
      <aside
        className="fixed inset-y-0 left-0 z-40 hidden w-[224px] flex-col bg-sidebar text-sidebar-foreground md:flex lg:w-[248px]"
        aria-label="প্রধান মেনু"
      >
        <BrandBlock />
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4" aria-label="নেভিগেশন">
          {groups.map(({ group, items }) => (
            <div key={group}>
              <p className="mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-gold/70">{group}</p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = view === item.key;
                  return (
                    <li key={item.key}>
                      <button
                        onClick={() => nav(item.key)}
                        className={cn(
                          "group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left transition-colors",
                          active ? "bg-white/10 text-white" : "text-sidebar-foreground/80 hover:bg-white/5 hover:text-white",
                        )}
                        aria-current={active ? "page" : undefined}
                      >
                        {active ? <span className="absolute left-0 top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-full bg-gold" aria-hidden /> : null}
                        <span className={cn("shrink-0", active ? "text-gold" : "text-sidebar-foreground/55 group-hover:text-gold/80")}>{item.icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium leading-tight">{item.label}</span>
                          <span className="block truncate text-[10px] leading-tight text-sidebar-foreground/45">{item.hint}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="space-y-2.5 border-t border-white/10 px-3.5 py-3 [@media(max-height:700px)]:hidden">
          <div className="flex items-start gap-2 text-[10.5px] leading-relaxed text-sidebar-foreground/70">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold/80" aria-hidden />
            <span>চূড়ান্ত আইনি সিদ্ধান্ত সবসময় অনুমোদিত মানুষের — প্রযুক্তি শুধু সহায়তা করে।</span>
          </div>
          <DataBanner />
        </div>
      </aside>

      {/* ============================ Mobile drawer ============================ */}
      {menuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="মেনু">
          <button className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={() => setMenuOpen(false)} aria-label="মেনু বন্ধ করুন" />
          <aside className="absolute inset-y-0 left-0 flex w-[272px] flex-col bg-sidebar text-sidebar-foreground shadow-2xl">
            <BrandBlock onClose={() => setMenuOpen(false)} />
            <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4" aria-label="নেভিগেশন">
              {groups.map(({ group, items }) => (
                <div key={group}>
                  <p className="mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-gold/70">{group}</p>
                  <ul className="space-y-0.5">
                    {items.map((item) => {
                      const active = view === item.key;
                      return (
                        <li key={item.key}>
                          <button
                            onClick={() => nav(item.key)}
                            className={cn(
                              "relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left",
                              active ? "bg-white/10 text-white" : "text-sidebar-foreground/80 hover:bg-white/5",
                            )}
                            aria-current={active ? "page" : undefined}
                          >
                            {active ? <span className="absolute left-0 top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-full bg-gold" aria-hidden /> : null}
                            <span className={cn("shrink-0", active ? "text-gold" : "text-sidebar-foreground/55")}>{item.icon}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-medium leading-tight">{item.label}</span>
                              <span className="block truncate text-[10px] leading-tight text-sidebar-foreground/45">{item.hint}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
            <div className="border-t border-white/10 px-3.5 py-3"><DataBanner /></div>
          </aside>
        </div>
      ) : null}

      {/* ============================ Main column ============================ */}
      <div className="flex min-h-screen w-full min-w-0 flex-col md:pl-[224px] lg:pl-[248px]">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur">
          <div className="flex items-center gap-2.5 px-4 py-2.5 sm:px-6">
            <button
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-foreground md:hidden"
              onClick={() => setMenuOpen(true)}
              aria-expanded={menuOpen}
              aria-label="মেনু খুলুন"
            >
              <Menu className="h-4 w-4" aria-hidden />
            </button>
            <div className="flex min-w-0 items-center gap-2 text-[13px]">
              <span className="hidden text-muted-foreground sm:inline">DLAS</span>
              <ChevronRight className="hidden h-3 w-3 text-muted-foreground/50 sm:inline" aria-hidden />
              <span className="truncate font-semibold text-foreground">{currentLabel}</span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button
                className={cn(
                  "flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-[11px] font-medium transition-colors",
                  lightMode ? "border-gold/50 bg-amber-50 text-gold-deep" : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setLightMode((v) => !v)}
                title="T10: লাইট মোড — কম-মেমোরি ডিভাইসের জন্য হালকা রেন্ডারিং"
                aria-pressed={lightMode}
              >
                <Sun className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">লাইট মোড</span>
              </button>
              {session ? (
                <>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[12px] font-bold text-primary-foreground" aria-hidden>
                    {initials}
                  </span>
                  <span className="hidden text-right text-[11px] leading-tight sm:block">
                    <span className="block max-w-[160px] truncate font-semibold">{session.name}</span>
                    <span className="block max-w-[160px] truncate text-muted-foreground">{session.office ?? session.role}</span>
                  </span>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={logout}>
                    <LogOut className="h-3.5 w-3.5" aria-hidden />
                    <span className="hidden sm:inline">লগআউট</span>
                  </Button>
                </>
              ) : (
                <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => nav("login")}>
                  প্রবেশ
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </Button>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-5 sm:px-6 sm:py-6">{renderView()}</main>

        <footer className="mt-auto border-t border-border/70 bg-card">
          <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-2 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground sm:px-6">
            <p className="flex items-center gap-1.5">
              <Landmark className="h-3.5 w-3.5 text-primary/60" aria-hidden />
              DLAS প্রোটোটাইপ — ADLASB Grand Finale ("পাঁচ দরজা, এক রেকর্ড")
            </p>
            <p>শেষ আইনি সিদ্ধান্ত সবসময় অনুমোদিত মানুষের — এআই কখনো নয়।</p>
          </div>
        </footer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Brand block — sidebar header                                         */
/* ------------------------------------------------------------------ */
function BrandBlock({ onClose }: { onClose?: () => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/8 text-gold ring-1 ring-gold/35" aria-hidden>
        <Scale className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[17px] font-bold leading-none text-white">DLAS</p>
        <p className="mt-1 truncate text-[10.5px] leading-tight text-sidebar-foreground/65">ডিজিটাল আইনি সহায়তা ব্যবস্থা</p>
        <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-gold/70">ADLASB · Grand Finale</p>
      </div>
      {onClose ? (
        <button className="flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/70 hover:bg-white/10" onClick={onClose} aria-label="মেনু বন্ধ করুন">
          <X className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Landing — the five doors into the same record                        */
/* ------------------------------------------------------------------ */
const DOORS: { key: string; icon: ReactNode; title: string; desc: string; tag: string }[] = [
  {
    key: "voice",
    icon: <PhoneCall className="h-5 w-5" aria-hidden />,
    title: "১৬৬৯৯ / ভয়েস / IVR",
    desc: "যাঁরা কথা বলতে বা কিপ্যাড চাপতে পারেন কিন্তু পড়তে পারেন না — ভয়েস-প্রথম ইনটেক ও অবস্থা; রিড-ব্যাক; নিরাপদ যোগাযোগ; মানব-হস্তান্তর।",
    tag: "A2 · A5 · G4",
  },
  {
    key: "ussd",
    icon: <MessageSquareText className="h-5 w-5" aria-hidden />,
    title: "ইউএসএসডি / এসএমএস",
    desc: "বেসিক ফোন, দুর্বল বা বিহীন ডেটা — সংক্ষিপ্ত ফ্লো, নিরপেক্ষ ও গোপনীয়তা-সচেতন বার্তা।",
    tag: "A1 · G3",
  },
  {
    key: "intake-chat",
    icon: <MessagesSquare className="h-5 w-5" aria-hidden />,
    title: "ওয়েব / মোবাইল — কথোপকথনমূলক",
    desc: "স্বাধীন ডিজিটাল ব্যবহারকারী — বাংলা-প্রথম, প্রবেশগম্য, কম-ব্যান্ডউইথ, সেভ/রিজিউম (T5 স্লট-ফিলিং ইনটেক)।",
    tag: "T5 · G2",
  },
  {
    key: "udc-intake",
    icon: <Handshake className="h-5 w-5" aria-hidden />,
    title: "সহায়তায় প্রবেশ (ইউডিসি)",
    desc: "ইউডিসি উদ্যোক্তা / অনুমোদিত সহায়ক — সম্মতি, উৎস-প্রমাণ, সীমাবদ্ধ অনুমতি, অফলাইন সহনশীলতা।",
    tag: "A4 · B4 · T9",
  },
  {
    key: "portal",
    icon: <Landmark className="h-5 w-5" aria-hidden />,
    title: "ডিএলএও / রেফারেল রুট",
    desc: "সরাসরি হাজিরা ও প্রাতিষ্ঠানিক পথ — একই রেকর্ড, পুনঃপ্রবেশ নয়, কাঠামোবদ্ধ হস্তান্তর ও স্বীকৃতি।",
    tag: "B1 · B6",
  },
];

const BACKBONE = ["প্রবেশ চ্যানেল", "আবেদন আইডি", "যাচাই/পর্যালোচনা", "কেস আইডি", "মধ্যস্থতা / আইনজীবী / রেফারেল", "অনুসরণ", "ফল", "বন্ধ"];

function Landing({ nav, session }: { nav: Nav; session: SessionCtx | null }) {
  return (
    <div className="space-y-6">
      {/* ------------------------------ Hero ------------------------------ */}
      <section className="relative overflow-hidden rounded-2xl bg-primary text-primary-foreground shadow-[0_20px_50px_-20px_oklch(0.3_0.06_168/0.5)]">
        {/* Soft deterministic glow — inline opacity/rgba so it stays subtle even
            if utility CSS is stale or a font falls back (client-safe). */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: 0.16,
            backgroundImage:
              "radial-gradient(34rem 20rem at 88% -10%, rgba(214,178,112,0.6) 0%, rgba(214,178,112,0) 62%), radial-gradient(26rem 16rem at 4% 112%, rgba(122,196,168,0.42) 0%, rgba(122,196,168,0) 58%)",
          }}
          aria-hidden
        />
        <div className="pointer-events-none absolute -right-10 -top-10 hidden h-56 w-56 rounded-full border-[22px] border-white/5 sm:block" aria-hidden />
        <div className="relative px-6 pb-10 pt-8 sm:px-10 sm:pb-12 sm:pt-10">
          <span className="kicker !text-gold">জাতীয় আইনগত সহায়তা — ডিজিটাল রূপান্তর</span>
          <h1 className="mt-2 max-w-3xl font-display text-[26px] font-bold leading-[1.3] sm:text-[32px]">
            পাঁচ দরজা, এক রেকর্ড —
            <span className="text-gold"> এক ডিজিটাল আইনি সহায়তা ব্যবস্থা</span>
          </h1>
          <p className="mt-3 max-w-3xl text-[13.5px] leading-relaxed text-primary-foreground/85">
            প্রতিটি দরজা একটি <b>ইন্টারফেস</b> — আলাদা কেস-ম্যানেজমেন্ট সিস্টেম নয়। যে চ্যানেলেই প্রবেশ করুন,
            একই Application ID → যাচাই → Case ID → মধ্যস্থতা / আইনজীবী / রেফারেল → অনুসরণ → ফল → বন্ধ।
            প্রতিটি গুরুত্বপূর্ণ সিদ্ধান্ত অনুমোদিত মানুষের; প্রযুক্তি সংগ্রহ, যাচাই, সংগঠন ও সুপারিশে সহায়তা করে।
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            {!session && (
              <Button size="lg" className="bg-white text-primary hover:bg-white/90" onClick={() => nav("login")}>
                কর্মী / প্রতিনিধি প্রবেশ
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            )}
            <Button size="lg" variant="outline" className="border-white/30 bg-white/5 text-primary-foreground hover:bg-white/15 hover:text-white" onClick={() => nav("coverage")}>
              <ListChecks className="h-4 w-4" aria-hidden />
              ২৩ আইটেম কভারেজ ইনডেক্স
            </Button>
            <Button size="lg" variant="outline" className="border-white/30 bg-white/5 text-primary-foreground hover:bg-white/15 hover:text-white" onClick={() => nav("voice")}>
              <AudioLines className="h-4 w-4" aria-hidden />
              ভয়েস দরজা ব্যবহার করুন
            </Button>
          </div>
          <dl className="mt-7 grid max-w-2xl grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {[
              ["২৩", "বাধ্যতামূলক আইটেম"],
              ["৫", "প্রবেশ-দরজা"],
              ["৭", "সেবাদাতা ভূমিকা"],
              ["১১", "প্রযুক্তি-চ্যালেঞ্জ"],
            ].map(([n, l]) => (
              <div key={l} className="border-l-2 border-gold/60 pl-3">
                <dt className="sr-only">{l}</dt>
                <dd className="font-display text-xl font-bold leading-[1.15] text-gold">{n}</dd>
                <dd className="mt-1 text-[11px] leading-snug text-primary-foreground/70">{l}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ------------------------------ Doors ------------------------------ */}
      <section>
        <PageHeader kicker="ফাইভ ডোরস" title="একই রেকর্ডে পাঁচটি প্রবেশ-দরজা" description="চ্যানেল একটি ইন্টারফেস মাত্র — আলাদা কেস-ম্যানেজমেন্ট সিস্টেম নয় (CHANNEL RULE)।" />
        <div className="mt-4 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {DOORS.map((d) => (
            <button
              key={d.key}
              onClick={() => nav(d.key)}
              className="card-lift group flex flex-col rounded-xl border border-border/80 bg-card p-4 text-left"
              aria-label={d.title}
            >
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/8 text-primary ring-1 ring-primary/15 transition-colors group-hover:bg-primary group-hover:text-primary-foreground" aria-hidden>
                  {d.icon}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground">{d.tag}</span>
              </div>
              <h2 className="mt-3 font-display text-[15px] font-bold text-foreground">{d.title}</h2>
              <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">{d.desc}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
                দরজা খুলুন <ChevronRight className="h-3 w-3" aria-hidden />
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* --------------------------- Backbone --------------------------- */}
      <section className="rounded-xl border border-border/80 bg-card p-5">
        <PageHeader kicker="কমন ব্যাকবোন" title="প্রবেশ থেকে বন্ধ — এক ট্রেসেবল প্রবাহ" />
        <ol className="mt-4 flex flex-wrap items-center gap-y-2.5">
          {BACKBONE.map((step, i) => (
            <li key={step} className="flex items-center">
              <span className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-[11.5px] font-semibold text-primary">
                <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground" aria-hidden>{i + 1}</span>
                {step}
              </span>
              {i < BACKBONE.length - 1 ? <ChevronRight className="mx-1 h-3.5 w-3.5 shrink-0 text-gold-deep/60" aria-hidden /> : null}
            </li>
          ))}
        </ol>
        <ul className="mt-4 grid gap-x-6 gap-y-1.5 text-xs leading-relaxed text-muted-foreground sm:grid-cols-2">
          <li className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden />আবেদন জমার সময়ই Application ID তৈরি হয়; অনুমোদনের পরেই Case ID — রেফারেল, মধ্যস্থতা, আইনজীবী নিয়োগ ও বন্ধ পর্যন্ত একই রেকর্ড।</li>
          <li className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden />নিরাপদ যোগাযোগ-নিয়ম, প্রতিনিধিত্ব-অবস্থা, নথি-ইতিহাস, অনুমতি ও অডিট-ইতিহাস রেকর্ডের সাথেই থাকে।</li>
          <li className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden />প্রতিটি কর্মী একই রেকর্ডের ভূমিকা-উপযোগী দৃশ্য দেখেন — কপি নয় (G9)।</li>
          <li className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden />প্রযুক্তিগত প্রতিটি মডিউল একই রেকর্ডে ফেরে — বিচ্ছিন্ন সাইড-সিস্টেম নয় (G1)।</li>
        </ul>
      </section>

      {/* ------------------- Real-workflow alignment (DLAO briefing) ------------------- */}
      <section>
        <PageHeader
          kicker="কার্যালয়ের বাস্তবতা"
          title="ডিএলএ কার্যালয়ের প্রকৃত সেবাপ্রবাহের সাথে সামঞ্জস্য"
          description="জেলা আইনি সহায়তা কার্যালয়ের তিনটি সেবা — আইনি পরামর্শ, মাধ্যমস্থতা (ADR) ও মামলা (প্যানেল আইনজীবী) — ডিজিটাল প্রবাহে অপরিবর্তিত থাকে; রেজিস্টারগুলো একই রেকর্ড থেকে তৈরি হয়।"
        />
        <div className="mt-4 grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          {[
            {
              icon: <Headset className="h-4.5 w-4.5" aria-hidden />,
              title: "আইনি পরামর্শ",
              lines: "হটলাইন, রেফারেল (সরকারি সংস্থা, এনজিও, আইনজীবী, সাধারণ মানুষ, ULAC/UPLAC) ও সরাসরি হাজিরা — কাগজের “Advice Register”-এর বদলে কাঠামোবদ্ধ রেকর্ড-এন্ট্রি ও উৎস-প্রমাণ।",
              views: [["১৬৬৯৯ কনসোল", "helpline"], ["কথোপকথনমূলক ইনটেক", "intake-chat"]],
            },
            {
              icon: <Scale className="h-4.5 w-4.5" aria-hidden />,
              title: "মাধ্যমস্থতা (ADR)",
              lines: "প্রি-কেস ও পোস্ট-কেস মধ্যস্থতা — নিবন্ধন, তারিখ, নোটিশ, উপস্থিতি ও ফল এক ওয়ার্কফ্লোতে; মধ্যস্থতা রেজিস্টার রেকর্ড থেকেই তৈরি; চুক্তি সরাসরি ডিক্রি-কার্যকর (২০২৬ সংশোধনী)।",
              views: [["মধ্যস্থতা ওয়ার্কবেঞ্চ", "mediation"], ["ই-স্বাক্ষর", "signatures"]],
            },
            {
              icon: <Gavel className="h-4.5 w-4.5" aria-hidden />,
              title: "মামলা ও প্যানেল আইনজীবী",
              lines: "যোগ্যতা যাচাই → CLAO/DLAO নিয়োগ → DLAC মাসিক-সভায় বহাল; মাসিক/ত্রৈমাসিক প্রতিবেদন কাগজের বদলে সিস্টেম থেকে — কেস-ডিস্ট্রিবিউশন রেজিস্টারসহ।",
              views: [["আইনজীবী ওয়ার্কলিস্ট", "lawyer-worklist"], ["রিপোর্ট", "reports"]],
            },
          ].map((c) => (
            <article key={c.title} className="card-lift flex flex-col rounded-xl border border-border/80 bg-card p-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/15 text-gold-deep ring-1 ring-gold/30" aria-hidden>{c.icon}</span>
              <h3 className="mt-2.5 font-display text-[15px] font-bold text-foreground">{c.title}</h3>
              <p className="mt-1.5 flex-1 text-xs leading-relaxed text-muted-foreground">{c.lines}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {c.views.map(([label, key]) => (
                  <button key={key} onClick={() => nav(key)} className="rounded-full border border-primary/25 bg-primary/5 px-2.5 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground">
                    {label} →
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
