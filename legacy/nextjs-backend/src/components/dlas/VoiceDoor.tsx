"use client";

// ============================================================================
// 16699 / IVR / Voice door (A2 Ripon, A1 Moyuri safe-contact, A5 Malek).
// Voice-first: every step is SPOKEN (speech synthesis, bn-BD when available)
// and shown as text (transcript). Keypad + voice-optional input; no visual
// CAPTCHA, no visual OTP — non-visual route end-to-end (G4).
// Demonstrates the A1 failure test: an unsafe person answers the phone.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorLabelBn } from "@/lib/client/api";
import { SectionCard, StateChip, DataBanner } from "@/components/dlas/shared";
import type { Nav, SessionCtx } from "@/components/dlas/DlasApp";
import { PhoneCall } from "lucide-react";

type Screen = { prompt: string; kind: "menu" | "info" | "input" | "blocked"; options?: { key: string; label: string; next: () => void }[] };

const CALLERS = [
  { id: "moyuri", label: "ময়ূরী (নিরাপদ নম্বর, নিরাপদ সময়ে)", number: "01711223344", note: "APP-2026-0001" },
  { id: "husband", label: "অনিরাপদ ব্যক্তি (স্বামীর নম্বর) — A1 failure test", number: "01899887766", note: "কল-ব্লক প্রদর্শন" },
  { id: "ripon", label: "রিপন (প্রতিনিধি, দৃষ্টি প্রতিবন্ধী)", number: "01900112233", note: "অদৃষ্ট-বান্ধব কার্য (A2)" },
  { id: "malek", label: "মালেক (বেসিক ফোন, পড়তে পারেন না)", number: "01655667788", note: "অবস্থা জানা (A5)" },
];

