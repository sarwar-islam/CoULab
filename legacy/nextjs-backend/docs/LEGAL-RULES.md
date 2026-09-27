# DLAS — Legal & Procedural Rules Represented in the System

This document records **every legal/procedural rule the software encodes**, its
source, and its enforcement point. Rules marked "procedural" come from the
published DBLA application workflow as reproduced in the case PDF (Annex B1)
and the case text itself; the system invents **no** substantive law.

## 1. Published procedural rules (explainable by AI, enforced by workflow)

| Rule | Source | Enforcement |
|---|---|---|
| Legal-aid application and service are free of cost | Case PDF B4 ("Applicants may not know the service is free") | Mandatory free-service notice in UDC/HELPLINE intake (`freeServiceNoticeShown`), T5 published-rules prompt |
| Channels: online, 16699, UDC, district office walk-in | Case PDF five-doors table | `CHANNELS` constant; every submission records its channel |
| Submission → verification/eligibility review → approval opens case → panel lawyer assignment; rejection communicated with next-step guidance | Case PDF Annex B1 workflow | `APPLICATION_TRANSITIONS` state machine; `rejectionReason` mandatory; Task engine |
| Pre-case mediation first where applicable, with party consent | Case PDF B2 | `MediationSession` flow precedes lawyer assignment in the maintenance demo chain |
| Case types | Case PDF personas + published DLAS scope | `CASE_TYPES` (maintenance, domestic violence, dowry, land, labour/wages, cyber harassment, fraud, other) — used by intake, T5, T6 checklists, T8 |

## 2. Safety rules (Responsible-Design: privacy/safety)

1. **Safe contact (A1):** a case may carry one active `ContactRule`: ALLOW_ONLY
   (safe number ± time window) or BLOCK_NUMBERS/BLOCK_ALL. Every rule stores a
   mandatory reason. Contact attempts are evaluated *before* connecting;
   blocked attempts are logged with outcome `BLOCKED_UNSAFE`/`OUTSIDE_WINDOW`,
   notify the officer, and use neutral wording toward the caller.
2. **Neutral wording (G3):** notifications/SMS/IVR toward at-risk persons must
   not reveal the case subject (`neutralWording: true`).
3. **Sensitive material (A3):** `sensitivity` NORMAL/SENSITIVE/RESTRICTED on
   cases and documents. Non-authorised roles never receive the payload
   (filtered server-side). Every authorised access is logged
   (`SensitiveAccessLog` + audit entry with purpose).
4. **Minimal collection:** intake collects only the five approved slots (T5) +
   case-type checklist documents.

## 3. Human-authority rules (decisions the software may not make)

| Decision | Authorised human | Guard |
|---|---|---|
| Accept/reject application | DLAO officer | `reject` requires reason; audit `onWhoseAuthority` |
| Final priority / jurisdiction | DLAO officer | T8 PATCH (ACCEPT/OVERRIDE + reason) |
| Duplicate verdict | Officer / case-support | PATCH with notes; reviewer identity stored; no auto path exists |
| Lawyer assignment/reassignment | Officer | POST assign (human action), T1 reassign with reason |
| Payment status | Officer / case-support | PATCH payment + note (stage-based reconciliation note auto-drafted, human sets status) |
| Jurisdiction routing after escalation | Officer only | `route` action rejects receivers (RBAC test in smoke suite) |
| Mediation outcome | Mediator | `record_outcome` audit states "মধ্যস্থতাকারী — মানব-সিদ্ধান্ত" |
| Settlement finalization | Mediator | `finalize` requires review notes; only FINALIZED drafts can be signed |
| Case closure | Officer | Case transition writes outcome + closedByUserId |

## 4. AI guardrails (case PDF, T5–T8)

- T5: AI explains/checks published rules only; never decides eligibility;
  sensitive/ambiguous → human handoff **with context**; extracted slots are
  traceable, confirmable, and limited to approved fields.
- T6: unclear content is surfaced (status UNCLEAR), never guessed; every
  material point names its source document; officer verifies (AI_INFERRED).
- T7: output is a draft; AI-inferred spans visibly marked; human review, party
  understanding/consent and formalities remain mandatory (footer line enforced
  in every draft).
- T8: explainability = concise reasons + evidence (no hidden chain of
  thought); final priority/routing human-reviewable; conflicts surfaced.
- Cross-cutting: every consequential AI/system output has an override path and
  audit record (G5); every AI value is rendered with the AI_INFERRED badge.

## 5. Escalation thresholds (explicit constants)

| Threshold | Value | Source |
|---|---|---|
| T2 returns before escalation | 2 | Case PDF "after two rejected/returned transfers" |
| T1 inactivity pattern (this case + other cases) | ≥2 missed hearings AND ≥2 other inactive cases | Case PDF "missed two hearings and shows similar inactivity on two other cases" |
| T4 display threshold | score ≥ 45 | Conservative default so humans see borderline pairs; decisions remain human |
| Referral ack window | 5 days (referral) / 3 days (jurisdiction transfer) | Illustrative operational default, configurable per call |
| T1 pattern alert | Review trigger only | Case PDF guardrail: "does not itself establish misconduct" |

## 6. E-signature position (T11 guardrail, reproduced verbatim in UI)

Cryptographic verification proves the document is unchanged after signing. It
does **not** by itself establish legal validity, identity, capacity, informed
consent, or enforceability. The system therefore keeps the mediation record,
the mediator's finalized draft (human-reviewed), and each party's signature
binding — and states the limitation wherever signatures are shown.
