# 03 · สถานการณ์จำลอง: slider, flow line, flood areas, on-canvas banner

Status: ready-for-agent
Parent: [`../spec.md`](../spec.md) (Safety rules 1–3; Scenario)
Blocked by: 01, 02

## What to build
- One hand-authored scenario in `data/scenarios/`: dam release steps, one flow polyline along the river, flood-area polygons per step with a depth level, and a flow speed in km/h. There are no dates; everything is T+hours.
- The viewer opts in to the scenario. A T+hours slider changes the releases, the flow line and the flood areas (light → dark blue by depth).
- While the scenario is on, "ข้อมูลจำลอง · ไม่ใช่การพยากรณ์" is drawn onto the map canvas.

## Acceptance criteria
- [ ] Pure function: scenario step selection by T.
- [ ] Nothing in the scenario data or UI renders a wall-clock date or time.
- [ ] The scenario never calls the API.
- [ ] The banner is on the canvas whenever the scenario is on (render test).
