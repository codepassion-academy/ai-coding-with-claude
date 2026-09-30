# 01 · Tabs, Thailand map, จังหวัด/อำเภอ, P-code district IDs

Status: ready-for-agent
Parent: [`../spec.md`](../spec.md) (Map; Districts and IDs; Glossary)
Blocked by: flood-map 01, flood-map 02, flood-map 03

## What to build
- Tabs น้ำท่วมไหม / น้ำเหนืออยู่ไหน, with the tab kept in the URL (`#/north`).
- A self-hosted Thailand PMTiles extract capped at about z10, next to the Bangkok extract. Record it as an amendment to ADR 0001, and show province and district boundaries and Thai labels.
- A generated district data file from HDX COD-AB (CC BY-IGO), covering the Chao Phraya basin provinces: `pcode`, `nameTh`, `nameEn`, `provincePcode`, `centroid`. Patch the name for TH1008 (ป้อมปราบศัตรูพ่าย) and show the attribution in the footer.
- `districtId` becomes the P-code everywhere. The old Bangkok slugs are accepted as aliases for one release. Update `docs/specs/flood-reports.md`.
- Add the `CONTEXT.md` terms: สถานการณ์จำลอง, เส้นทางน้ำ, เขื่อน, จังหวัด, อำเภอ, รายงานน้ำกำลังมา. Update the เขต entry.
- Links to RID, สทนช. and ปภ. are always visible on the north tab.

## Acceptance criteria
- [ ] `GET /districts` returns P-codes. A request using an old slug resolves to the same district.
- [ ] The new extract and data files add no outside URL (extends flood-map's self-host test).
- [ ] Tab state round-trips through the URL.
- [ ] The existing flood-reports tests pass, with IDs updated through the alias.
