# Case brief: ADLASB Final Round, "Five Doors, One Record"

Summary of `reference/ADLASB-Final-Round-Case.pdf` (Accelerating Digital Legal Aid Services in Bangladesh).

**The final question:** can one digital legal-aid architecture serve five very different citizens, support seven provider roles and integrate eleven technical challenges, without fragmenting the case record or replacing human judgment?

**Rules that shape the code**
- **Build one system, not 23 islands.** One Application ID / Case ID, data model, permission set, task engine, document history and audit trail.
- **A channel is an interface, not a separate case-management system.** The five "doors" (web, 16699 helpline, UDC, voice/USSD, DLAO walk-in/referral) all write to the same record.
- **Part B design rule:** a helpline note, UDC intake, mediator action, lawyer update, referral acknowledgement or admin report must update or reference the SAME case record.
- **Labelled simulations** are acceptable only for external integrations that can't reasonably be connected live.
- **Human judgment stays final.** AI explains, drafts and flags; people decide eligibility, priority, routing and settlements.

**Deliverables:** solution paper (26 Sep 2026, ≤2 pages), then pitch deck + public prototype URL + 90-second fallback recording (27 Sep 2026, 08:00), then Grand Finale (10-min pitch + 10-min Q&A).

## Part A: five citizens

| ID | Citizen | Barrier | Failure test |
|---|---|---|---|
| A1 | Moyuri Akter, Joypurhat | Husband controls her phone; NID inaccessible; brother Ripon reported for her | An unsafe person answers the phone |
| A2 | Ripon, authorised representative | Blind; can't use visual forms, PDF, CAPTCHA or visual OTP | Complete a task without a sighted helper |
| A3 | Nabila, Jhenaidah | Fake/altered images spreading; needs urgency, restricted evidence, referral | Receiving authority doesn't acknowledge |
| A4 | Nuching Marma, Khagrachari | Can't read; speaks Marma; UDC types for her on his own number; weak network | Network drops halfway through submission |
| A5 | Abdul Malek, Barguna | 7-month case; number on file belongs to a shop; lawyer updates missing | Panel lawyer misses two updates |

## Part B: seven provider roles

| ID | Role | Must achieve |
|---|---|---|
| B1 | DLAO officer | Unified queue (new, pending, overdue, priority) with a reason for every flag; override recorded |
| B2 | Legal Aid Officer / Mediator | Registration → notices → attendance/docs → mediation → outcome; remote/hybrid option plus in-person fallback |
| B3 | 16699 helpline agent | Look up by Application/Case ID; Bangla intake writing to the same record |
| B4 | UDC entrepreneur | Assisted intake with checklist, consent/provenance, safe contact, free-service notice, network-loss recovery |
| B5 | Panel lawyer | Worklist, accept/decline, hearings, updates; a missed deadline alerts the DLAO without a chase call |
| B6 | Receiving DLAO | Complete referral package; acknowledge/accept/return; status visible to both offices |
| B7 | Admin / case-support staff | Structured record, search, version history, routine reporting from captured data |

## Part C: eleven technical challenges

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

Where each item lives in the code: see [06-requirements-coverage.md](./06-requirements-coverage.md).

---
← [Context index](./README.md) · Full single file: [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)
