# CLAUDE.md

Sample shop checkout (TypeScript, Node 22+). No framework; `src/app.ts` routes, `src/server.ts` is a thin `node:http` wrapper.

## Commands

- Install: `npm install`
- Test all: `npm test` · one file: `npx vitest run tests/checkout.test.ts` · by name: `npx vitest run -t "coupon"`
- Types: `npm run lint` (tsc, no emit)
- Run: `npm run dev` (port 3000)

## Rules you must not break

- Money is an integer in satang (1 baht = 100 satang). Never floats. Round discounts down.
- Imports use the `.ts` extension (`./cart.ts`), as in existing files.
- Business logic stays out of `src/server.ts`. Put it in plain functions and test those.
- Errors returned to clients must not reveal whether a coupon exists (see the `security-baseline` skill).

## Mistakes you make in this repo

<!-- Add one line every time the AI repeats a mistake. -->
- Reading `Date.now()` inside logic. Pass `now` in as a parameter so tests can control time.

## How we work

- Read `docs/specs/<feature>.md` before starting a feature.
- Commit `docs/plans/<feature>.md` before implementing, then tick steps as you finish them.
- Write the failing test first. Never edit tests to make them pass; stop and ask instead.
- Stop and ask when the spec is unclear. Don't guess.
