# DLAS — Known Limitations & Threat Model (stated, not hidden)

The case PDF itself requires this honesty: "State the threat model and
assumptions. Do not claim absolute tamper-proofing"; "Cryptographic validity
does not by itself establish legal validity…"; "labelled simulations are
acceptable only for external integrations that cannot reasonably be connected
live".

## 1. Simulations (explicitly labelled in the UI)

| Simulated element | Reality in a production deployment |
|---|---|
| 16699/IVR voice door | Would connect to the operator's IVR/telephony platform; the prototype uses speech synthesis + keypad simulation in the browser. The workflow, state transitions and audit entries behind it are real. |
| SMS/USSD gateway | Messages are rendered in-app; production would bind to an SMS/USSD aggregator. Delivery receipts are not modelled. |
| "Marma language" content | Illustrative placeholder; production requires professional interpretation and script support (the provenance split between "what was said" and "what was typed" is the designed mechanism). |
| Voice input | Speech synthesis (read-back) is functional; speech *recognition* depends on browser support (`bn-BD`); the keypad/keyboard route is always available so no step is speech-mandatory. |

## 2. Security boundaries

- **Authentication:** demo PIN (SHA-256) for staff; citizen door = Application
  ID + last-4 of registered contact. Production would integrate the
  government's credential/OTP infrastructure; the RBAC and scope-limiting
  layers would not change.
- **E-signature (T11):** SHA-256 hash binding (document hash + signer +
  timestamp + per-signature nonce), independently recomputable. It proves
  document integrity after signing. It does NOT prove signer identity in a
  legally binding sense, capacity, or informed consent — the UI states this
  verbatim. No PKI/CT Act certificate integration is claimed.
- **Offline sync (T9):** protects against transmission errors, duplicates, and
  silent overwrites (conflicts go to human review). It does NOT defend against
  a malicious device fabricating payloads; client hashes are verified for
  accidental corruption, not attacker resistance.
- **PWA caching (T10):** shell-only caching; API responses never cached;
  nothing sensitive persists on shared UDC devices beyond the explicitly
  visible offline queue.

## 3. Data & environment

- SQLite (sandbox constraint) — the Prisma model is portable to PostgreSQL for
  scale; no SQLite-specific data modeling is used beyond String enums
  (validated at the API boundary).
- Local file storage of document content is represented by text/base64
  fields; production would use object storage with server-side encryption and
  signed URLs.
- Logs: application audit trail is durable in the DB; deployment-level log
  aggregation/monitoring is out of scope for the prototype.

## 4. Legal scope

- The system implements **procedural** support (intake, tracking, referral,
  mediation, lawyer management) around legal-aid workflows described in the
  case PDF. It encodes no substantive eligibility law: eligibility remains a
  documented human decision at the DLAO.
- Jurisdiction labels (District DLAO, Labour Legal Aid Cell, cyber route) come
  from the case PDF (T2/Rahim Mia, A3/Nabila) and are routing hints for
  humans — never automatic transfers.

## 5. Out of scope (not in the PDF, deliberately not built)

- Payments/collections engine (only stage-based payment *status* tracking as
  the PDF's T1 requires).
- Case-cause-list integration with courts, biometric NID verification, real
  telephony, multi-tenant deployment, analytics beyond B7's reporting view.
