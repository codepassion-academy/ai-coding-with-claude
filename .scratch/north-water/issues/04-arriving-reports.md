# 04 · "น้ำกำลังมา" reports

Status: ready-for-agent
Parent: [`../spec.md`](../spec.md) (Reports)
Blocked by: 01

## What to build
- รายงาน gets `kind: "flooded" | "arriving"`, defaulting to `flooded`.
- A basin จังหวัด → อำเภอ picker. The หมุด sits at the district centre, with a distinct style for "arriving".
- The merge key becomes (`districtId`, `landmarkKey`, `kind`). The merge window, expiry and rate limit are unchanged.

## Acceptance criteria
- [ ] An "arriving" report never merges into a "flooded" one at the same spot.
- [ ] A missing `kind` means `flooded`, and existing clients keep working.
- [ ] Still no coordinates in any request (RPT-REQ-013).
