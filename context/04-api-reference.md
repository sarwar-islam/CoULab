# API reference

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

---
← [Context index](./README.md) · Full single file: [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)
