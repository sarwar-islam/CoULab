# Data model

## 6. Data model (SQLite, `server/db.js`)

Applicant, Application, Case, RecordEntry, Task, AuditEntry, Consent, ContactRule, ContactAttempt, SensitiveAccessLog, ChecklistTemplate, DocumentRecord, DuplicateCandidate, IncidentGroup, IntakeSession, TriageRun, Referral, LawyerAssignment, LawyerChangeRequest, LawyerUpdate, Hearing, MediationSession, SettlementDraft, SignatureSession, SignatureRecord, OfflineSyncRecord, Notification, Session, User, Counter.

The schema mirrors `legacy/nextjs-backend/prisma/schema.prisma` in the SQLite dialect. Print it live with `npm run db:inspect`.

---

---
← [Context index](./README.md) · Full single file: [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)
