# PROJECT_CONTEXT — CoU JusticeLab / আইনসহায় (DLAS)

> **Five Doors, One Record.** An integrated Digital Legal Aid System (DLAS) prototype for Bangladesh, built for the ADLASB Hackathon Final Round.
> Live: **https://ain-shohay.vercel.app/** · Source: https://github.com/Sakhawathossen04/AinShohay

This file (inside `context/`) is the single reference for the whole project: what it is, how it is built, how to run, test and deploy it, and exactly what was changed during the September 2026 cleanup.

---

## 1. What this project is

The ADLASB final case (`context/reference/ADLASB-Final-Round-Case.pdf`) asks for **one** integrated legal-aid system, not 23 separate mini-projects. It must serve:

- **Part A: 5 citizen scenarios.** Moyuri, Ripon, Nabila, Nuching and Malek.
- **Part B: 7 provider roles.** DLAO officer, Legal Aid Officer/Mediator, 16699 helpline agent, UDC entrepreneur, panel lawyer, receiving DLAO, and DLAO admin/case-support staff.
- **Part C: 11 technical challenges.** Lawyer change, jurisdiction ping-pong, related incidents, duplicates, a Bangla intake agent, a document agent, a settlement assistant, multi-agent triage, offline sync, a low-bandwidth PWA and e-signature.

All of this runs on **one shared record**: the same Application ID / Case ID, data model, permissions, task engine, document history and audit trail. External integrations that can't reasonably be connected live are labelled simulations.

The deployed product has a Bangla-first citizen portal (legal topics, articles, forms, news, eligibility, apply, track, office finder, chat assistant). It also has a provider console where the seven roles work the same records.

---

## 2. Tech stack (intentionally minimal)

| Layer | Choice |
|---|---|
| Runtime | Node.js **≥ 22** (uses the built-in `node:sqlite`) |
| Server | Plain `node:http`, no framework, **zero npm dependencies** |
| Data | SQLite via `node:sqlite` (`data/dev.db`, created at boot and seeded automatically) plus a JSON store (`data/app-db.json`) for citizen accounts and the portal |
| Frontend | Static vanilla HTML/CSS/JS in `public/`, with Leaflet (CDN) for maps and Google Fonts (Hind Siliguri, Noto Serif Bengali, Inter) |
| AI features | Deterministic, rule-based engines with guardrails (`server/services/ai.js`, `triage.js`). No API keys needed. |
| Hosting | Vercel (zero-config; `server.js` exports the HTTP server) |

No build step. `npm install` is not needed.

---

## 3. Folder structure

```
.
├── server.js                  # Entry point: HTTP server, static files, /api router
├── package.json               # Scripts only; no dependencies
├── README.md                  # Quick start
├── CHANGELOG.md               # Release notes
├── .nvmrc                     # Node 22
│
├── public/                    # Everything the browser loads (URLs unchanged)
│   ├── index.html             # Single-page shell (Bangla, data-theme)
│   ├── css/styles.css         # All styles
│   ├── js/app.js              # Citizen portal SPA
│   ├── js/console.js          # Provider console (7 roles)
│   ├── js/i18n.js             # Bangla / English strings
│   ├── img/                   # Hero and topic photos (optimized JPEGs)
│   ├── icon.svg, manifest.json  # PWA assets
│
├── server/
│   ├── db.js                  # SQLite data spine: schema, migrations, demo seed
│   ├── app-db.js              # JSON store for portal accounts/applications (falls back to in-memory if the filesystem is read-only)
│   ├── constants.js           # Case types, jurisdictions, stages, templates
│   ├── seed.js                # Portal content: topics, 199 articles, forms, news, 67 offices
│   ├── routes/                # One handler per API area (see §5)
│   └── services/              # Shared domain logic used by the routes
│       ├── session.js         #   staff/citizen sessions, cookies
│       ├── crypto.js          #   PIN hashing, integrity hashes
│       ├── audit.js           #   hash-chained audit trail
│       ├── lifecycle.js       #   application → case state machine
│       ├── triage.js          #   multi-agent triage pipeline (T8)
│       ├── ai.js              #   intake / document brief / settlement engines (T5–T7)
│       ├── checklist.js       #   document checklists
│       ├── duplicate.js       #   duplicate scoring (T4)
│       ├── safe-contact.js    #   safe-contact rules (A1, A3)
│       └── lawyer-inactivity.js # lawyer follow-up / inactivity (T1, A5)
│
├── data/
│   └── app-db.json            # Seed state for the JSON store (committed on purpose)
│
├── tests/
│   ├── smoke-test.js          # Covers all 23 ADLASB items, transitions, security, audit (30 checks)
│   └── test-ain-shohay-api.js # Portal compatibility API (16 checks)
│
├── scripts/
│   ├── inspect-schema.js      # Print the SQLite schema (npm run db:inspect)
│   └── seed-embed.js          # One-off content tool, already applied to server/seed.js; kept for reproducibility
│
├── context/reference/
│   ├── ADLASB-Final-Round-Case.pdf   # The official case brief
│   └── DLAS-design-prototype.html    # Original bundled design prototype
│
└── legacy/                    # NOT deployed, NOT imported. Kept for history (see legacy/README.md)
    ├── front-v1-static/       # Earlier, smaller version of this same app
    └── nextjs-backend/        # Alternative Next.js + Prisma implementation, with its own docs
```

