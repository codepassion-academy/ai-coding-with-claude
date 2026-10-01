# 02 · กึ่งกลางเขต in the API

Status: ready-for-agent
Parent: [`../spec.md`](../spec.md) (District centre in the API)
Blocked by: none

## What to build
Each เขต gains a กึ่งกลางเขต `[lon, lat]`. `GET /districts` returns it on every district, and `GET /districts/:id` returns it on its district object. Existing fields and their order are unchanged. The page places หมุด from this field instead of its own hard-coded table.

## Acceptance criteria
- [ ] Every district in `GET /districts` has a กึ่งกลางเขต inside Bangkok's bounds.
- [ ] `GET /districts/:id` includes it.
- [ ] The existing app tests pass unmodified.
- [ ] No coordinate is accepted from or stored for รายงาน (RPT-REQ-013).

## Tests (seam 1: `handle()`)
