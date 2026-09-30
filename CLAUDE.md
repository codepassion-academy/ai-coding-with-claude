# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"น้ำท่วมไหม" — teaching example repo for the CodePassion Academy course *AI Coding with Claude*. Tiny Bangkok flood-level API. **Not an official warning service; all data in `data/stations.json` is made up.** Every API response carries `NOTICE` (from `src/app.ts`) saying so — keep it on all responses, including 404s.

The course adds a "citizen flood reports" feature on top. Its intent and spec live in `docs/intent/flood-reports.md` and `docs/specs/flood-reports.md` (requirement IDs `RPT-REQ-nnn`, constants named in spec §2, planned home `src/reports.ts`). Read the spec before touching that feature. Design must follow the `security-baseline` skill.

**Never send test reports to the live ROOP TAN JAI Flood Watch map (`flood-api.rooptanjai.com`).** Real people make decisions from it. GET only, never POST/DELETE.

## Commands

Node >= 22, npm (`package-lock.json`).

```bash
npm run dev                      # tsx watch, http://localhost:3000 (PORT env overrides)
npm test                         # vitest run
npx vitest run tests/time.test.ts        # single file
npx vitest run -t "latest station"       # single test by name
npm run lint                     # tsc --noEmit (only type check; no ESLint/Prettier)
```

## Architecture

- `src/app.ts` — `handle(method, path, body, ctx)` is the whole router. Pure function returning `{ status, body }`; no `node:http`. Tests call it directly with an injected `ctx.now` — no server needed. New routes go here.
- `src/server.ts` — thin `node:http` adapter: reads body, `JSON.parse` (400 on bad JSON), calls `handle`.
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
