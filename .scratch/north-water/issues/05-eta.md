# 05 · ETA calculator (scenario only)

Status: done
Parent: [`../spec.md`](../spec.md) (Safety rule 6; ETA)
Blocked by: 03

## What to build
- A pure function `eta(place, scenario)`. It snaps the place to the nearest point on the flow line, then returns `{ distanceKm, speedKmh, arrivalT, depthLevel }`. Distance is measured along the polyline, and the depth comes from the flood-area polygon at `arrivalT`.
- The point comes from presets (ดอนเมือง, อยุธยา, นครสวรรค์ …) or a map tap. The UI shows "ระยะทาง X กม. ÷ Y กม./ชม. ≈ T+Z ชม., ระดับ …" and is disabled while the scenario is off.

## Acceptance criteria
- [ ] Tests for snapping, distance along the line, arrival T and depth lookup, using worked examples.
- [ ] Privacy test: no request from the page carries `lat`, `lng` or coordinates.
- [ ] The formula and inputs are always shown with the result.
