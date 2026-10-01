import thailand from "../data/districts-th.json" with { type: "json" }

export type District = {
  /** COD-AB P-code, e.g. `TH1038` (north-water 01). */
  id: string
  nameTh: string
  nameEn: string
  /** กึ่งกลางเขต: a rough [lon, lat] of the district for placing หมุด. Never a reporter's location (RPT-REQ-013). */
  centre: [number, number]
}

type Row = { pcode: string; nameTh: string; nameEn: string; provincePcode: string; centre: number[] }

/** Every อำเภอ/เขต in the Chao Phraya basin (data/districts-th.json, from HDX COD-AB via scripts/build-districts.mjs). */
export const basinDistricts: ReadonlyMap<string, District & { provinceId: string }> = new Map(
  (thailand.districts as Row[]).map((d) => [
    d.pcode,
    { id: d.pcode, nameTh: d.nameTh, nameEn: d.nameEn, centre: [d.centre[0] ?? 0, d.centre[1] ?? 0], provinceId: d.provincePcode }
  ])
)

/**
 * The Bangkok เขต the app serves today, by P-code. Each key is the slug it used before P-codes; old slugs keep
 * working as aliases for one release, then go (north-water spec, Q12).
 */
const BANGKOK_SLUGS: Readonly<Record<string, string>> = {
  "bang-kapi": "TH1006",
  "bang-khen": "TH1005",
  "bang-na": "TH1047",
  chatuchak: "TH1030",
  "din-daeng": "TH1026",
  "don-mueang": "TH1036",
  "huai-khwang": "TH1017",
  "khlong-toei": "TH1033",
  "lat-krabang": "TH1011",
  "lat-phrao": "TH1038",
  "pathum-wan": "TH1007",
  "sai-mai": "TH1042"
}

/** A subset of Bangkok's 50 districts, enough for the class, in the same order as before (by English name). */
export const districts: ReadonlyMap<string, District> = new Map(
  Object.values(BANGKOK_SLUGS)
    .map((pcode) => basinDistricts.get(pcode))
    .filter((d) => d !== undefined)
    .map(({ id, nameTh, nameEn, centre }): District => ({ id, nameTh, nameEn, centre }))
    .map((d) => [d.id, d])
)

/** The P-code for a district the app serves, given its P-code or an old Bangkok slug; undefined otherwise. */
export function resolveDistrictId(idOrSlug: string): string | undefined {
  const id = Object.hasOwn(BANGKOK_SLUGS, idOrSlug) ? BANGKOK_SLUGS[idOrSlug] : idOrSlug
  return id !== undefined && districts.has(id) ? id : undefined
}
