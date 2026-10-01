# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

น้ำท่วมไหม ("Is it flooding?"): the teaching repo for the CodePassion Academy course _AI Coding with Claude_. A small JSON API that lists Bangkok districts and the latest water level at each district's gauge stations. All readings in `data/stations.json` are made up. User-facing text is Thai; code, identifiers and error strings are English.

## Commands

Node.js 22+. TypeScript runs directly through `tsx`; there is no build step.

```bash
npm test                                          # vitest, single run
npx vitest run tests/app.test.ts                  # one file
npx vitest run tests/app.test.ts -t "ignores readings after now"   # one test by name
npm run lint                                      # tsc --noEmit (the only lint; no ESLint or formatter)
npm run dev                                       # tsx watch, http://localhost:3000 (PORT overrides)
```

## Guardrails

- **The live flood map is read-only.** `flood-api.rooptanjai.com` (ROOP TAN JAI Flood Watch) is a real service people rely on during floods. Only `GET` it. Send test reports to the local server or call `handle` directly.
- **`NOTICE` stays.** Every public 2xx JSON response carries the `NOTICE` string from `src/app.ts`, unchanged, because the data is fictional and must never read as an official warning.

## Architecture

`src/app.ts` exports `handle(method, path, body, ctx)`, a synchronous pure router that returns `{ status, body }` and knows nothing about `node:http`. `src/server.ts` is the thin adapter: it reads and JSON-parses the request body, calls `handle`, and serialises the result. New behaviour goes into `handle` (or modules it calls); `server.ts` only grows for transport concerns.

Time is injected: `handle` takes `ctx.now` and passes it down (`latestReading(station, now)` ignores readings after `now`). Tests call `handle` directly with a fixed `now` of `2026-09-30T12:30:00Z`, which lines up with the timestamps in `data/stations.json`. Anything time-dependent takes `now` as a parameter rather than calling `new Date()` itself.

`districts` is a `Map` keyed by slug id (`lat-phrao`). Only 12 of Bangkok's 50 districts exist, and some (e.g. `sai-mai`) have no stations. Callers refer to districts by id, never by name.

## Conventions

- Depths and water levels are **integer centimetres** (`levelCm`, `depthCm`).
- Times are **stored in UTC** and **shown in Bangkok time** through `toBangkokIso` (`+07:00`, no DST).
- Relative imports carry the `.ts` extension; JSON is imported with `with { type: "json" }`.
- `noUncheckedIndexedAccess` is on: index and regex-group access yields `T | undefined`.
- Style, by hand: no semicolons, double quotes, no trailing commas.

## Flood reports feature (in progress)

The course adds citizen flood reporting in stages, each leaving a document: `docs/intent/flood-reports.md` (why, constraints, open questions) → `docs/specs/flood-reports.md` (requirements `RPT-REQ-001`…`020` with acceptance criteria, data model, API) → `docs/plans/flood-reports.md` → code. The plan is a checklist of steps, each a test-first commit; steps 1-10 are done (API, validation, quota, merging, admin hide/unhide, logging). The plan's "Later" section lists what remains (hash purge, file-store robustness, `/report` web page, body limit, README). Read the spec and the plan before touching this feature and cite requirement ids in tests and commits. All three documents are written in Thai. The spec's AC values are authoritative (severity cut-offs 15/30 cm, merge window 30 min, report TTL 6 h counted from `observedAt`); do not write tests with other numbers without the user changing the spec first.

Code layout: `src/reports.ts` (pure functions and all tunable constants), `src/report-store.ts`, `src/reporter.ts` (IP hashing), `src/admin.ts` (bearer token), `src/report-log.ts` (log allowlist; never widen it to make a test pass). `createApp(deps)` in `src/app.ts` builds a router around an injected store; tests use it with a memory store, while the exported `handle` keeps the original context-only signature.

Spec decisions that shape the code:

- Existing routes and the existing tests (`tests/app.test.ts`, `tests/time.test.ts`) stay as they are; reports are additive (a new `reports` key, new routes).
- Citizen reports stay separate from station readings and always carry the "unverified, not an official warning" label.
- Reports are reached only through a synchronous `ReportStore` interface (memory and JSON-file implementations), so `handle` stays synchronous and `src/app.ts` stays free of `node:fs`.
- Reports are hidden or expired, never deleted.
- Personal data stays out of storage, responses and logs: reporter identity is an HMAC of the IP, phone numbers in free text are masked before saving.
- Secrets (`ADMIN_TOKEN`, `IP_HASH_SECRET`) come from the environment.

The `security-baseline` skill holds the security rules the spec builds on; use it for anything handling public input or personal data.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (siriwatj/ai-coding-with-claude-sj), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at the repo root (neither exists yet). See `docs/agents/domain.md`.