---

## 4. Request flow

```
Browser ──► server.js
             ├─ /api/*  → parse cookies → session context → JSON body
             │            → switch(rootRoute) → server/routes/<area>.js
             │            → services/* → db.js (SQLite) / app-db.js (JSON)
             │            → audit.js writes a hash-chained AuditEntry
             └─ otherwise → static file from public/ (unknown paths fall back to index.html for the SPA)
```

`server/routes/ain-shohay.js` is the **frontend compatibility router**. It serves the endpoints the citizen portal and console call directly (`bootstrap`, `article`, `sections`, `form`, `newsitem`, `offices`, `chat`, `track`, `register/login/me`, `dlao_queue`, `role_view`, `referral`, `mediation`, `esign`, `sync_push`, `case_report`, and others). It uses the same shared record as the domain routes.

---

## 5. API surface (`/api/<root>`)

| Root | Handler | Purpose |
|---|---|---|
| `auth`, `logout` | routes/auth.js, server.js | Staff PIN login, citizen login, unified logout |
| `applications` | routes/applications.js (+ compat) | Create/list/update applications across all five doors |
| `cases` | routes/cases.js | Case record, representation, lifecycle |
| `status`, `track` | routes/status.js | Citizen tracking by reference + secret |
| `contact` | routes/contact.js | Safe-contact attempts and rules |
| `triage` | routes/triage.js | Multi-agent triage run (T8) |
| `duplicates` | routes/duplicates.js | Duplicate candidates + human review (T4) |
| `referrals` | routes/referrals.js | Tracked referral, acknowledgement, ping-pong escalation (B6, T2) |
| `mediation`, `settlements`, `signatures` | routes/mediation.js | Sessions, settlement drafting, async e-signature (B2, T7, T11) |
| `lawyer` | routes/lawyer.js | Worklist, hearings, change requests, inactivity (B5, T1) |
| `sync` | routes/sync.js | Offline-first push, conflict and integrity checks (T9) |
| `coverage` | routes/coverage.js | Coverage index of all 23 requirements |
| `audit` | routes/audit.js | Audit trail |
| `documents` | routes/documents.js | Document records + briefing agent (T6) |
| `incident-groups` | routes/incident-groups.js | Related incidents + shared evidence (T3) |
| `attachments` | routes/attachments.js | Multipart uploads |
| `bootstrap`, `article`, `form`, `sections`, `newsitem`, `offices`, `chat` | routes/ain-shohay.js / resources.js | Portal content and assistant |

---

## 6. Data model (SQLite, `server/db.js`)

Applicant, Application, Case, RecordEntry, Task, AuditEntry, Consent, ContactRule, ContactAttempt, SensitiveAccessLog, ChecklistTemplate, DocumentRecord, DuplicateCandidate, IncidentGroup, IntakeSession, TriageRun, Referral, LawyerAssignment, LawyerChangeRequest, LawyerUpdate, Hearing, MediationSession, SettlementDraft, SignatureSession, SignatureRecord, OfflineSyncRecord, Notification, Session, User, Counter.

The schema mirrors `legacy/nextjs-backend/prisma/schema.prisma` in the SQLite dialect. Print it live with `npm run db:inspect`.

---

## 7. Requirement coverage (from `/api/coverage`)

