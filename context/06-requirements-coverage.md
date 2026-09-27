# Requirements coverage (23 items)

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

---
← [Context index](./README.md) · Full single file: [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)
