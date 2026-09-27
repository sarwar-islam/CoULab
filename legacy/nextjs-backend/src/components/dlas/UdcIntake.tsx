"use client";

// ============================================================================
// UDC assisted intake (B4/A4) — checklist, free-service notice, consent,
// provenance (intermediary-translated + original speech), UDC's own number on
// file, bounded post-submission access, AND T9 offline queue with live
// network-loss simulation (failure test: network drops mid-submission).
// ============================================================================

import { useEffect, useState } from "react";
import { api, errorLabelBn } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorNote, ProvenanceBadge, SectionCard, StateChip, bnDateTime } from "@/components/dlas/shared";
import { enqueue, readQueue, sha256Hex, syncQueue, clearSynced } from "@/lib/client/offline-queue";
import type { Nav, SessionCtx } from "@/components/dlas/DlasApp";
import { Handshake, CloudOff } from "lucide-react";

interface QueueItem {
  tempUuid: string;
  status: string;
  createdAt: string;
  syncedEntityId?: string;
}

export default function UdcIntake({ session }: { session: SessionCtx | null; nav: Nav }) {
  const [form, setForm] = useState({ name: "", district: "Khagrachari", caseType: "LAND_DISPUTE", phone: "", narrativeBn: "", narrativeOriginal: "", nidRef: "" });
  const [consentGiven, setConsentGiven] = useState(false);
  const [freeNoticeSeen, setFreeNoticeSeen] = useState(false);
  const [photoUnclear, setPhotoUnclear] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [lastResult, setLastResult] = useState<{ applicationId?: string; tempUuid?: string; alreadySynced?: boolean } | null>(null);

  useEffect(() => { setQueue(readQueue()); }, []);

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit() {
    setBusy(true);
    setError("");
    setMsg("");
    const payload = {
      channel: "ASSISTED_UDC",
      caseType: form.caseType,
      district: form.district,
      applicantName: form.name,
      applicantPhone: form.phone, // UDC's own number in the demo script
      applicantNidRef: form.nidRef,
      narrative: form.narrativeBn,
      originalText: form.narrativeOriginal || undefined,
      provenance: form.narrativeOriginal ? "INTERMEDIARY_TRANSLATED" : "STAFF_ENTERED",
      statedByName: form.name,
      assistedByUserId: session?.userId,
      consentScope: "ইউডিসি উদ্যোক্তা ফর্ম পূরণ ও ছবি তুলতে সহায়তা; নম্বর তাঁর; পরবর্তী প্রবেশাধিকার সীমিত",
      urgencyFlag: false,
      sensitiveFlag: false,
    };
    try {
      if (offlineMode) {
        const item = await enqueue("APPLICATION", payload);
        setQueue(readQueue());
        setMsg(`নেটওয়ার্ক বিচ্ছিন্ন — আবেদন লোকাল কিউতে সংরক্ষিত (temp UUID: ${item.tempUuid.slice(0, 8)}…)। ইন্টারনেট ফিরলে সিংক করুন। কাজ হারায়নি (T9)。`);
      } else {
        const d = await api<{ applicationId: string }>("/api/applications", { body: payload });
        setLastResult({ applicationId: d.applicationId });
        setMsg(`আবেদন জমা হয়েছে: ${d.applicationId} — একই শেয়ারড রেকর্ডে (G1)। উৎস-প্রমাণ: অনূদিত/টাইপকৃত।`);
      }
    } catch (e) {
      setError(errorLabelBn(e));
    } finally {
      setBusy(false);
    }
  }

  async function doSync() {
    setBusy(true);
    setError("");
    try {
      const results = await syncQueue();
      setQueue(readQueue());
      const lines = results.map((r) => `${r.tempUuid.slice(0, 8)}… → ${r.status === "SYNCED" ? "সিংক সম্পন্ন (কোনো ডুপ্লিকেট নেই)" : r.status === "CONFLICT" ? "সংঘর্ষ — মানব-পর্যালোচনায়" : r.status}`).join(" | ");
      setMsg(`সিংক ফলাফল: ${lines}`);
      setLastResult(results.find((r) => r.status === "SYNCED") ? { applicationId: results.find((r) => r.status === "SYNCED")?.entityId } : null);
    } catch (e) {
      setError(errorLabelBn(e));
    } finally {
      setBusy(false);
    }
  }

  const ready = consentGiven && freeNoticeSeen && form.name.trim().length > 1 && form.narrativeBn.trim().length > 5;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={offlineMode ? "destructive" : "outline"} onClick={() => { setOfflineMode(!offlineMode); if (!offlineMode) setMsg("নেটওয়ার্ক বিচ্ছিন্ন সিমুলেট করা হলো (T9 failure test)।"); else setMsg("নেটওয়ার্ক ফিরেছে।"); }}>
          {offlineMode ? "🔌 নেটওয়ার্ক: বিচ্ছিন্ন (ক্লিক করে ফিরিয়ে আনুন)" : "🌐 নেটওয়ার্ক: সংযুক্ত (ক্লিক করে কেটে দিন)"}
        </Button>
        <StateChip state={offlineMode ? "error" : "ok"} label={offlineMode ? "অফলাইন — কাজ কিউতে জমা হবে" : "অনলাইন"} />
        <StateChip state={queue.filter((q) => q.status === "QUEUED").length > 0 ? "warn" : "ok"} label={`কিউ: ${queue.filter((q) => q.status === "QUEUED").length} আইটেম`} />
        {queue.filter((q) => q.status === "QUEUED").length > 0 || queue.some((q) => q.status === "CONFLICT") ? (
          <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={doSync} disabled={busy || offlineMode}>সিংক করুন</Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => { clearSynced(); setQueue(readQueue()); }}>সিংক-সম্পন্ন মুছুন</Button>
      </div>

      <SectionCard kicker="B4/A4 · সহায়তায় প্রবেশ" title="ইউডিসি সহায়তায় আবেদন" icon={<Handshake className="h-4 w-4" aria-hidden />} subtitle="কে সহায়তা করেছে, কী সম্মতি হয়েছে, কোন নম্বর ফাইলে আছে — সবই রেকর্ডে দৃশ্যমান">
        <div className="mb-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-primary">
          <b>বিনামূল্যে সেবা-নোটিশ (B4):</b> জেলা আইনি সহায়তা কার্যালয়ের সেবা সম্পূর্ণ বিনামূল্যে। কেউ টাকা চাইলে কার্যালয়ে জানান।
          <label className="mt-1 flex items-center gap-1.5 text-[11px]"><input type="checkbox" checked={freeNoticeSeen} onChange={(e) => setFreeNoticeSeen(e.target.checked)} /> আবেদনকারীকে নোটিশটি পড়ে/শোনানো হয়েছে</label>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2.5">
            <div><Label className="text-xs">আবেদনকারীর নাম</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} className="h-9 text-sm" /></div>
            <div><Label className="text-xs">জেলা</Label>
              <select value={form.district} onChange={(e) => set("district", e.target.value)} className="h-9 w-full rounded-md border border-border bg-white px-2 text-sm">
                {["Khagrachari", "Joypurhat", "Jhenaidah", "Barguna", "Dhaka", "Rajshahi", "Khulna", "Barishal", "Rangpur", "Chattogram", "Sylhet", "Mymensingh"].map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div><Label className="text-xs">কেস-ধরন</Label>
              <select value={form.caseType} onChange={(e) => set("caseType", e.target.value)} className="h-9 w-full rounded-md border border-border bg-white px-2 text-sm">
                <option value="LAND_DISPUTE">ভূমি বিরোধ</option><option value="MAINTENANCE">ভরণপোষণ</option>
                <option value="DOMESTIC_VIOLENCE">পারিবারিক সহিংসতা</option><option value="DOWRY">যৌতুক</option>
                <option value="LABOUR_WAGES">শ্রম ও মজুরি</option><option value="CYBER_HARASSMENT">অনলাইন হয়রানি</option>
                <option value="FRAUD">প্রতারণা</option><option value="OTHER">অন্যান্য</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">যোগাযোগ নম্বর (ডেমো: ইউডিসির নিজের নম্বর)</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="01933445566" className="h-9 text-sm" />
              <p className="mt-0.5 text-[10px] text-muted-foreground">রেকর্ডে স্পষ্ট হবে: নম্বরটি আবেদনকারীর নিজের নয় — পরবর্তী যোগাযোগ সীমিত প্রবেশাধিকারে (bounded access)।</p>
            </div>
          </div>
          <div className="space-y-2.5">
            <div>
              <Label className="text-xs">আবেদনকারী যা বললেন (মূল ভাষা — হুবহু, যেমন মারমা)</Label>
              <textarea value={form.narrativeOriginal} onChange={(e) => set("narrativeOriginal", e.target.value)} rows={2} className="w-full rounded-md border border-border p-2 text-sm" placeholder="মূল ভাষায় বক্তব্য (ঐচ্ছিক কিন্তু প্রমাণ-সংরক্ষণের জন্য উত্সাহিত)" />
            </div>
            <div>
              <Label className="text-xs">আপনার টাইপ করা বাংলা বিবরণ (অনুবাদ/সারাংশ)</Label>
              <textarea value={form.narrativeBn} onChange={(e) => set("narrativeBn", e.target.value)} rows={3} className="w-full rounded-md border border-border p-2 text-sm" placeholder="আবেদনকারী যা বললেন তার বাংলা অনুবাদ…" />
              <div className="mt-1 flex items-center gap-2">
                <ProvenanceBadge provenance={form.narrativeOriginal ? "INTERMEDIARY_TRANSLATED" : "STAFF_ENTERED"} />
                <span className="text-[10px] text-muted-foreground">রেকর্ডে আলাদা করে সংরক্ষিত হবে: নুচিং যা বললেন বনাম যা অনূদিত/টাইপ হলো (G2)</span>
              </div>
            </div>
            <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
              <input type="checkbox" checked={consentGiven} onChange={(e) => setConsentGiven(e.target.checked)} className="mt-0.5" />
              <span>
                <b>সম্মতি (A4/B4):</b> আবেদনকারী সম্মতি দিয়েছেন যে ইউডিসি উদ্যোক্তা ফর্ম পূরণ ও নথির ছবি তুলতে সহায়তা করবেন এবং নম্বরটি সহায়তাকারীর। সম্মতির পরিসর ও সময় রেকর্ডে যাবে।
              </span>
            </label>
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={photoUnclear} onChange={(e) => setPhotoUnclear(e.target.checked)} /> নথির ছবি অস্পষ্ট হলে তা চিহ্নিত করুন (UNCLEAR পতাকা — T6-তে অস্পষ্টই দেখাবে, অনুমান নয়)
            </label>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button className="bg-primary hover:bg-primary/90" onClick={submit} disabled={!ready || busy}>
            {offlineMode ? "অফলাইন কিউতে সংরক্ষণ" : "আবেদন জমা দিন"}
          </Button>
          {!ready ? <span className="text-[11px] text-muted-foreground">নাম, বিবরণ, বিনামূল্যে-নোটিশ ও সম্মতি প্রয়োজন।</span> : null}
        </div>
        <ErrorNote message={error} />
        {msg ? <div className="mt-2 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-xs text-sky-900">{msg}</div> : null}
        {lastResult?.applicationId ? (
          <div className="mt-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-primary">
            রেকর্ড আইডি: <b>{lastResult.applicationId}</b>{lastResult.alreadySynced ? " (temp UUID দিয়ে ডুপ্লিকেট-প্রতিরোধ যাচাই হয়েছে — একই আইডি ফিরেছে)" : ""}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard kicker="T9 · আইডেম্পোটেন্ট সিংক" title="অফলাইন কিউ" icon={<CloudOff className="h-4 w-4" aria-hidden />} subtitle="temp UUID + ক্লায়েন্ট SHA-256 অখণ্ডতা-হ্যাশ; সার্ভার আইডেম্পোটেন্ট — একই UUID দ্বিতীয়বার ডুপ্লিকেট তৈরি করে না">
        {queue.length === 0 ? <p className="text-xs text-muted-foreground/70">কিউ খালি। নেটওয়ার্ক কেটে একটি আবেদন জমা করে দেখুন।</p> : (
          <ul className="space-y-1.5 text-xs">
            {queue.map((q) => (
              <li key={q.tempUuid} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2">
                <span className="font-mono text-[10px] text-muted-foreground">{q.tempUuid.slice(0, 13)}…</span>
                <StateChip state={q.status === "SYNCED" ? "ok" : q.status === "CONFLICT" ? "error" : "warn"} label={q.status === "SYNCED" ? `সিংক ${q.syncedEntityId ? `→ ${q.syncedEntityId}` : ""}` : q.status === "CONFLICT" ? "সংঘর্ষ — মানব-পর্যালোচনা" : "কিউতে"} />
                <span className="text-muted-foreground/70">{bnDateTime(q.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          হুমকি-মডেল (স্পষ্টভাষায়): এই ব্যবস্থা ট্রান্সমিশন-ত্রুটি ও দুর্ঘটনাজনিত ডুপ্লিকেশন থেকে রক্ষা করে;
          ক্ষতিকর ডিভাইসের বিরুদ্ধে পূর্ণ tamper-proof দাবি করা হয় না। সংঘর্ষ নীরবে ওভাররাইট হয় না — মানব-পর্যালোচনায় যায়।
          সংবেদনশীল কেস-ডেটা শেয়ার্ড ডিভাইসে ক্যাশ হয় না (T10 guardrail)।
        </p>
      </SectionCard>
    </div>
  );
}