| ID | Requirement | Console view | Main code |
|---|---|---|---|
| A1 | Moyuri: safe contact, identity gap, representation | case-detail | services/safe-contact.js, routes/contact.js, routes/cases.js |
| A2 | Ripon: blind access, independent status/task | channel | routes/status.js, routes/auth.js (representative), ain-shohay.js `ivr`/`representation` |
| A3 | Nabila: urgency, sensitive access, tracked referral | case-detail | services/triage.js, routes/referrals.js, SensitiveAccessLog in db.js |
| A4 | Nuching: assisted access, provenance, offline | intake | routes/applications.js (provenance, consent), routes/sync.js |
| A5 | Malek: long-running status, unstable contact, lawyer follow-up | case-detail | routes/status.js, services/lawyer-inactivity.js, routes/contact.js |
| B1 | DLAO officer: operational view, backlog, priority, follow-up | officer | ain-shohay.js `dlao_queue`, services/triage.js, public/js/console.js |
| B2 | Mediator: end-to-end mediation, remote/hybrid | mediation | routes/mediation.js |
| B3 | 16699 helpline agent: shared look-up, Bangla intake | channel | routes/status.js, routes/applications.js |
| B4 | UDC entrepreneur: assisted intake, checklist, safe contact, free-service notice | intake | routes/applications.js, services/checklist.js, services/safe-contact.js |
| B5 | Panel lawyer: worklist, hearings/deadlines, updates | lawyer | routes/lawyer.js |
| B6 | Receiving DLAO: complete referral, acknowledgement/status | referrals | routes/referrals.js |
| B7 | Admin staff: structured record, search, reporting | national | routes/cases.js, ain-shohay.js `case_search`/`case_report` |
| T1 | Lawyer change, repeated inactivity, payment reconciliation | lawyer | routes/lawyer.js, services/lawyer-inactivity.js |
| T2 | Jurisdiction ping-pong, escalation | referrals | routes/referrals.js |
| T3 | Related incident cases, shared evidence | case-detail | routes/incident-groups.js, routes/attachments.js |
| T4 | Duplicate detection, human review | duplicates | routes/duplicates.js, services/duplicate.js |
| T5 | Conversational Bangla intake agent | intake | services/ai.js (intake), ain-shohay.js `chat` |
| T6 | Document summary/checklist agent | documents | routes/documents.js, services/ai.js (briefing) |
| T7 | Settlement drafting assistant | mediation | routes/mediation.js, services/ai.js (settlement) |
| T8 | Multi-agent triage pipeline | officer | routes/triage.js, services/triage.js |
| T9 | Offline-first sync, conflict/integrity handling | sync | routes/sync.js, services/crypto.js |
| T10 | Low-bandwidth PWA | pwa | public/manifest.json, ain-shohay.js `pwa_manifest`, light mode in public/ |
| T11 | Asynchronous secure e-signature | mediation | routes/mediation.js (signatures), services/crypto.js |

---

## 8. Demo access

- **Provider PIN:** `1234` for every staff user:
  `officer.joypurhat`, `officer.jhenaidah`, `officer.barguna` (DLAO officers) · `mediator.joypurhat` · `helpline.agent1` · `udc.khagrachari` · `lawyer.shahana`, `lawyer.kabir` · `receiving.dhaka` · `support.staff1` · `admin` · `ripon.rep` (representative)
- **Citizen tracking:** `APP-2026-0001` / `3344` (Moyuri Akter)

---

## 9. Run, test, deploy

```bash
node -v            # must be ≥ 22
npm start          # http://localhost:3000   (PORT env var overrides)
npm test           # smoke suite (30) + portal API suite (16)
npm run test:smoke
npm run test:api
npm run db:inspect # print SQLite schema
```

- **Environment variables:** only `PORT` (optional). No secrets are needed.
- **Deploy:** push to the GitHub repo that Vercel is connected to. Vercel serves `server.js` with zero config. `.vercelignore` keeps `legacy/` and `context/` out of the deployment bundle.
- **Persistence note:** on Vercel the filesystem is read-only, so `db.js` and `app-db.js` fall back to in-memory storage. Demo data is re-seeded on each cold start. This is intended for the prototype.
- **Test side effect:** the test suites write to `data/app-db.json`. Run `git checkout data/app-db.json` afterwards if you don't want to commit that change.

---

## 10. Cleanup log (September 2026)

Goal: organize and lighten the project **without changing** what the site does or how it looks.

### What changed

