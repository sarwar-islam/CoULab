# Overview & tech stack

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

---
← [Context index](./README.md) · Full single file: [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)
