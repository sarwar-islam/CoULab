# Architecture

For the full system design (context diagram, lifecycle, auth sequence, criteria mapping) see [09-system-design.md](./09-system-design.md).

## 3. Folder structure

```
.
├── server.js                 # Local entry: http.createServer(handleRequest)
├── api/index.js              # Vercel serverless entry: the same handleRequest
├── vercel.json               # Free-plan deploy config (static output, rewrites)
├── package.json              # Scripts only; zero dependencies; engines node 22.x
│
├── public/                   # Browser app (static files / Vercel CDN)
│   ├── index.html, manifest.json, icon.svg
│   ├── sw.js                 # T10 service worker: cached app shell, live API
│   ├── css/styles.css
│   ├── js/app.js             # Citizen portal, single login, offline outbox, read-aloud
│   ├── js/console.js         # Provider console (7 roles)
│   ├── js/i18n.js            # Bangla / English strings
│   └── img/
│
├── server/
│   ├── config.js             # PORT, paths, DATA_DIR (./data locally, /tmp on Vercel)
│   ├── app.js                # Request handler: CORS, body, session, errors
│   ├── router.js             # /api/<root> dispatch table + provider access guard
│   ├── http/                 # respond.js, body.js, static.js
│   ├── routes/               # One thin handler per API area
│   ├── services/             # Domain logic shared by all routes
│   │   ├── audit.js          #   hash-chained audit + verifyChain()
│   │   ├── login-throttle.js #   PIN brute-force lockout
│   │   ├── lifecycle.js, triage.js, ai.js, safe-contact.js,
│   │   └── duplicate.js, checklist.js, lawyer-inactivity.js, session.js, crypto.js
│   ├── db/sqlite.js          # Case spine: schema, migrations, demo seed
│   ├── db/json-store.js      # Portal store: accounts, portal applications
│   ├── domain/constants.js   # Case types, channels, jurisdictions, stages
│   └── content/portal-content.js  # 199 articles, forms, news, 67 offices
│
├── data/app-db.json          # Seed for the portal store (committed on purpose)
├── tests/                    # smoke-test.js (30 checks), test-ain-shohay-api.js (30 checks)
├── scripts/                  # inspect-schema.js, vercel-local-check.js
├── context/                  # All documentation (this folder)
└── legacy/                   # Not deployed, not imported
```

## 4. Request flow

```
Browser ──► server.js (local)  or  api/index.js (Vercel)
             │
             ▼
          server/app.js
             ├─ /api/*  → cookies → session context → JSON body
             │            → router.js: access guard → routes/<area>.js
             │            → services/* → db/sqlite.js (case spine) + db/json-store.js (portal)
             │            → services/audit.js appends a hash-chained AuditEntry
             └─ otherwise → http/static.js: public/ file, /data/uploads/*, or SPA index.html
```

Access rules enforced in `router.js`:

| Who | Can read case-spine routes (`cases`, `referrals`, `audit`, `documents`, ...) | Notes |
|---|---|---|
| Anonymous | No (401) | May still apply through any door and track with ID + last 4 digits |
| Citizen / representative | No (403) | `GET /api/applications` returns only their own records |
| Provider (officer, lawyer, mediator, helpline, UDC, receiving, support, admin) | Yes | Views are role-scoped; sensitive records are further restricted |
| Anyone | `GET /api/audit/verify` | Returns only counts and hashes, as public proof of integrity |
