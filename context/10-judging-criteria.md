# Judging criteria: evidence and demo script

Every claim below points to working code and, where possible, an automated test (`npm test`, 60 checks) that proves it.

## Evidence by criterion

### 1. System integration & architecture (20%)
- **One service, one router, one record.** `server/app.js` handles every request; `server/router.js` is the single dispatch table.
- **All five doors write the same Application.** Web form, voice, USSD, UDC-assisted and representative filings, plus offline sync, all land on the shared record and the SQLite case spine. Tests: *Voice door saved a real application*, *Offline record synced into shared record + case spine*.
- **All seven roles read it.** The DLAO queue merges every door into one list, and the officer opens any record from it. Tests: *Voice-door application appears in the DLAO queue*, *Officer can open the voice-door record*.
- **Clear state transitions.** `services/lifecycle.js` runs the application-to-case state machine (diagram in 09-system-design.md, section 3).
- **No islands.** v3 connected the USSD simulator and fixed the voice and USSD doors. Before, they failed to save and showed invented IDs.

### 2. Technical quality & reliability (20%)
- Layered code: config, http, router, routes, services, db. Zero dependencies.
- **Failure handling:** save outcomes are reported (`storage: {record, caseSpine}`) and failures logged; network loss goes to the offline outbox; the UI never invents an application ID; a read-only filesystem falls back to `/tmp` or memory.
- **Source traceability:** a hash-chained audit trail with public verification (`/api/audit/verify`), and per-field provenance on every application.
- **Tests:** 30 smoke checks cover all 23 requirements, 30 API checks cover the integration, security and offline fixes, and `npm run check:vercel` simulates the deployed runtime.

### 3. Practical service improvement / legal impact (15%)
- The free-service notice is shown on every submission (B4).
- Safe contact (safe number, unsafe numbers, call window, neutral wording) for Moyuri (A1).
- Tracked referrals with acknowledgement and ping-pong escalation (B6, T2); lawyer inactivity alerts and change requests (T1, A5).
- Mediation with a settlement draft and asynchronous e-signature, verified by document hash (B2, T7, T11).
- **Nothing bypasses the law:** acceptance, rejection, priority and legal advice need a named human; AI output is labelled as a suggestion.

### 4. Innovation (10%)
- Multi-agent triage (categoriser, urgency, jurisdiction, checklist agents) produces explainable evidence, and a human signs off.
- Per-field provenance: applicant-confirmed, representative-reported, intermediary-translated, staff-entered, AI-inferred.
- A tamper-evident audit chain that anyone can verify.
- An offline outbox with idempotent replay, built for UDC centres with unstable connections.

### 5. Inclusion & accessibility (10%)
- **Doors for every situation:** voice/IVR (disability, low literacy), USSD for feature phones, UDC-assisted and representative filing.
- **Low literacy / low vision:** "পড়ে শোনান" reads the page aloud (Web Speech, Bangla voice where available), with font size and high-contrast controls.
- **Keyboard and screen readers:** skip link, visible focus ring, `aria-live` main region, labelled buttons (the emoji-only icons were replaced with text).
- **Weak devices and connectivity:** service-worker app shell (T10), offline outbox (T9), compressed images (4.8 MB to 1.06 MB), no framework bundle.
- **Language:** Bangla-first UI with an English toggle.

### 6. Privacy, safety & responsible AI (10%)
- **Bounded access:** anonymous users get 401 and citizens get 403 on case-spine routes; views are role-scoped; sensitive records are gated and denials audited. Tests: *Anonymous reads refused on 7 routes*, *Citizen session cannot read the case list*.
- **No master PIN;** 5-attempt lockout; HttpOnly sessions; citizens cannot elevate their role. Tests cover all three.
- **Safe contact** rules are enforced before any contact attempt.
- **Human authority and explainability:** every AI output carries evidence and a "suggestion only" label, and every decision is audited with its actor and authority.

### 7. Feasibility, interoperability & scalability (10%)
- Runs on the Vercel free plan or any Node 22 host, with no build and no dependencies.
- Storage sits behind `server/db/`; the SQLite schema mirrors the Prisma model in `legacy/nextjs-backend`, so a Postgres move is mechanical.
- Channels map to DLAS operations (`WEB`, `VOICE_IVR`, `USSD_SMS`, `ASSISTED_UDC`, `HELPLINE`, `DLAO_WALKIN`); external systems (SMS, NID, USSD gateway) are clean, labelled adapter points.

### 8. Presentation & multidisciplinary teamwork (5%)
- `/api/coverage` lists all 23 requirements with the console view that demonstrates each.
- This folder brings the legal (case brief, safeguards), technical (architecture, API, data model), design (accessibility, doors) and governance (audit, human authority) reasoning together.

## 10-minute demo script

| Time | Show | Criterion |
|---|---|---|
| 0:00 | Home page: five doors, Bangla-first, "পড়ে শোনান" read-aloud | Inclusion |
| 1:00 | `#/apply`: submit Moyuri-style application; free-service notice; real ID | Service impact |
| 2:00 | `#/ussd`: apply from a feature phone; a real ID comes back | Integration |
| 3:00 | Log out, then `#/login` once as `officer.joypurhat` / `1234`: the same queue shows web + USSD + voice | Integration |
| 4:00 | Open A1 Moyuri: safe contact, provenance, audit; accept (human decision) | Privacy, human authority |
| 5:00 | Run T8 triage: explainable agent evidence, officer decides | Innovation, responsible AI |
| 6:00 | A3 Nabila: sensitive record; switch to the helpline view: access denied and audited | Bounded access |
| 7:00 | Referral + acknowledgement (B6), ping-pong escalation (T2) | Service impact |
| 8:00 | Mediation, settlement draft, e-signature verify (T7, T11) | Technical quality |
| 9:00 | Open `/api/audit/verify` in the browser: chain valid. Turn the network off and submit: queued, then synced | Reliability, offline |
| 9:40 | `/api/coverage`: 23/23 | Presentation |
