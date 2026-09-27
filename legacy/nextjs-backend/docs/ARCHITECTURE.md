# DLAS — System Architecture

> Bangladesh Digital Legal Aid System prototype · ADLASB Grand Finale case
> "Five Doors, One Record" · Next.js 16 · TypeScript · Prisma/SQLite · z-ai SDK

## 1. Architecture at a glance

```
┌────────────────────────────────────────────────────────────────────────┐
│ ACCESS LAYER — five doors, one interface rule                          │
│  16699/IVR-voice · USSD/SMS · Web/mobile (Bangla-first) · Assisted     │
│  (UDC/representative) · DLAO walk-in/referral                          │
│  CHANNEL RULE: a channel is an interface, never a case system.         │
└──────────────┬─────────────────────────────────────────────────────────┘
               │  Next.js 16 App Router (single page shell + /api routes)
┌──────────────▼─────────────────────────────────────────────────────────┐
│ SERVICE LAYER (shared, reused by every scenario)                        │
│  auth/session+role gate · case lifecycle engine · task & notification  │
│  engine · provenance & consent · safe-contact · audit (append-only)    │
│  AI orchestrator (T5 intake / T6 briefing / T7 drafting) · T8 triage   │
│  pipeline · T4 fuzzy match · referral/routing+escalation · lawyer      │
│  management+inactivity · T9 offline sync · T11 e-signature             │
└──────────────┬─────────────────────────────────────────────────────────┘
               │  Prisma ORM
┌──────────────▼─────────────────────────────────────────────────────────┐
│ DATA SPINE (one authoritative record)                                   │
│  Applicant → Application (APP-ID, channel, status) → Case (CASE-ID)    │
│  RecordEntry(provenance) · Consent · ContactRule/Attempt · Task ·      │
│  Notification · DocumentRecord(versions) · ChecklistTemplate ·         │
│  Referral · LawyerAssignment/Hearing/Update/ChangeRequest ·            │
│  MediationSession · SettlementDraft · SignatureSession/Record ·        │
│  IncidentGroup · DuplicateCandidate · TriageRun · OfflineSyncRecord ·  │
│  IntakeSession · SensitiveAccessLog · AuditEntry (append-only)         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 2. Key decisions and their reasons

| Decision | Reason (tied to requirements) |
|---|---|
| **Single Next.js app, one route `/`, state-routed views** | The case demands one integrated system, not 23 islands. One shell + role-filtered nav makes every item reachable and testable (Live demonstrability; G1). Deep links (`/?view=…&id=…`) power the Coverage Index. |
| **Application ID minted at submission; Case ID only on acceptance** | Backbone rule from the PDF. `acceptApplication()` is the single transition that mints CASE-…, guarded by a transition table (`assertApplicationTransition`) — illegal transitions return 400, never silently proceed. |
| **Provenance as first-class data** | G2 requires distinguishing applicant-confirmed / representative-reported / intermediary-translated / staff-entered / AI-inferred. Every statement/document carries the tag; UI badges render it everywhere. |
| **Audit as a service, not a table-spread** | G10: one `writeAudit()` (actor, role, channel, action, before/after, reason, onWhoseAuthority) called by every module; append-only; also feeds Coverage Index evidence counts. |
| **Rule-first AI, thin functions** | T5–T7 guardrails: deterministic guardrails (sensitivity detector, JSON validation, fallback text) run regardless of model output; each AI function is a single call with logged structured reason — no opaque agent framework (per case PDF "four thin functions"). |
| **Recommend/decide split** | T8/T4/duplicate/reject flows return a RECOMMENDED state; a human action with mandatory reason (OverrideBox) moves it to HUMAN_REVIEWED/OVERRIDDEN. Authority is recorded, not implied. |
| **SQLite via Prisma (sandbox constraint)** | Relational model matches the case-spine directly; schema is portable to PostgreSQL (the demo/production target) without model changes. SQLite limitation: enums → String fields validated against `src/lib/constants.ts` at the API boundary. |
| **Sessions in DB, httpOnly cookie** | Enables revocation on reseed/logout, and *scope-limited citizen sessions* (no account/password): Application ID + last-4 of registered phone/NID → read of exactly one record (G9). |
| **Service worker caches shell only** | T10 guardrail: case data must not persist on shared UDC devices; API responses are never cached; logout clears the session cookie. |

## 3. Human-in-the-loop boundary (what the system may and may not do)

**The system may (autonomously):** collect, validate format/consistency, tag provenance, compute similarity scores, run triage components, detect overdue/deadline/escalation conditions, queue offline work, verify cryptographic integrity.

**The system must escalate to a human (and never decide):**
- eligibility / acceptance / rejection of an application (officer, reason recorded)
- final priority and jurisdiction (officer override or accepted recommendation, reason recorded)
- duplicate verdicts (side-by-side review; no auto-merge/reject/fraud label)
- lawyer reassignment + payment reconciliation; pattern alerts stay "review only"
- jurisdiction routing after T2 escalation (officer only; receiver forbidden)
- mediation outcome (mediator records it)
- settlement finalization (mediator review notes mandatory)
- referral acknowledgement/return (receiving office only)
- withdrawal/correction requests from citizens (become tasks; never auto-applied)

**Escalation triggers implemented:** T5 sensitive/ambiguous signals → task with context; T2 two returns → escalation task; referral non-ack → follow-up task+notification; lawyer inactivity pattern → review task; offline conflict → review queue; AI failure → visible fallback state (never fabricated content).

## 4. Failure & resilience model

| Failure | Behaviour |
|---|---|
| AI service unavailable | Module returns explicit `aiAvailable:false` + reason; rule-based checklist/template skeleton continues; user sees a stated limitation, never fabricated output |
| Network loss mid-submission (T9) | Client enqueues with tempUuid + SHA-256; visible queued state; sync is idempotent; conflict → human review |
| Unsafe caller (A1) | `evaluateContact()` blocks before connection; reason logged; officer notified; neutral wording to caller |
| Referral never acknowledged (A3) | ack-deadline scan creates HIGH follow-up task + officer notification |
| Lawyer misses deadlines (A5/T1) | Overdue task flags in DLAO queue + lawyer worklist; missed hearing + cross-case pattern → separate review alert |
| Illegal state transition | 400 with `ILLEGAL_TRANSITION:from→to` — no silent state drift |
| Role overreach | 403 with the specific guard (`FORBIDDEN_ONLY_RECEIVER`, `FORBIDDEN_ONLY_AUTHORISED_HUMAN`, …) |

## 5. Security & data protection

- httpOnly, SameSite=Lax session cookies; 12 h TTL; server-side revocation.
- Role gate on every API route (`requireRole`), plus *action-level* guards (receiver-only, lawyer-only, officer-only).
- Citizen sessions scope-limited to a single application.
- Restricted/SENSITIVE material: filtered from unauthorized roles; every access logged (`SensitiveAccessLog` + audit).
- Document payloads are not returned in list endpoints (metadata only); raw content only via the detail route.
- No real NIDs/cases/beneficiary data — masked `nidRef` and illustrative names only (sample-data rule).
- Known prototype boundaries (stated, not hidden): demo PINs instead of national credential integration; SQLite instead of managed Postgres; see docs/LIMITATIONS.md.
