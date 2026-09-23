# AGENTS.md

## Commands
- Package manager: **pnpm** (`pnpm-lock.yaml`; README still says `npm install` — trust the lockfile).
- `pnpm dev` — Vite dev server. A custom `localApi()` plugin in `vite.config.js` serves `/api/artist|playlist|sync` from `api/*.js` locally with the same code as Vercel Functions; do not use `vercel dev`.
- **New API routes must also be registered in `vite.config.js`** (`server.middlewares.use('/api/<name>', wrap('<name>'))`), or they 404 in dev while working on Vercel.
- `pnpm lint` — oxlint (`.oxlintrc.json`). `pnpm build` — production build. There are **no tests and no typecheck** (plain JS/JSX). Verify with `pnpm lint && pnpm build`.
- `autoprefixer` is pinned to exact `10.4.21` on purpose (10.6.0 blocked by pnpm `minimumReleaseAge`); don't bump it casually.

## Architecture
- Vite + React 19 SPA: `index.html` → `src/main.jsx` → `src/App.jsx`. Queue player: `src/QueuePlayer.jsx` (YouTube IFrame API). Tailwind v3 (`@tailwind` directives in `src/index.css`).
- Backend = Vercel serverless functions in `api/` (plain `(req, res)` default exports; not Next.js). `_`-prefixed files (`api/_rss.js`, `api/_ytm.js`) are shared helpers, not endpoints.
- YouTube data comes from RSS (0 quota) plus InnerTube JSON with public web keys hardcoded in `api/_ytm.js`. `YOUTUBE_API_KEY` in `.env.example` is unused for now.
- Cron: `vercel.json` calls `GET /api/sync` every 2 days (`0 5 */2 * *`).

## Data files (dual location)
- `data/` is read by API handlers via `process.cwd()`; `public/data/` is what the frontend fetches (`/data/artists.json`). Keep both in sync — prefer regenerating via `scripts/normalize.mjs`, which writes both.
- Regenerate from the USB (must be mounted): `USB_PATH=/Volumes/RED-SSD/MUSICA node scripts/normalize.mjs`. It preserves already-resolved `channelId`s from the previous `data/artists.json`.
- `data/overrides.json` — manual `channelId` pins for homonyms (key = `normalized` from artists.json), checked in `api/artist.js`.
- `data/usb-titles.json` — per-artist MP3 titles used to score Topic-channel matches (anti-homonym) in `api/artist.js`.

## Conventions
- Artist identity = `normalized` field (lowercase, accents stripped, spaces collapsed). Merge only casing/accents/spaces; `feat`/`&` stay separate; `Acorde ≠ Acordes`.
- Lint is oxlint only (no ESLint/Prettier); React hooks violations are errors.
- UI copy is Spanish — keep new strings in Spanish.
