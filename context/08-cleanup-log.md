# Cleanup log & known quirks

## 10. Cleanup log (September 2026)

Goal: organize and lighten the project **without changing** what the site does or how it looks.

### What changed

| Change | Why | Risk check |
|---|---|---|
| `Front/` → `legacy/front-v1-static/` | Older, smaller copy of the live app (app.js 82 KB vs 187 KB live; styles 36 KB vs 105 KB). Nothing imports it. | Not referenced by the runtime |
| `Backend/` → `legacy/nextjs-backend/` | Separate Next.js/Prisma implementation. Not the deployed app, but its docs and schema are valuable. | Not referenced by the runtime |
| Deleted `screenshots-gallery.html` (2.1 MB) | Standalone, unlinked screenshot dump. | No references anywhere |
| `inspect_schema.js` → `scripts/inspect-schema.js` | Debug utility doesn't belong at the root; require path fixed. | Verified it runs |
| `server/seed-embed.js` → `scripts/seed-embed.js` | One-off content generator (already applied: seed.js contains its 12 enriched news items). Never required at runtime; paths fixed. | Not required by any module |
| Removed 8 unused imports | `url` and a duplicate inner `SESSION_COOKIE` require in server.js; `SYSTEM_ACTOR` (applications, auth), `getSessionContext` (auth), `SETTLEMENT_TEMPLATES` (ai), `hashPin` (session), `CASE_TYPES` (triage) | Only unused destructured names removed; modules still load; all tests pass |
| Re-encoded `public/img/*.jpg` | 4.8 MB → 1.06 MB (−78%). Same filenames and pixel dimensions; progressive JPEG, quality 82. | PSNR 37–39 dB vs originals (visually indistinguishable) |
| `package.json` scripts | Added `test` (both suites), `test:smoke`, `test:api`, `db:inspect` | `start`/`dev` unchanged |
| Added `.editorconfig`, `.vercelignore`; extended `.gitignore` (`*.tmp`, `data/dev.db*`, `.vercel/`) | Repo hygiene | No runtime effect |
| Removed stray `.keep` in legacy backend | Empty placeholder in a non-empty folder | — |
| Added the `context/` folder (index, 8 topic files, this combined file, `reference/` with the case PDF and prototype), plus `README.md`, `CHANGELOG.md`, `legacy/README.md` | One-stop onboarding and review | No runtime effect |
| Added `.nvmrc` (22) | Pins the Node version that provides `node:sqlite` | No runtime effect |

### What was deliberately NOT changed

- `public/index.html`, `css/styles.css`, `js/app.js`, `js/console.js`, `js/i18n.js`, `manifest.json`, `icon.svg`: **byte-identical** to the originals and to the live site. Cache-busting query strings (`?v=19` etc.) are untouched.
- The server architecture, route handlers, business logic, schema, seed content and `data/app-db.json`.
- Every URL and API path.
- `topic_*.jpg` and `tracking_citizen.jpg` are not referenced in the current code (only `hero_gavel.jpg` is, from styles.css). They are still publicly served on the live site, so they were kept (compressed) rather than deleted.

### Verification performed

1. **Before:** smoke suite 30/0, API suite 16/0; the live site's HTML/CSS/JS matched the repo `public/` by MD5.
2. **After:** smoke suite 30/0, API suite 16/0.
3. The original and organized servers were run side by side and 30 URLs were compared (static files, SPA fallback, 404/405/400 paths, and data APIs). All matched once per-boot timestamps and random IDs were normalized. The only remaining difference was the audit log, which records the test requests themselves.
4. Image fidelity was measured with PSNR (37–39 dB).

---

## 11. Known quirks worth knowing (not changed, to preserve behavior)

- There are two data stores (SQLite plus a JSON file) because the portal compatibility layer and the DLAS spine grew separately. Merging them would be a functional change.
- `node:sqlite` prints an `ExperimentalWarning` on Node 22/24. This is harmless.
- Some routes are dispatched in two ways: `applications` goes to the domain handler when `applicantName` and `channel` are present, and to the compatibility router otherwise.

---
← [Context index](./README.md) · Full single file: [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)