| Change | Why | Risk check |
|---|---|---|
| `Front/` → `legacy/front-v1-static/` | Older, smaller copy of the live app (app.js 82 KB vs 187 KB live; styles 36 KB vs 105 KB). Nothing imports it. | Not referenced by the runtime |
| `Backend/` → `legacy/nextjs-backend/` | Separate Next.js/Prisma implementation. Not the deployed app, but its docs and schema are valuable. | Not referenced by the runtime |
| Deleted `screenshots-gallery.html` (2.1 MB) | Standalone, unlinked screenshot dump. | No references anywhere |
| `inspect_schema.js` → `scripts/inspect-schema.js` | Debug utility doesn't belong at the root; require path fixed. | Verified it runs |
| `server/seed-embed.js` → `scripts/seed-embed.js` | One-off content generator (already applied: seed.js contains its 12 enriched news items). Never required at runtime; paths fixed. | Not required by any module |
| Removed 8 unused imports | `url` and a duplicate inner `SESSION_COOKIE` require in server.js; `SYSTEM_ACTOR` (applications, auth), `getSessionContext` (auth), `SETTLEMENT_TEMPLATES` (ai), `hashPin` (session), `CASE_TYPES` (triage) | Only unused destructured names removed; modules still load; all tests pass |
| Re-encoded `public/img/*.jpg` | 4.8 MB → 1.06 MB (−78%). Same filenames and pixel dimensions; progressive JPEG, quality 82. | PSNR 37–39 dB vs originals (visually indistinguishable) |
| `package.json` scripts | Added `test` (both suites), `test:smoke`, `test:api`, `db:inspect` | `start`/`dev` unchanged |
| Added `.editorconfig`, `.vercelignore`; extended `.gitignore` (`*.tmp`, `data/dev.db*`, `.vercel/`) | Repo hygiene | No runtime effect |
| Removed stray `.keep` in legacy backend | Empty placeholder in a non-empty folder | — |
| Added the `context/` folder (index, 8 topic files, this combined file, `reference/` with the case PDF and prototype), plus `README.md`, `CHANGELOG.md`, `legacy/README.md` | One-stop onboarding and review | No runtime effect |
| Added `.nvmrc` (22) | Pins the Node version that provides `node:sqlite` | No runtime effect |

### What was deliberately NOT changed

- `public/index.html`, `css/styles.css`, `js/app.js`, `js/console.js`, `js/i18n.js`, `manifest.json`, `icon.svg`: **byte-identical** to the originals and to the live site. Cache-busting query strings (`?v=19` etc.) are untouched.
- The server architecture, route handlers, business logic, schema, seed content and `data/app-db.json`.
- Every URL and API path.
- `topic_*.jpg` and `tracking_citizen.jpg` are not referenced in the current code (only `hero_gavel.jpg` is, from styles.css). They are still publicly served on the live site, so they were kept (compressed) rather than deleted.

### Verification performed

1. **Before:** smoke suite 30/0, API suite 16/0; the live site's HTML/CSS/JS matched the repo `public/` by MD5.
2. **After:** smoke suite 30/0, API suite 16/0.
3. The original and organized servers were run side by side and 30 URLs were compared (static files, SPA fallback, 404/405/400 paths, and data APIs). All matched once per-boot timestamps and random IDs were normalized. The only remaining difference was the audit log, which records the test requests themselves.
4. Image fidelity was measured with PSNR (37–39 dB).

---

## 11. Known quirks worth knowing (not changed, to preserve behavior)

- There are two data stores (SQLite plus a JSON file) because the portal compatibility layer and the DLAS spine grew separately. Merging them would be a functional change.
- `node:sqlite` prints an `ExperimentalWarning` on Node 22/24. This is harmless.
- Some routes are dispatched in two ways: `applications` goes to the domain handler when `applicantName` and `channel` are present, and to the compatibility router otherwise.

---

## Appendix: Case brief: ADLASB Final Round, "Five Doors, One Record"

Summary of `context/reference/ADLASB-Final-Round-Case.pdf` (Accelerating Digital Legal Aid Services in Bangladesh).

**The final question:** can one digital legal-aid architecture serve five very different citizens, support seven provider roles and integrate eleven technical challenges, without fragmenting the case record or replacing human judgment?

**Rules that shape the code**
- **Build one system, not 23 islands.** One Application ID / Case ID, data model, permission set, task engine, document history and audit trail.
- **A channel is an interface, not a separate case-management system.** The five "doors" (web, 16699 helpline, UDC, voice/USSD, DLAO walk-in/referral) all write to the same record.
- **Part B design rule:** a helpline note, UDC intake, mediator action, lawyer update, referral acknowledgement or admin report must update or reference the SAME case record.
- **Labelled simulations** are acceptable only for external integrations that can't reasonably be connected live.
- **Human judgment stays final.** AI explains, drafts and flags; people decide eligibility, priority, routing and settlements.

