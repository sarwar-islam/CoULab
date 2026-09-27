"use client";

// ============================================================================
// T5 Conversational Bangla intake — multi-turn slot-filling of APPROVED
// fields only; provenance preserved; sensitive/ambiguous cases handed to a
// human WITH context; converted submissions write to the SAME record (G1).
// Also serves Ripon's non-visual path: keyboard-only, aria-live transcript.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { api, errorLabelBn } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorNote, SectionCard, StateChip } from "@/components/dlas/shared";
import type { Nav, SessionCtx } from "@/components/dlas/DlasApp";
import { MessagesSquare } from "lucide-react";

interface Turn {
  role: "user" | "agent";
  text: string;
}
interface SlotState {
  [k: string]: string;
}

const SLOT_LABELS: Record<string, string> = {
  citizenName: "নাম", district: "জেলা", caseType: "কেস-ধরন", narrative: "ঘটনার বিবরণ", contactNumber: "নিরাপদ যোগাযোগ নম্বর",
};

export default function IntakeChat({ session, nav }: { session: SessionCtx | null; nav: Nav }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [slots, setSlots] = useState<SlotState>({});
  const [status, setStatus] = useState("IN_PROGRESS");
  const [aiAvailable, setAiAvailable] = useState(true);
  const [sensitive, setSensitive] = useState(false);
  const [handoffReason, setHandoffReason] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Voice-door "start intake" event
  useEffect(() => {
    const handler = () => setInput("আমি নতুন আবেদন করতে চাই।");
    window.addEventListener("dlas:voice-intake", handler);
    return () => window.removeEventListener("dlas:voice-intake", handler);
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns]);

  async function send() {
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    setTurns((t) => [...t, { role: "user", text: message }]);
    setBusy(true);
    setError("");
    try {
      const d = await api<{
        sessionId: string; reply: string; slots: SlotState; status: string; sensitiveFlag: boolean; handoffReason: string | null; aiAvailable: boolean;
      }>("/api/intake", { body: { action: "turn", sessionId, message, channel: session?.role === "HELPLINE" ? "HELPLINE" : "WEB_CHAT" } });
      setSessionId(d.sessionId);
      setTurns((t) => [...t, { role: "agent", text: d.reply }]);
      setSlots(d.slots);
      setStatus(d.status);
      setSensitive(d.sensitiveFlag);
      setHandoffReason(d.handoffReason);
      setAiAvailable(d.aiAvailable);
    } catch (e) {
      setError(errorLabelBn(e));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!sessionId) return;
    setBusy(true);
    setError("");
    try {
      const d = await api<{ applicationId: string }>("/api/intake", { body: { action: "submit", sessionId } });
      setSubmitted(d.applicationId);
    } catch (e) {
      setError(errorLabelBn(e));
    } finally {
      setBusy(false);
    }
  }

  const filledCount = Object.values(slots).filter(Boolean).length;

  return (
    <div className="space-y-4">
      <SectionCard
        kicker="T5 · প্রাকৃতিক বাংলা, স্লট-ফিলিং"
        title="কথোপকথনমূলক বাংলা ইনটেক"
        icon={<MessagesSquare className="h-4 w-4" aria-hidden />}
        subtitle="ফর্ম-উইজার্ড নয় — প্রাকৃতিক কথোপকথন; শুধু অনুমোদিত ক্ষেত্র পূরণ হয়; প্রতিটি তথ্যের উৎস-প্রমাণ থাকে"
        actions={
          <div className="flex gap-1.5">
            <StateChip state={aiAvailable ? "ok" : "warn"} label={aiAvailable ? "এআই সক্রিয়" : "এআই বিচ্ছিন্ন — নিয়ম-ভিত্তিক fallback চলছে"} />
            <StateChip state={sensitive ? "error" : "ok"} label={sensitive ? "সংবেদনশীল সংকেত" : "সাধারণ"} />
          </div>
        }
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div ref={listRef} className="h-80 space-y-2 overflow-y-auto rounded-md border border-border bg-muted/50 p-3" aria-live="polite" aria-label="কথোপকথন">
              {turns.length === 0 ? (
                <p className="text-xs text-muted-foreground/70">নিচে বাংলায় লিখে শুরু করুন — যেমন: “আমার নাম রহিমা বেগম, জয়পুরহাটে থাকি। স্বামী ভরণপোষণ দেন না।”</p>
              ) : null}
              {turns.map((t, i) => (
                <div key={i} className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${t.role === "user" ? "ml-auto bg-emerald-800 text-white" : "bg-white text-foreground border border-border"}`}>
                  {t.text}
                </div>
              ))}
              {busy ? <p className="text-xs text-muted-foreground/70">…</p> : null}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="বাংলায় লিখুন… (Enter চাপুন)"
                className="h-10 text-sm"
                aria-label="আপনার কথা"
              />
              <Button className="bg-primary hover:bg-primary/90" onClick={send} disabled={busy}>পাঠান</Button>
            </div>
            <ErrorNote message={error} />
            {handoffReason ? (
              <div className="mt-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900">
                <b>মানব-হস্তান্তর (T5 guardrail):</b> {handoffReason} — কর্মকর্তার কিউতে প্রসঙ্গসহ গেছে; এআই সিদ্ধান্ত নেয়নি।
              </div>
            ) : null}
            {submitted ? (
              <div className="mt-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-primary">
                আবেদন একই শেয়ারড রেকর্ডে তৈরি হয়েছে: <b>{submitted}</b> — হেল্পলাইন/ইউডিসি/ডিএলএও সবাই এটিই দেখবে (G1)।
                <button className="ml-2 underline" onClick={() => nav("applications")}>কার্য-তালিকায় দেখুন</button>
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            <div className="rounded-md border border-border bg-card p-3">
              <p className="text-xs font-semibold text-muted-foreground">স্লট-অবস্থা (অনুমোদিত ক্ষেত্র মাত্র)</p>
              <ul className="mt-2 space-y-1.5 text-xs">
                {Object.keys(SLOT_LABELS).map((k) => (
                  <li key={k} className="flex items-start justify-between gap-2">
                    <span className="text-muted-foreground">{SLOT_LABELS[k]}</span>
                    <span className={`max-w-[60%] text-right ${slots[k] ? "text-foreground" : "text-stone-300"}`}>{slots[k] ? slots[k].slice(0, 60) : "—"}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 h-1.5 rounded bg-muted">
                <div className="h-1.5 rounded bg-emerald-600" style={{ width: `${(filledCount / 5) * 100}%` }} />
              </div>
            </div>
            <div className="rounded-md border border-dashed border-border bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
              <b className="text-foreground/85">নিয়ন্ত্রণ-রেখা:</b> এআই প্রকাশিত নিয়ম ব্যাখ্যা করতে পারে — যোগ্যতার সিদ্ধান্ত নেয় না।
              উত্তরগুলো ট্রেসেবল ও নিশ্চিতযোগ্য; সংবেদনশীল/অস্পষ্ট হলে প্রসঙ্গসহ মানুষের কাছে যায়।
              {status === "AWAITING_CONFIRMATION" && !submitted ? (
                <Button size="sm" className="mt-2 w-full bg-primary hover:bg-primary/90" onClick={submit} disabled={busy || filledCount < 5}>
                  নিশ্চিত করে আবেদন জমা দিন
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
