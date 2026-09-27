# Run, test & deploy

## 8. Demo access (one login form at `#/login`)

Type an identifier and a PIN; the server works out the account type.

| Who | Identifier | PIN |
|---|---|---|
| DLAO officer | `officer.joypurhat` (also `officer.jhenaidah`, `officer.barguna`) | `1234` |
| Mediator | `mediator.joypurhat` | `1234` |
| 16699 helpline | `helpline.agent1` | `1234` |
| UDC entrepreneur | `udc.khagrachari` | `1234` |
| Panel lawyer | `lawyer.kabir`, `lawyer.shahana` | `1234` |
| Receiving DLAO | `receiving.dhaka` | `1234` |
| Case support / admin | `support.staff1`, `admin` | `1234` |
| Citizen (Moyuri) | `APP-2026-0001` | `3344` |

There is no master PIN. After 5 wrong PINs an identifier is locked for 10 minutes.

## 9. Run, test, deploy

```bash
node -v                # 22 or newer
npm start              # http://localhost:3000 (PORT overrides)
npm test               # smoke (30) + API (30) = 60 checks
npm run check:vercel   # simulates the Vercel runtime: apply -> officer -> track
npm run db:inspect     # print the SQLite schema
```

### Deploy on Vercel (free Hobby plan)

1. Push this folder to a GitHub repository.
2. On vercel.com, choose **Add New > Project** and import the repository.
3. Keep every default (`vercel.json` sets framework Other, no build step, `public/` as output, `api/index.js` as the function).
4. Click **Deploy**. No environment variables are needed.

- Static files come from the CDN; `/api/*` and `/data/uploads/*` go to one serverless function running the same handler as `server.js`.
- Node 22 comes from `engines` and `.nvmrc`; the built-in `node:sqlite` needs no native build.
- Storage is `/tmp/ainshohay` (the only writable path). Demo data is re-seeded on cold start, and user data lasts while the instance is warm. For persistent data, run `npm start` on a host with a disk (Railway, Render, a VPS) or set `DATA_DIR` to a mounted volume.
- `.vercelignore` keeps `legacy/`, `context/`, `tests/` and `scripts/` out of the bundle.

**Test side effect:** the test suites write to `data/`. Run `git checkout data/app-db.json && rm -f data/dev.db*` afterwards.
