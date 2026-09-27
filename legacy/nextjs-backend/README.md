# DLAS — পাঁচ দরজা, এক রেকর্ড (Five Doors, One Record)

Integrated Digital Legal Aid System (DLAS) prototype for the **ADLASB Grand
Finale case**. One shared record, five access doors, seven provider roles,
eleven technical challenges — with final legal decisions kept under human
control.

**The PDF (`ADLASB Hackathon_Final Round_Case.pdf`) is the sole requirements
source.** This build implements all 23 mandatory items and all 10 Golden
Thread behaviours; traceability is documented item-by-item in
[`docs/REQUIREMENTS-TRACEABILITY.md`](docs/REQUIREMENTS-TRACEABILITY.md).

## Quick start

The repository ships with a **pre-seeded SQLite database** (`prisma/dev.db`) and
a hardcoded datasource path, so no `.env` setup is needed.

**With Bun:**

```bash
bun install
bun run dev              # http://localhost:3000
```

**With npm / Node.js (18+):**

```bash
npm install
npm run dev              # http://localhost:3000
```

**Fresh database (optional)** — recreate the seeded demo data from scratch:

```bash
bun run db:push && bun run scripts/seed.ts     # Bun
npm run db:push && npx tsx scripts/seed.ts     # npm / Node.js
```

**Production build:**

```bash
bun run build && bun run start                 # Bun
npm run build && npm start                     # Node.js
```

Log in (staff/representative) with any seeded account — **PIN `1234`** — e.g.
`officer.joypurhat` (DLAO officer), `mediator.joypurhat`, `helpline.agent1`,
`udc.khagrachari`, `lawyer.kabir`, `receiving.dhaka`, `support.staff1`,
`ripon.rep`, `admin`. Citizens need no account: door verification =
Application ID + last 4 of the registered contact number (demo:
`APP-2026-0001` / `3344`).

## What to demonstrate (jury map)

| Jury asks | Open |
|---|---|
| "Show me any of the 23 items" | **কভারেজ ইনডেক্স** — live deep-links + audit evidence counts |
| A1 safe contact / unsafe caller | Voice door → "অনিরাপদ ব্যক্তি" → connect; case CASE-2026-0001 contact panel |
| A4 + T9 + B4 offline UDC intake | ইউডিসি সহায়তায় ইনটেক → toggle network off → submit → sync |
| T5 conversational intake (+handoff) | কথোপকথনমূলক ইনটেক — ordinary then sensitive message |
| T8 triage / T4 duplicates / T3 groups / T6 briefing / T1 lawyer / T2 jurisdiction | টেকনিক্যাল group dockets (all staff logins) |
| B2 mediation + T7 drafting + T11 signing | মধ্যস্থতা → নিষ্পত্তি-খসড়া → ই-স্বাক্ষর |
| B5 lawyer / B6 receiving office | lawyer.kabir / receiving.dhaka logins |
| G10 audit | অডিট ট্রেইল — who, what, when, which channel, on whose authority |

## Documentation set

- [`docs/REQUIREMENTS-TRACEABILITY.md`](docs/REQUIREMENTS-TRACEABILITY.md) — every mandatory item → component → evidence
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — layers, decisions, human-in-the-loop boundary, failure model
- [`docs/LEGAL-RULES.md`](docs/LEGAL-RULES.md) — every legal/procedural rule, its source, its enforcement point
- [`docs/TESTING.md`](docs/TESTING.md) — test strategy, coverage maps, PDF failure tests
- [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md) — threat model, simulations, stated boundaries

## Repository layout

```
prisma/schema.prisma          data spine (one authoritative record)
prisma/dev.db                 pre-seeded SQLite demo database (zero-config run)
src/lib/                      domain services (audit, lifecycle, safe-contact,
                              triage, duplicate, checklist, lawyer-inactivity)
src/lib/ai/                   T5 intake · T6 briefing · T7 drafting (+fallbacks)
src/app/api/                  REST route handlers (auth-gated, audit-writing)
src/components/dlas/          single-page shell + role-scoped views (Bangla-first)
public/                       PWA manifest, shell-only service worker (T10)
scripts/seed.ts               illustrative data + failure-test fixtures
scripts/smoke-test.sh         36-assertion API suite
scripts/browser-check.sh      26-view E2E check
```

## Notes for reviewers

- **Zero configuration**: the SQLite datasource path is hardcoded relative to
  `prisma/schema.prisma`; a pre-seeded demo database ships at `prisma/dev.db`.
- **AI-assist features (T5 intake, T6 briefing, T7 drafting)** degrade safely
  and visibly: if the AI service is unavailable the affected views show an
  explicit `AI_UNAVAILABLE` state and route work to humans, exactly as the
  human-in-the-loop boundary requires. No credentials are needed to review the
  rest of the system.
- **Deploy targets**: any Node host works (`npm run build && npm start`);
  Vercel/Netlify/Cloudflare Pages are supported for the Next.js app as-is.

## Governing principles (enforced in code)

1. A channel is an interface, never a case system — everything writes to the
   same Application/Case spine.
2. Provenance is data, not decoration — every statement/document/consent
   carries its origin and is rendered with a badge.
3. The system recommends; authorised humans decide — every consequential
   decision path requires a reason and records who exercised the authority.
4. Failure is visible — AI-unavailable, conflicts, blocks, overdue, escalated
   states all render explicitly; nothing fails silently.
5. Illustrative data only — no real NIDs, cases, beneficiaries, payments, or
   live calls.
