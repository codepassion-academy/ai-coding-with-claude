# REVIEW.md

Review the diff in passes, in this order. One pass at a time.
For every finding give: file:line · problem · why it matters · suggested fix.

## Pass 1 — Logic
- Does the code do what the tests claim? Any branch with no test?
- Off-by-one, null/empty, time zones, rounding, concurrency.
- Units: integers in the stated unit (cm for depth). No floats.

## Pass 2 — Security & PII
- Every input validated at the boundary.
- No PII or secrets in logs, errors, or analytics.
- Rate limits on anything that checks a secret or a code.
- Errors don't reveal whether a record exists.

## Pass 3 — Compliance with the spec
- Every requirement in docs/specs/<feature>.md is implemented and tested.
- Nothing implemented that is out of scope.
- The diff matches docs/plans/<feature>.md. Unplanned changes are explained.

## Human pass — Intent & Risk (not delegated)
- Does this match the intent?
- If it breaks, how bad is it, and can we roll back?
- Can I explain this code to a teammate?
