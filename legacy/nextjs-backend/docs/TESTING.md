# DLAS — Testing & Verification

## 1. Testing strategy

Three layers, all automated and re-runnable:

1. **API smoke suite** — `scripts/smoke-test.sh` (36 assertions). Walks the six
   integrated flows end-to-end at the API level, including the PDF's failure
   tests and **negative RBAC tests** (wrong role must be refused).
2. **Browser E2E** — `scripts/browser-check.sh` visits all 26 views, fails on
   client exceptions or empty renders. Interactive spot-checks via
   agent-browser (login, voice door unsafe-caller block, case record).
3. **Static** — `bun run lint` (ESLint) clean.

## 2. Smoke suite coverage map (as run — 36/36 passing)

| # | Flow | Verified |
|---|------|----------|
| 0–1 | Health + officer login | session endpoint, role returned |
| 2 | Coverage Index | 23 items + live audit evidence counts |
| 3 | Flow 1 — A1 Moyuri | lookup, safe-contact active, **unsafe caller → BLOCKED_UNSAFE**, rule set |
| 4 | Backbone lifecycle | create → review → **accept mints CASE-…** |
| 5 | Flow 3 — T8 triage | 3 agents run; human override recorded with reason |
| 6 | T4 duplicate scan | candidates created with evidence; review list |
| 7 | Flow 5 — B6/T2 referral | receiver login; package created; **sender cannot acknowledge (RBAC)**; return×2 → escalation; **receiver cannot route (human authority)**; officer final routing |
| 8 | Flow 2 — T9 offline | offline item creates record; **duplicate tempUuid does not re-create**; conflicting edit → CONFLICT (human review) |
| 9 | Flow 4 — T11 signature | mediator login; **officer cannot open session (RBAC)**; session opened (doc hash + nonces); signature bound & verified; independent verification (document intact) + guardrail text |
| 10 | G10 audit | entries present with authority field |
| 11 | B7 reports | computed from captured data |
| 12 | Citizen door | APP-ID + last-4 verification; **scope-limited reads (G9)** — other applications invisible |

## 3. Live AI verification (executed during the build)

- **T5**: Bangla multi-turn intake filled 5/5 slots over 3 turns and submitted
  → `APP-2026-0034` on the shared record. A sensitive message
  ("মারধর… জীবনের নিরাপত্তা") triggered `HUMAN_HANDOFF` with the reason and an
  officer task.
- **T6**: briefing generated for the 5-document land case — 6 sourced points,
  checklist PRESENT/UNCLEAR/MISSING states correct (bilingual keyword match).
- **T7**: template-grounded drafts render AI-inferred spans highlighted;
  inconsistency warnings (amount mismatch, missing date) generated.
- All AI modules verified to degrade to explicit rule-based fallback states.

## 4. PDF failure tests — status

| Failure test from PDF | Where to see it | Status |
|---|---|---|
| Unsafe person answers the phone (A1) | Voice door → "অনিরাপদ ব্যক্তি" → connect → blocked + logged | ✅ verified |
| Network drops halfway through submission (A4) | UDC intake → toggle network off → submit → queued → sync → no duplicate | ✅ implemented (ST §8) |
| Receiving authority does not acknowledge (A3) | Seed: referral with past ack-deadline → follow-up task + alert; inbox shows overdue banner | ✅ seeded + ST §7 |
| Panel lawyer misses two updates (A5) | Seed: OVERDUE update tasks + missed hearings → DLAO queue flags + T1 pattern alert | ✅ seeded |
| Agents disagree (T8) | Triage on urgency-flagged case with incomplete docs → conflict surfaced → human override | ✅ ST §5 |
| Similar-but-different trap cases (T4) | Seed corpus (e.g. রহিমা বেগম Khulna vs Rahima Begum Rajshahi) — human can mark NOT_A_DUPLICATE | ✅ seeded |

## 5. Re-running everything

```bash
bun run db:push          # ensure schema
bun run scripts/seed.ts  # reset illustrative demo data (PIN 1234 everywhere)
bash scripts/smoke-test.sh
bash scripts/browser-check.sh
bun run lint
```

Note: seeding deletes existing sessions — log in again in the UI afterwards.
