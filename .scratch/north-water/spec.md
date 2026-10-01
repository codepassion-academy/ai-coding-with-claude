# Spec: น้ำเหนืออยู่ไหน (north-water)

Status: ready-for-agent (approved by the owner 2026-10-01, [academy#60](https://github.com/codepassion-team/academy/issues/60)). Settled in a grilling session on 2026-10-01 (15 decisions, Q1–Q15).

- Repo: [codepassion-academy/ai-coding-with-claude](https://github.com/codepassion-academy/ai-coding-with-claude), building on `feat/flood-reports`. `class-demo` and the `cp1`–`cp8` tags are unchanged.
- Builds on: `docs/specs/flood-reports.md`, `.scratch/flood-map/spec.md`, ADR 0001 (MapLibre + self-hosted PMTiles), `CONTEXT.md`.
- **Course impact: none.** This is a sample-repo extension, not part of the current workshop (Q15).

## Problem

People downstream of the Chao Phraya want to know where water from the north is and whether it will reach them. The app only shows Bangkok reports by เขต (district). It has no country view, no dams, and no way to report "water is arriving".

A real forecast would be dangerous. People might act on an arrival time we can't validate, and RID and ONWR already issue official warnings. So this feature **teaches how to build a map feature**; it does not forecast floods.

## Solution

A second tab, **น้ำเหนืออยู่ไหน**, next to **น้ำท่วมไหม**. It shows:
- a Thailand overview map with จังหวัด (province) and อำเภอ (district) boundaries;
- major dams as reference points;
- real **รายงาน** (reports) of water arriving;
- an opt-in **สถานการณ์จำลอง** (demo scenario) with dam releases, the water's path, and an ETA calculator.

Every flow, release and ETA figure is **ข้อมูลจำลอง** (demo data).

## Safety rules (non-negotiable)

1. **Scenario-only numbers.** Release volumes, flow paths, flood areas and ETAs exist only inside the สถานการณ์จำลอง, which is off by default and opened by the viewer (Q1, Q11).
2. **The scenario clock only.** Every scenario time is relative ("T+18 ชม. หลังเขื่อนปล่อยน้ำ", i.e. 18 hours after the dam release) and chosen with a slider. The UI never shows a wall-clock date or time for a scenario event (Q6).
3. **A banner in the image.** While the scenario is on, a large "ข้อมูลจำลอง · ไม่ใช่การพยากรณ์" (demo data, not a forecast) banner is drawn onto the map canvas, so screenshots carry it (Q7).
4. **Real dams, no real status.** Dams are real reference points (ภูมิพล, สิริกิติ์, เจ้าพระยา, ป่าสักชลสิทธิ์). Outside the scenario a dam shows only its name and a link to RID (กรมชลประทาน), never a release figure (Q7).
5. **Always link to official sources.** The tab always shows links to official warnings: RID, สทนช. (ONWR) and ปภ. (DDPM) (Q11).
6. **No coordinates leave the browser.** The ETA point, whether a preset or a map tap, is computed client-side and never sent to the API. RPT-REQ-013 still holds (Q9).

## User stories

ผู้ชม (viewer)
1. As a ผู้ชม, I want tabs น้ำท่วมไหม / น้ำเหนืออยู่ไหน, with the tab kept in the URL (`#/north`), so that I can switch and share a view.
2. As a ผู้ชม, I want a Thailand overview map with จังหวัด and อำเภอ boundaries and Thai labels, so that I can see where places are.
3. As a ผู้ชม, I want major dams shown as reference points that link to RID, so that I know where official release information lives.
4. As a ผู้ชม, I want "น้ำกำลังมา" (water arriving) reports shown with a distinct pin style, so that I can tell them from "flooded here" reports.
5. As a ผู้ชม, I want links to RID, สทนช. and ปภ. always visible on the tab, so that I go to official sources for real decisions.
6. As a ผู้ชม, I want to open the สถานการณ์จำลอง myself, and see it labelled on the map, so that I never mistake it for a forecast.
7. As a ผู้ชม in the scenario, I want to scrub a T+hours slider and watch releases, the flow line and flood areas change (light → dark blue by depth), so that I see how water moves.
8. As a ผู้ชม in the scenario, I want to pick a preset place (ดอนเมือง, อยุธยา, นครสวรรค์ …) or tap the map and get "ระยะทาง X กม. ÷ Y กม./ชม. ≈ T+Z ชม., ระดับ <depth>" (distance ÷ speed ≈ arrival time, with the depth), so that I see how the estimate is made.
9. As a ผู้ชม, I want the ETA tool disabled until the scenario is on, so that no estimate appears without the scenario framing.

ผู้รายงาน (reporter)
10. As a ผู้รายงาน, I want to choose จังหวัด then อำเภอ (basin provinces only) and report "น้ำกำลังมา" with จุดสังเกต (landmark), depth and seen-at time, so that people downstream get warned.
11. As a ผู้รายงาน, I want my report to merge only with reports of the same kind at the same place, so that "arriving" and "flooded" stay separate.

ผู้สอนและผู้เรียน (instructor and learner)
12. As a ผู้เรียน, I want the scenario and ETA logic as pure functions with tests I can read, so that I learn to test map logic without a browser.

นักพัฒนา (developer)
13. As a นักพัฒนา, I want district data to come from one generated file with P-codes and centroids, so that adding a province is a data change.
14. As a นักพัฒนา, I want a test that fails if any coordinate is sent to the API, so that the privacy rule can't regress.

## Implementation decisions

**Map (Q3)**
- Add a self-hosted Thailand PMTiles extract capped at about z10, next to the existing Bangkok extract.
- Record this as an amendment to ADR 0001: no CDN, no third-party requests, and the existing "© OpenStreetMap contributors" attribution.
- Province and district boundaries and labels are drawn from the same extract.

**Districts and IDs (Q10, Q12)**
- District list and centroids come from HDX **COD-AB Thailand** (Royal Thai Survey Department / OCHA ROAP, CC BY-IGO): 77 provinces, 928 districts, with Thai names in `ADM2_TH`.
- Attribution goes in the footer.
- Patch the known wrong name for TH1008 (ป้อมปราบศัตรูพ่าย).
- Ship only the Chao Phraya basin provinces (Nakhon Sawan → Bangkok) as static JSON: `pcode`, `nameTh`, `nameEn`, `provincePcode`, `centroid`.
- `districtId` becomes the COD-AB **P-code** (for example `TH1038`) everywhere. The old Bangkok slugs (`lat-phrao` …) are accepted as aliases for one release, then removed.
- Update `docs/specs/flood-reports.md` for this API change.

**Reports (Q4, Q13)**
- รายงาน gets `kind: "flooded" | "arriving"`, defaulting to `flooded` for backward compatibility.
- Location is province + district, with the pin at the district centre, and still no coordinates.
- The merge key becomes (`districtId`, `landmarkKey`, `kind`). The 2-hour merge window, 6-hour expiry and rate limit are unchanged.

**Scenario (Q6, Q8)**
- One hand-authored scenario lives in `data/scenarios/`, as GeoJSON plus JSON:
  - dam release steps;
  - one flow polyline along the river;
  - flood-area polygons for each step, with a depth level;
  - a flow speed in km/h.
- The scenario has no dates. Everything is T+hours.
- It follows the existing **ข้อมูลจำลอง** rules in `CONTEXT.md`: opt-in, labelled on every item, never sent to the API, and never counted against rate limits.

**ETA (Q9)**
- `eta(place, scenario)` is a pure function. It snaps the place to the nearest point on the flow line, then returns `{ distanceKm, speedKmh, arrivalT, depthLevel }`.
- Distance is measured along the polyline from the source to the snapped point.
- The depth comes from the flood-area polygon at the snapped point at `arrivalT`.
- The UI shows the formula and inputs, never only the result.

**Glossary (`CONTEXT.md`)**
- New terms: สถานการณ์จำลอง, เส้นทางน้ำ, เขื่อน, จังหวัด, อำเภอ, รายงานน้ำกำลังมา.
- Update **เขต** to explain it's the Bangkok word for an อำเภอ-level district.

## Testing

- Pure-function tests for `eta` (snapping, distance along the line, arrival, depth lookup), scenario step selection by T, and district alias resolution.
- A report test: `kind` is part of the merge key and defaults to `flooded`.
- A privacy test: no request body or query from the page carries `lat`, `lng` or coordinates.
- A self-host test (extends US 44): the new extract and data files add no outside URLs.
- A render test: the "ข้อมูลจำลอง" banner is on the canvas whenever the scenario is on.

## Delivery: tracer-bullet slices (Q5), one ticket each

1. Tabs + Thailand map + province/district boundaries + the district data file + the P-code migration.
2. Dams layer (reference-only outside the scenario; RID links).
3. Scenario: slider, flow line, flood areas, on-canvas banner.
4. "น้ำกำลังมา" reports (`kind`, basin district picker, pin style).
5. The ETA calculator (presets + map tap, formula shown, privacy test).

## Out of scope

- Any real forecast, hydraulic model, or live dam or ThaiWater data.
- Storing coordinates (still needs a PDPA decision first).
- Provinces outside the Chao Phraya basin for reports or the scenario.
- Changes to the workshop guide, slides or landing page.
- Deploying (see #54).
