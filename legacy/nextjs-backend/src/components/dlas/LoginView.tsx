"use client";

// Login — staff accounts (role gate) + citizen door verification.
// Demo accounts use PIN 1234; the list is displayed because this prototype
// runs on illustrative data only. Premium split layout: brand panel + forms.

import { useState } from "react";
import { api, errorLabelBn } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataBanner, ErrorNote, SectionCard, SuccessNote } from "@/components/dlas/shared";
import type { Nav, SessionCtx } from "@/components/dlas/DlasApp";
import { Scale, ShieldCheck, KeyRound, UserRound, ChevronRight, Building2, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";

const DEMO_ACCOUNTS: { username: string; name: string; role: string; desc: string }[] = [
  { username: "officer.joypurhat", name: "রহিমা খাতুন", role: "DLAO_OFFICER", desc: "ডিএলএও কর্মকর্তা (B1) — জয়পুরহাট" },
  { username: "officer.jhenaidah", name: "মাহমুদুল হাসান", role: "DLAO_OFFICER", desc: "ডিএলএও কর্মকর্তা — ঝিনাইদহ (A3)" },
  { username: "mediator.joypurhat", name: "নাসরিন সুলতানা", role: "MEDIATOR", desc: "আইনি সহায়তা কর্মকর্তা / মধ্যস্থতাকারী (B2/T7/T11)" },
  { username: "helpline.agent1", name: "ফরিদ মিয়া", role: "HELPLINE", desc: "১৬৬৯৯ হেল্পলাইন এজেন্ট (B3)" },
  { username: "udc.khagrachari", name: "জয়ন্ত চাকমা", role: "UDC", desc: "ইউডিসি উদ্যোক্তা (B4/A4/T9)" },
  { username: "lawyer.shahana", name: "অ্যাডভ. শাহানা আক্তার", role: "LAWYER", desc: "প্যানেল আইনজীবী (B5)" },
  { username: "lawyer.kabir", name: "অ্যাডভ. কবির হোসেন", role: "LAWYER", desc: "প্যানেল আইনজীবী (T1 নিষ্ক্রিয়তা-প্যাটার্ন)" },
  { username: "receiving.dhaka", name: "তানভীর আহমেদ", role: "RECEIVING_DLAO", desc: "গ্রহণকারী ডিএলএও (B6) — ঢাকা" },
  { username: "support.staff1", name: "সালমা পারভীন", role: "CASE_SUPPORT", desc: "প্রশাসনিক / কেস-সহায়তা কর্মী (B7)" },
  { username: "ripon.rep", name: "রিপন আক্তার", role: "REPRESENTATIVE", desc: "মনোনীত প্রতিনিধি (A2 — রিপন, দৃষ্টি প্রতিবন্ধী)" },
  { username: "admin", name: "সিস্টেম প্রশাসক", role: "ADMIN", desc: "প্রশাসক (সব ভিউ)" },
];

export default function LoginView({ onLogin, nav }: { onLogin: (s: SessionCtx) => void; nav: Nav }) {
  const [username, setUsername] = useState("officer.joypurhat");
  const [pin, setPin] = useState("1234");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  // citizen door verification
  const [appRef, setAppRef] = useState("");
  const [verif, setVerif] = useState("");
  const [citizenRole, setCitizenRole] = useState("CITIZEN");
  const [citizenError, setCitizenError] = useState<string | null>(null);

  async function staffLogin() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ success: boolean; role?: string; name?: string }>("/api/auth", {
        body: { mode: "staff", username, pin },
      });
      if (!res.success) throw new Error("INVALID_CREDENTIALS");
      const s = await api<{ session: SessionCtx }>("/api/auth");
      if (s.session) onLogin(s.session);
    } catch (e) {
      setError(errorLabelBn(e));
    } finally {
      setBusy(false);
    }
  }

  async function citizenLogin() {
    setBusy(true);
    setCitizenError(null);
    try {
      const res = await api<{ success: boolean }>("/api/auth", {
        body: { mode: "citizen", applicationId: appRef, verification: verif, citizenRole },
      });
      if (!res.success) throw new Error("VERIFICATION_FAILED");
      const s = await api<{ session: SessionCtx }>("/api/auth");
      if (s.session) onLogin(s.session);
    } catch (e) {
      setCitizenError(errorLabelBn(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      {/* ------------------------ Brand / trust panel ------------------------ */}
      <aside className="relative overflow-hidden rounded-2xl bg-primary p-6 text-primary-foreground shadow-[0_20px_50px_-24px_oklch(0.3_0.06_168/0.5)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 80% 12%, oklch(0.8 0.12 85) 0%, transparent 45%), radial-gradient(circle at 8% 92%, oklch(0.7 0.1 160) 0%, transparent 40%)",
          }}
          aria-hidden
        />
        <div className="relative">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/8 text-gold ring-1 ring-gold/40" aria-hidden>
            <Scale className="h-5.5 w-5.5" />
          </span>
          <h1 className="mt-4 font-display text-[20px] font-bold leading-snug">
            পাঁচ দরজা, <span className="text-gold">এক রেকর্ড</span>
          </h1>
          <p className="mt-1.5 text-[12px] leading-relaxed text-primary-foreground/80">
            ভূমিকা-ভিত্তিক প্রবেশ — প্রতিটি ভিউ একই রেকর্ডের ফিল্টারড পাঠ, কখনো কপি নয় (G9)।
          </p>
          <ul className="mt-5 space-y-3 border-t border-white/12 pt-5 text-[12px] leading-relaxed">
            <li className="flex gap-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
              <span>যোগ্যতা, প্রত্যাখ্যান, অগ্রাধিকার ও এখতিয়ার — সব চূড়ান্ত সিদ্ধান্ত মানুষের (G5)।</span>
            </li>
            <li className="flex gap-2.5">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
              <span>কর্মী, মধ্যস্থতাকারী, হেল্পলাইন এজেন্ট, ইউডিসি, আইনজীবী ও গ্রহণকারী কার্যালয় — একই স্পাইন।</span>
            </li>
            <li className="flex gap-2.5">
              <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
              <span>প্রতিটি কাজ অডিট ট্রেইলে — কে, কখন, কোন চ্যানেলে, কার কর্তৃত্বে (G10)।</span>
            </li>
          </ul>
          <div className="mt-6">
            <DataBanner />
          </div>
        </div>
      </aside>

      {/* ------------------------ Forms column ------------------------ */}
      <div className="space-y-5">
        <SectionCard
          kicker="স্টাফ প্রবেশ"
          title="কর্মী / প্রতিনিধি প্রবেশ"
          subtitle="ডেমো অ্যাকাউন্টে ক্লিক করলে নাম ও পিন পূরণ হবে — পিন ১২৩৪ (উদাহরণ তথ্যের জন্যই প্রদর্শিত)"
          icon={<KeyRound className="h-4 w-4" aria-hidden />}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div>
                <Label className="text-xs">ব্যবহারকারী নাম</Label>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} className="mt-1 h-9 text-sm" aria-label="ব্যবহারকারী নাম" />
              </div>
              <div>
                <Label className="text-xs">ডেমো পিন</Label>
                <Input type="password" value={pin} onChange={(e) => setPin(e.target.value)} className="mt-1 h-9 text-sm" aria-label="পিন" />
              </div>
              <ErrorNote message={error ?? ""} />
              <Button className="w-full" disabled={busy} onClick={staffLogin}>
                {busy ? "…" : "প্রবেশ করুন"}
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
              <table className="dlas-table">
                <thead>
                  <tr><th>অ্যাকাউন্ট</th><th>ভূমিকা</th></tr>
                </thead>
                <tbody>
                  {DEMO_ACCOUNTS.map((a) => (
                    <tr
                      key={a.username}
                      className={cn("cursor-pointer", username === a.username && "bg-primary/6")}
                      onClick={() => { setUsername(a.username); setPin("1234"); }}
                      aria-selected={username === a.username}
                    >
                      <td className="font-mono text-[11px]">{a.username}<span className="block font-sans text-[10.5px] text-muted-foreground">{a.name} — পিন ১২৩৪</span></td>
                      <td className="text-muted-foreground">{a.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          kicker="নাগরিক দরজা"
          title="নাগরিক দরজা-যাচাই (পাসওয়ার্ড ছাড়া)"
          subtitle="আবেদন আইডি + নিবন্ধিত যোগাযোগ নম্বরের শেষ ৪ অঙ্ক (বা NID রেফারেন্সের শেষ ৪) — সুযোগ-সীমিত প্রবেশ"
          icon={<UserRound className="h-4 w-4" aria-hidden />}
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <Label className="text-xs">আবেদন আইডি</Label>
              <Input value={appRef} onChange={(e) => setAppRef(e.target.value)} placeholder="APP-2026-0001" className="mt-1 h-9 text-sm" aria-label="আবেদন আইডি" />
            </div>
            <div>
              <Label className="text-xs">শেষ ৪ অঙ্ক</Label>
              <Input value={verif} onChange={(e) => setVerif(e.target.value)} placeholder="####" className="mt-1 h-9 text-sm" aria-label="যাচাই অঙ্ক" />
            </div>
            <div>
              <Label className="text-xs">ভূমিকা</Label>
              <select value={citizenRole} onChange={(e) => setCitizenRole(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm" aria-label="ভূমিকা">
                <option value="CITIZEN">নাগরিক (নিজে)</option>
                <option value="REPRESENTATIVE">প্রতিনিধি (রিপন)</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" className="w-full" disabled={busy} onClick={citizenLogin}>দরজা-যাচাই</Button>
            </div>
          </div>
          <p className="mt-2.5 rounded-lg bg-muted/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            ডেমো: ময়ূরী — <b className="font-mono">APP-2026-0001</b>, শেষ ৪ অঙ্ক <b>3344</b> (তাঁর বাটন-ফোন)। অন্য আবেদনের আইডি কভারেজ ইনডেক্স/কনসোলে দেখুন।
          </p>
          <ErrorNote message={citizenError ?? ""} />
          {msg ? <SuccessNote message={msg} /> : null}
          <button className="mt-1 text-xs font-medium text-primary underline-offset-2 hover:underline" onClick={() => nav("landing")}>← হোমে ফিরুন</button>
        </SectionCard>
      </div>
    </div>
  );
}
