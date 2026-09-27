# CoU JusticeLab — আইনসহায় (DLAS)

**Five Doors, One Record.** An integrated Digital Legal Aid System prototype for Bangladesh (ADLASB Hackathon Final Round).

Live: https://ain-shohay.vercel.app/

## Quick start

```bash
# Node.js ≥ 22. No npm install needed (zero dependencies).
npm start      # http://localhost:3000
npm test       # 30 smoke checks + 16 portal API checks
```

Demo: provider PIN `1234` (e.g. `officer.joypurhat`, `lawyer.kabir`) · citizen tracking `APP-2026-0001` / `3344`.

## Layout

| Path | What |
|---|---|
| `server.js` | Entry: HTTP server, static files, API router |
| `public/` | Browser app (portal + provider console) |
| `server/routes/`, `server/services/` | API handlers and shared domain logic |
| `server/db.js`, `server/app-db.js` | SQLite data spine and JSON portal store |
| `tests/`, `scripts/` | Test suites and dev utilities |
| `docs/reference/` | Official case PDF and design prototype |
| `legacy/` | Earlier and alternative implementations (not deployed) |

**Full documentation:** [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) covers architecture, API, data model, the 23-requirement coverage map, deployment and the cleanup log.
