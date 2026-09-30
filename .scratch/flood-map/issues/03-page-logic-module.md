# 03 · DOM-free page logic module

Status: ready-for-agent
Parent: [`../spec.md`](../spec.md) (Page logic module)
Blocked by: 02

## What to build
Split the page into a DOM-free logic module, attached to one global like the demo data, and the DOM/map code that calls it. The module owns:
- merging real รายงาน with ข้อมูลจำลอง;
- sort order;
- per-depth and per-เขต counts;
- stable หมุด placement from กึ่งกลางเขต;
- Thai messages for API error codes;
- the Thai age label.

The DOM code renders all user text with `textContent`.

## Acceptance criteria (seam 3: the module loaded in a VM)
- [ ] Merging with demo data on and off.
- [ ] Sort order, including ties.
- [ ] Summary counts respect the เขต filter; per-เขต counts are correct.
- [ ] The same เขต + จุดสังเกต always gets the same placement; different ones get different placements, always within the เขต's neighbourhood.
- [ ] Demo items use their own coordinate.
- [ ] Every API error code has a Thai message, and `rate_limited` shows minutes.