**Deliverables:** solution paper (26 Sep 2026, ≤2 pages), then pitch deck + public prototype URL + 90-second fallback recording (27 Sep 2026, 08:00), then Grand Finale (10-min pitch + 10-min Q&A).

### Part A: five citizens

| ID | Citizen | Barrier | Failure test |
|---|---|---|---|
| A1 | Moyuri Akter, Joypurhat | Husband controls her phone; NID inaccessible; brother Ripon reported for her | An unsafe person answers the phone |
| A2 | Ripon, authorised representative | Blind; can't use visual forms, PDF, CAPTCHA or visual OTP | Complete a task without a sighted helper |
| A3 | Nabila, Jhenaidah | Fake/altered images spreading; needs urgency, restricted evidence, referral | Receiving authority doesn't acknowledge |
| A4 | Nuching Marma, Khagrachari | Can't read; speaks Marma; UDC types for her on his own number; weak network | Network drops halfway through submission |
| A5 | Abdul Malek, Barguna | 7-month case; number on file belongs to a shop; lawyer updates missing | Panel lawyer misses two updates |

### Part B: seven provider roles

| ID | Role | Must achieve |
|---|---|---|
| B1 | DLAO officer | Unified queue (new, pending, overdue, priority) with a reason for every flag; override recorded |
| B2 | Legal Aid Officer / Mediator | Registration → notices → attendance/docs → mediation → outcome; remote/hybrid option plus in-person fallback |
| B3 | 16699 helpline agent | Look up by Application/Case ID; Bangla intake writing to the same record |
| B4 | UDC entrepreneur | Assisted intake with checklist, consent/provenance, safe contact, free-service notice, network-loss recovery |
| B5 | Panel lawyer | Worklist, accept/decline, hearings, updates; a missed deadline alerts the DLAO without a chase call |
| B6 | Receiving DLAO | Complete referral package; acknowledge/accept/return; status visible to both offices |
| B7 | Admin / case-support staff | Structured record, search, version history, routine reporting from captured data |

### Part C: eleven technical challenges

| ID | Challenge | Key guardrail |
|---|---|---|
| T1 | Lawyer who doesn't answer: change request, reassignment, payment reconciliation, inactivity alert | A pattern triggers review; it does not establish misconduct |
| T2 | Jurisdiction tug-of-war: escalate after repeated returns | The system escalates; a human decides the route |
| T3 | Multiple applicants, one incident: related-incident group, shared evidence | Link, never merge |
| T4 | Duplicate / fraud-risk detection with side-by-side review | Never auto-reject, auto-merge or label someone fraudulent |
| T5 | Conversational Bangla intake agent | AI doesn't decide eligibility; facts traceable |
| T6 | Document summary and checklist agent | Unclear content surfaced, not guessed |
| T7 | Settlement drafting assistant | Draft only; AI-inferred text marked; human review mandatory |
| T8 | Multi-agent triage (≥3 components) with conflict surfacing | Concise reasons, not hidden chain-of-thought; human final say |
| T9 | Offline-first, integrity-verifiable sync | State the threat model; no claim of absolute tamper-proofing |
| T10 | Low-bandwidth PWA with a light mode | Don't cache sensitive data on shared devices |
| T11 | Offline-capable secure asynchronous e-signature | Integrity-verifiable, consent recorded |

Where each item lives in the code: see §7 above.


---

## v3.0.0 update (27 September 2026)

This file describes the v2 layout. For v3, the current sources of truth are:
- Folder structure and request flow: [03-architecture.md](./03-architecture.md)
- Demo logins, tests and Vercel deploy: [07-run-test-deploy.md](./07-run-test-deploy.md)
- System design: [09-system-design.md](./09-system-design.md)
- Judging-criteria evidence and demo script: [10-judging-criteria.md](./10-judging-criteria.md)
- Every change: [../CHANGELOG.md](../CHANGELOG.md)

Key v3 changes: server split into layers (`server/app.js`, `router.js`, `http/`, `db/`, `domain/`, `content/`); one login form; master PIN removed; provider access guard; real hash-chained audit with `/api/audit/verify`; voice/USSD doors fixed and merged into the DLAO queue; offline outbox + service worker; read-aloud and accessibility fixes; all emoji removed; Vercel free-plan deploy.
