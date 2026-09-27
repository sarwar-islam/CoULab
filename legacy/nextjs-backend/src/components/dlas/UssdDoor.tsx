"use client";

// USSD/SMS door — basic phones, weak/no data. Short flows, neutral and
// privacy-aware messages (G3/A1). Rendered inside a feature-phone frame.

import { useState } from "react";
import { api, errorLabelBn } from "@/lib/client/api";
import { SectionCard, DataBanner } from "@/components/dlas/shared";
import { MessageSquareText } from "lucide-react";

type Msg = { from: "system" | "user"; text: string };

const SCRIPTS: Record<string, string> = {
  moyuri: "01711223344",
  malek: "01655667788",
};

export default function UssdDoor() {
  const [as, setAs] = useState<"moyuri" | "malek">("malek");
  const [screen, setScreen] = useState<string[]>(["জেলা আইনি সহায়তা\n১) অবস্থা দেখুন\n২) নতুন আবেদন-তথ্য\n৩) হেল্পলাইনে কলব্যাক চান"]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function show(text: string) {
    setScreen((s) => [...s, text]);
  }

  async function send() {
    const choice = input.trim();
    if (!choice) return;
    setInput("");
    setMsgs((m) => [...m, { from: "user", text: choice }]);
    setBusy(true);
    setError("");
    try {
      if (choice === "1") {
        const apps = await api<{ applications: { id: string; applicant: { fullName: string } }[] }>(
          `/api/applications?q=${encodeURIComponent(as === "malek" ? "Abdul Malek" : "Moyuri Akter")}`,
        );
        const ref = apps.applications[0]?.id;
        if (!ref) throw new Error("APPLICATION_NOT_FOUND");
        const d = await api<{ headline: string; nextStep: string; nextHearing: { date: string; location: string } | null }>(`/api/status?reference=${ref}`);
        show(
          `অবস্থা:\n${d.headline}\n${d.nextStep}${d.nextHearing ? `\nহিয়ারিং: ${new Date(d.nextHearing.date).toLocaleDateString("bn-BD")}` : ""}\n\n* মূল মেনু: ০`,
        );
        setMsgs((m) => [...m, { from: "system", text: "এসএমএস: আপনার আবেদন হালনাগাদ হয়েছে। বিস্তারিত কার্যালয়ে জানুন। (নিরপেক্ষ বার্তা)" }]);
      } else if (choice === "2") {
        show("নতুন আবেদন: ইউডিসি/কার্যালয়ে যান বা ১৬৬৯৯-এ কল করুন। সেবা সম্পূর্ণ বিনামূল্যে।\n\n* মূল মেনু: ০");
      } else if (choice === "3") {
        show("অনুরোধ গৃহীত। নিরাপদ সময়ে কলব্যাক পাবেন। (যোগাযোগ-নিয়ম অনুসরণ করা হবে)\n\n* মূল মেনু: ০");
        setMsgs((m) => [...m, { from: "system", text: "কলব্যাক-অনুরোধ লগ হয়েছে — কর্মকর্তার কিউতে যোগ হয়েছে।" }]);
      } else if (choice === "0") {
        setScreen((s) => [...s, "জেলা আইনি সহায়তা\n১) অবস্থা দেখুন\n২) নতুন আবেদন-তথ্য\n৩) হেল্পলাইনে কলব্যাক চান"]);
      } else {
        show("অজানা নির্বাচন। সংক্ষিপ্ত মেনু: ১/২/৩, মূল মেনু: ০");
      }
    } catch (e) {
      setError(errorLabelBn(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <SectionCard kicker="দরজা ২ · বেসিক ফোন" title="ইউএসএসডি / এসএমএস দরজা" icon={<MessageSquareText className="h-4 w-4" aria-hidden />} subtitle="বেসিক ফোন; দুর্বল/নেই ডেটা; সংক্ষিপ্ত ফ্লো; নিরপেক্ষ ও গোপনীয়তা-সচেতন বার্তা (A1/A5, G3)">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="flex gap-1.5">
              <button className={`rounded-md border px-2.5 py-1.5 text-xs ${as === "malek" ? "border-primary/45 bg-primary/8 font-semibold" : "border-border"}`} onClick={() => { setAs("malek"); setScreen([]); setMsgs([]); }}>
                মালেক (দোকানের নম্বর)
              </button>
              <button className={`rounded-md border px-2.5 py-1.5 text-xs ${as === "moyuri" ? "border-primary/45 bg-primary/8 font-semibold" : "border-border"}`} onClick={() => { setAs("moyuri"); setScreen([]); setMsgs([]); }}>
                ময়ূরী (নিরাপদ নম্বর)
              </button>
            </div>
            {/* feature-phone frame */}
            <div className="mx-auto w-full max-w-xs rounded-2xl border-4 border-stone-700 bg-stone-800 p-3">
              <div className="mb-2 rounded-md bg-lime-100 p-2 font-mono text-[11px] leading-snug text-foreground min-h-28">
                {screen.slice(-3).map((s, i) => (
                  <pre key={i} className="whitespace-pre-wrap">{s}</pre>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  className="w-full rounded-md bg-muted px-2 py-1.5 font-mono text-sm"
                  placeholder="১/২/৩…"
                  aria-label="ইউএসএসডি ইনপুট"
                />
                <button onClick={send} disabled={busy} className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white">পাঠান</button>
              </div>
            </div>
            {error ? <p className="text-xs text-red-700">{error}</p> : null}
          </div>
          <div className="rounded-md border border-border bg-card p-3">
            <p className="text-xs font-semibold text-muted-foreground">এসএমএস বার্তা (নিরপেক্ষ ভাষা — কেসের বিষয় প্রকাশ করে না)</p>
            <ul className="mt-2 space-y-1.5 text-xs" aria-live="polite">
              {msgs.length === 0 ? <li className="text-muted-foreground/70">কোনো বার্তা নেই…</li> : null}
              {msgs.map((m, i) => (
                <li key={i} className={`rounded-md border p-2 ${m.from === "system" ? "border-border bg-muted/50" : "border-emerald-200 bg-emerald-50"}`}>{m.text}</li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              চ্যানেল-নিয়ম: দরজা শুধু ইন্টারফেস — একই রেকর্ড হালনাগাদ হয়; পৃথক কেস-ম্যানেজমেন্ট সিস্টেম নয়।
              ডেটা-নির্ভরতা কম; প্রতিটি বার্তা ContactRule-এর neutralWording মেনে তৈরি।
            </p>
          </div>
        </div>
        <div className="mt-3"><DataBanner /></div>
      </SectionCard>
    </div>
  );
}