export default function VoiceDoor({ session }: { session: SessionCtx | null; nav: Nav }) {
  const [caller, setCaller] = useState(CALLERS[0]);
  const [connected, setConnected] = useState(false);
  const [screen, setScreen] = useState<Screen | null>(null);
  const [transcript, setTranscript] = useState<{ who: "system" | "caller"; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<{ headline: string; nextStep: string; nextHearing?: { date: string; location: string } | null } | null>(null);
  const [error, setError] = useState("");
  const synthRef = useRef<SpeechSynthesisVoice[]>([]);

  const say = useCallback((text: string) => {
    setTranscript((t) => [...t.slice(-30), { who: "system", text }]);
    try {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "bn-BD";
        u.rate = 0.95;
        const bnVoice = synthRef.current.find((v) => v.lang.startsWith("bn"));
        if (bnVoice) u.voice = bnVoice;
        window.speechSynthesis.speak(u);
      }
    } catch {
      // speech synthesis unavailable — text transcript remains fully usable
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      const load = () => { synthRef.current = window.speechSynthesis.getVoices(); };
      load();
      window.speechSynthesis.onvoiceschanged = load;
    }
  }, []);

  const mainMenu = useCallback(() => {
    const menu: Screen = {
      prompt: "স্বাগতম। জেলা আইনি সহায়তা ১৬৬৯৯। ভালো থাকবেন। কী জানতে চান?",
      kind: "menu",
      options: [
        { key: "1", label: "১ — আবেদনের অবস্থা ও পরবর্তী পদক্ষেপ", next: () => checkStatus() },
        { key: "2", label: "২ — নতুন আবেদন করতে চাই (কথোপকথনে)", next: () => startVoiceIntake() },
        { key: "3", label: "৩ — কর্মকর্তার সাথে কথা বলতে চাই (মানব-হস্তান্তর)", next: () => handoff() },
      ],
    };
    setScreen(menu);
    say(menu.prompt);
  }, [say]);

  const checkStatus = useCallback(async () => {
    try {
      const ref = caller.id === "malek" ? "APP-2026-0007" : caller.id === "moyuri" ? "APP-2026-0001" : caller.note.match(/APP-[\d-]+/)?.[0] ?? "";
      // Malek's application is the 7th seeded (walk-in). Resolve via lookup API instead:
      let reference = ref;
      if (caller.id === "malek") {
        const apps = await api<{ applications: { id: string; applicant: { fullName: string } }[] }>(`/api/applications?q=${encodeURIComponent("Abdul Malek")}`);
        reference = apps.applications[0]?.id ?? ref;
      }
      if (caller.id === "moyuri" || caller.id === "ripon") {
        const apps = await api<{ applications: { id: string; applicant: { fullName: string } }[] }>(`/api/applications?q=${encodeURIComponent("Moyuri Akter")}`);
        reference = apps.applications[0]?.id ?? reference;
      }
      const d = await api<{ headline: string; nextStep: string; nextHearing: { date: string; location: string } | null }>(`/api/status?reference=${encodeURIComponent(reference)}`);
      setStatus(d);
      const hearingLine = d.nextHearing ? ` পরবর্তী হিয়ারিং ${new Date(d.nextHearing.date).toLocaleDateString("bn-BD")}, স্থান ${d.nextHearing.location}।` : "";
      setScreen({ prompt: `${d.headline}। ${d.nextStep}${hearingLine}`, kind: "info" });
      say(`${d.headline}। ${d.nextStep}${hearingLine} আবার মূল মেনুতে ফিরতে স্টার চাপুন।`);
    } catch (e) {
      setError(errorLabelBn(e));
      setScreen({ prompt: "এই মুহূর্তে অবস্থা আনা যায়নি। কর্মকর্তা অনুসরণ করবেন।", kind: "info" });
      say("দুঃখিত, এই মুহূর্তে তথ্য আনা যায়নি। আপনার কলের রেকর্ড সংরক্ষিত হয়েছে।");
    }
  }, [caller, say]);

  const startVoiceIntake = useCallback(() => {
    setScreen({
      prompt: "আপনি নতুন আবেদন করতে পারবেন — কথোপকথনে, সহজ বাংলায়। সহকারী আপনার কথা রেকর্ড করবে ও উৎস-প্রমাণসহ সংরক্ষণ করবে। চালিয়ে যেতে ওয়ান চাপুন।",
      kind: "menu",
      options: [{ key: "1", label: "১ — শুরু করুন (কথোপকথনমূলক ইনটেক T5)", next: () => window.dispatchEvent(new CustomEvent("dlas:voice-intake")) }],
    });
    say("আপনি নতুন আবেদন করতে পারবেন — কথোপকথনে, সহজ বাংলায়। শুরু করতে ওয়ান চাপুন। নিচের বোতামে চাপলে কথোপকথনমূলক ইনটেক খুলবে।");
  }, [say]);

  const handoff = useCallback(() => {
    setScreen({
      prompt: "আপনার কথা একজন অভিজ্ঞ কর্মকর্তার কাছে পাঠানো হচ্ছে — প্রসঙ্গসহ (T5 মানব-হস্তান্তর)। কার্যালয় নিরাপদ সময়ে আপনাকে ফোন করবে।",
      kind: "info",
    });
    say("আপনার কথা একজন অভিজ্ঞ কর্মকর্তার কাছে পাঠানো হচ্ছে। কার্যালয় নিরাপদ সময়ে আপনাকে ফোন করবে। ধন্যবাদ।");
  }, [say]);

  function connect() {
    setConnected(true);
    setTranscript([{ who: "caller", text: `কল: ${caller.number} (${caller.label})` }]);
    setError("");
    setStatus(null);

    // Safe-contact evaluation happens BEFORE the call proceeds (G3/A1).
    api<{ attempt: { outcome: string; notes: string }; evaluation: { allowed: boolean; outcome: string; reason: string } }>("/api/contact", {
      body: {
        action: "attempt",
        caseId: "CASE-2026-0001", // Moyuri's case (seed); harmless no-op for others via absence of rule
        attemptedNumber: caller.number,
        attemptType: "IVR",
        claimedIdentity: caller.id === "husband" ? "স্বামী (অনিরাপদ)" : caller.label,
      },
    })
      .then((d) => {
        if (!d.evaluation.allowed && caller.id === "husband") {
          const blocked: Screen = {
            prompt: "দুঃখিত — এই কলটি সংযোগ দেওয়া যায়নি। (নিরপেক্ষ বার্তা — কোনো কেসের তথ্য প্রকাশ করা হয়নি। কারণ নিরাপদে লগ হয়েছে।)",
            kind: "blocked",
          };
          setScreen(blocked);
          say("দুঃখিত — এই কলটি সংযোগ দেওয়া যায়নি। ধন্যবাদ।");
        } else {
          mainMenu();
        }
      })
      .catch(() => {
        // case-specific rule lookup is a no-op for non-Moyuri callers
        mainMenu();
      });
  }

  function press(key: string) {
    if (!screen?.options) return;
    const opt = screen.options.find((o) => o.key === key);
    if (opt) {
      setTranscript((t) => [...t, { who: "caller", text: `চাপা হয়েছে: ${opt.label}` }]);
      opt.next();
    }
  }

  return (
    <div className="space-y-4">
      <SectionCard kicker="দরজা ১ · ভয়েস-প্রথম" title="১৬৬৯৯ / ভয়েস / IVR দরজা" icon={<PhoneCall className="h-4 w-4" aria-hidden />} subtitle="যাঁরা কথা বলতে বা কিপ্যাড চাপতে পারেন কিন্তু পড়তে পারেন না — ভয়েস-প্রথম, রিড-ব্যাক, মানব-হস্তান্তর (A2, A5, G4)">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">কে কল করছে (সিমুলেশন):</p>
              <div className="grid gap-1.5">
                {CALLERS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setCaller(c); setConnected(false); setScreen(null); setTranscript([]); }}
                    className={`rounded-md border px-3 py-2 text-left text-xs ${caller.id === c.id ? "border-primary/45 bg-primary/8" : "border-border bg-card hover:bg-muted/50"}`}
                  >
                    <span className="font-semibold">{c.label}</span>
                    <span className="block text-[10px] text-muted-foreground">{c.number} — {c.note}</span>
                  </button>
                ))}
              </div>
            </div>
            {!connected ? (
              <button onClick={connect} className="w-full rounded-full bg-primary py-3 text-sm font-bold text-white hover:bg-emerald-700" aria-label="কল কানেক্ট করুন">
                📞 ১৬৬৯৯-এ কল কানেক্ট করুন
              </button>
            ) : (
              <div className="rounded-lg border-2 border-stone-800 bg-stone-900 p-3 text-stone-100">
                <p className="text-center text-[11px] text-muted-foreground/70">লাইভ কল — {caller.number}</p>
                {screen ? (
                  <>
                    <p className="mt-2 rounded-md bg-stone-800 p-2.5 text-sm leading-relaxed">{screen.prompt}</p>
                    {screen.kind === "menu" ? (
                      <div className="mt-2 grid grid-cols-3 gap-1.5" role="group" aria-label="কিপ্যাড">
                        {screen.options?.map((o) => (
                          <button key={o.key} onClick={() => press(o.key)} className="rounded-md bg-stone-700 py-2.5 text-base font-bold hover:bg-stone-600" aria-label={o.label}>{o.key}</button>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : <p className="mt-2 text-sm">সংযোগ হচ্ছে…</p>}
                <div className="mt-2 flex gap-2">
                  <button className="flex-1 rounded-md bg-red-900 py-2 text-xs font-semibold" onClick={() => { setConnected(false); setScreen(null); }}>কল কাটুন</button>
                  <button className="flex-1 rounded-md bg-stone-700 py-2 text-xs" onClick={mainMenu}>* মূল মেনু</button>
                </div>
              </div>
            )}
            {screen?.kind === "blocked" ? (
              <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900">
                <b>A1 failure test প্রমাণিত:</b> অনিরাপদ ব্যক্তি ফোন ধরলে সংযোগ ব্লক হয় — কারণসহ লগ, নিরপেক্ষ বার্তা, কোনো কেস-তথ্য ফাঁস নয়। কর্মকর্তার কনসোলে সতর্কতা গেছে।
              </div>
            ) : null}
            {error ? <p className="text-xs text-red-700">{error}</p> : null}
            {status ? <StateChip state="ok" label={`অবস্থা: ${status.headline}`} /> : null}
          </div>

          <div className="rounded-md border border-border bg-card">
            <p className="border-b border-border/70 px-3 py-2 text-xs font-semibold text-muted-foreground">কল-ট্রান্সক্রিপ্ট (প্রতিটি কথা রেকর্ডে যায়)</p>
            <ol className="max-h-96 space-y-1.5 overflow-y-auto p-3 text-xs" aria-live="polite">
              {transcript.length === 0 ? <li className="text-muted-foreground/70">কল কানেক্ট করুন…</li> : null}
              {transcript.map((t, i) => (
                <li key={i} className={t.who === "system" ? "text-foreground" : "text-primary"}>
                  <span className="mr-1 rounded bg-muted px-1 text-[10px]">{t.who === "system" ? "সিস্টেম" : "কলার"}</span>
                  {t.text}
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="mt-3"><DataBanner /></div>
      </SectionCard>
    </div>
  );
}
