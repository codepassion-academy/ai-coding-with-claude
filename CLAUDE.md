# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"น้ำท่วมไหม" — teaching example repo for the CodePassion Academy course *AI Coding with Claude*. Tiny Bangkok flood-level API. **Not an official warning service; all data in `data/stations.json` is made up.** Every API response carries `NOTICE` (from `src/app.ts`) saying so — keep it on all responses, including 404s.

The course adds a "citizen flood reports" feature on top. Its intent and spec live in `docs/intent/flood-reports.md` and `docs/specs/flood-reports.md` (requirement IDs `RPT-REQ-nnn`, constants named in spec §2); the code is in `src/reports.ts`, `src/rate-limit.ts` and `src/read-body.ts`. Read the spec before touching that feature. Design must follow the `security-baseline` skill.

Deployed as a teaching demo to Cloudflare Workers on every push to `main` (`.github/workflows/deploy.yml`, `wrangler.jsonc`, ADR 0003); one-time setup is `scripts/setup-cloudflare.sh`. Free plan: 10 ms CPU per request, so keep request paths linear.

A map web page (`GET /`, files in `public/`) sits on top of the API. Its spec is `.scratch/flood-map/spec.md`; decisions are in `docs/adr/` (0001 self-host every map asset, 0002 NFKC). Report pins are approximate by district: the API stores no coordinates. Demo data (`/?demo`) is opt-in, labelled, and never sent to the API. Domain words are in `CONTEXT.md`.

**Never send test reports to the live ROOP TAN JAI Flood Watch map (`flood-api.rooptanjai.com`).** Real people make decisions from it. GET only, never POST/DELETE.

## Commands

Node >= 22, npm (`package-lock.json`).

```bash
npm run dev                      # tsx watch, http://localhost:3000 (PORT env overrides)
npm test                         # vitest run
npx vitest run tests/time.test.ts        # single file
npx vitest run -t "latest station"       # single test by name
npm run lint                     # tsc --noEmit (only type check; no ESLint/Prettier)
npx wrangler@4.145.0 dev --var CLIENT_KEY_SECRET:dev-only   # real workerd locally (not a devDependency: RPT-REQ-017 AC1)
```

## Architecture

- `src/app.ts` — `handle(method, path, body, ctx)` is the whole router. Pure function returning `{ status, body }`; no `node:http`. Tests call it directly with an injected `ctx.now` — no server needed. New routes go here.
- `src/server.ts` — thin `node:http` adapter (`createAppServer`): serves the page's fixed file list, else reads the body (max 2048 bytes, 413), `JSON.parse` (400 on bad JSON), calls `handle`, 500 on any throw. Listens only when run directly.
- `src/reports.ts` — report store: validate, normalize (NFKC), mask phones/house numbers, dedupe, expiry, 503 when full, `toPublicReport`. Spec constants live here.
- `src/rate-limit.ts` — sliding-window limiter per client key (socket address only), `clientKeyFromAddress`.
- `src/read-body.ts` — reads a request body up to `MAX_BODY_BYTES`.
- `src/static-files.ts` — fixed list of page files (no folder lookup), CSP/headers, range parsing. No Node imports: shared by `static.ts` and `worker.ts`.
- `src/static.ts` — serves the listed files from disk for `server.ts`.
- `src/worker.ts` — Cloudflare Worker twin of `server.ts` (ADR 0003): listed files from Static Assets (`run_worker_first`), tiles from R2 with ranges, everything else forwarded to the `ReportsObject` Durable Object. Client key = HMAC of normalized `CF-Connecting-IP` (never `X-Forwarded-For`).
- `src/reports-object.ts` — the one Durable Object: runs `handle()` with its own store (always pass `ctx.reports`), saves `store.snapshot()` to SQLite after each accepted POST.
- `public/` — map page (`index.html`, `app.js`, `app.css`), `demo.js`, self-hosted fonts. `public/tiles/bangkok.pmtiles` is in git (ADR 0001 amendment) but excluded from Static Assets by `public/.assetsignore`; on Cloudflare it lives in R2.
- `src/stations.ts` — loads `data/stations.json` at import time, converts ISO strings to `Date`. `latestReading(station, now)` ignores readings after `now`.
- `src/districts.ts` — 12 of Bangkok's 50 districts, keyed by slug (`lat-phrao`). Some (e.g. `sai-mai`) have no stations.
- `src/time.ts` — `toBangkokIso`: fixed UTC+7 formatting.

## Conventions

- Time: store/compute in UTC `Date`, format to `+07:00` only at output via `toBangkokIso`.
- Depth/water level: integer centimetres.
- Inject time via `Context.now`; never call `new Date()` inside logic that tests need to pin.
- ESM TypeScript run directly by `tsx`; relative imports **must** include the `.ts` extension. `strict` + `noUncheckedIndexedAccess` on.
- Style: no semicolons, double quotes, 2-space indent, no trailing commas.
- Branches: `main` is the class starting point; `class-demo` and `example/coupon` are reference branches with checkpoint tags (`cp1-intent` … `cp8-hooks`) — don't rewrite them.

## Agent skills

### Issue tracker

Issues tracked as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at repo root. See `docs/agents/domain.md`.
