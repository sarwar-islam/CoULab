# legacy/

Nothing in this folder is imported by, or deployed with, the live application (`.vercelignore` excludes it). It is kept for history and reference.

| Folder | Was | Notes |
|---|---|---|
| `front-v1-static/` | `Front/` | Earlier, smaller version of the same zero-dependency Node app. Superseded by the root `public/` + `server/`. |
| `nextjs-backend/` | `Backend/` | Alternative Next.js + Prisma + shadcn/ui implementation of DLAS. Its `docs/` (ARCHITECTURE, LEGAL-RULES, LIMITATIONS, REQUIREMENTS-TRACEABILITY, TESTING) and `prisma/schema.prisma` are the design source that `server/db.js` mirrors. |

It is safe to delete this folder without affecting the live site.
