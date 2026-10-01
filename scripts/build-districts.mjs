#!/usr/bin/env node
// Build the district data for the Chao Phraya basin from HDX COD-AB Thailand (CC BY-IGO).
//
//   node scripts/build-districts.mjs <dir with tha_admin1.geojson and tha_admin2.geojson>
//
// Download tha_admin_boundaries.geojson.zip from https://data.humdata.org/dataset/cod-ab-tha and
// unzip it first. Writes:
//   data/districts-th.json                 provinces and districts with P-codes, Thai names, centres
//   public/data/basin-provinces.geojson    simplified จังหวัด outlines for the map
//   public/data/basin-districts.geojson    simplified อำเภอ/เขต outlines for the map
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const SOURCE = process.argv[2]
if (!SOURCE) {
  console.error("usage: node scripts/build-districts.mjs <dir with tha_admin1.geojson and tha_admin2.geojson>")
  process.exit(1)
}

// Chao Phraya basin, Nakhon Sawan down to the sea (north-water spec, Q10).
const BASIN = ["TH60", "TH61", "TH18", "TH17", "TH15", "TH16", "TH14", "TH19", "TH13", "TH12", "TH10", "TH11"]
// HDX lists a wrong Thai name for this district; the Jan 2026 release has it right. Keep the guard.
const NAME_FIXES = { TH1008: "ป้อมปราบศัตรูพ่าย" }
const TOLERANCE = 0.0015 // degrees, about 150 m
const round = (n) => Math.round(n * 1e4) / 1e4

/** Douglas-Peucker on one ring, keeping it closed. */
function simplify(ring) {
  if (ring.length <= 4) return ring
  const keep = new Uint8Array(ring.length)
  // A closed ring starts and ends on the same point, so split it at the vertex farthest from the start.
  const [sx, sy] = ring[0]
  let split = 1
  for (let i = 1; i < ring.length - 1; i++) {
    if (Math.hypot(ring[i][0] - sx, ring[i][1] - sy) > Math.hypot(ring[split][0] - sx, ring[split][1] - sy)) split = i
  }
  keep[0] = keep[split] = keep[ring.length - 1] = 1
  const stack = [
    [0, split],
    [split, ring.length - 1]
  ]
  while (stack.length) {
    const [a, b] = stack.pop()
    const [x1, y1] = ring[a]
    const [x2, y2] = ring[b]
    const dx = x2 - x1
    const dy = y2 - y1
    const len = Math.hypot(dx, dy) || 1
    let far = -1
    let max = TOLERANCE
    for (let i = a + 1; i < b; i++) {
      const [x, y] = ring[i]
      const d = Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / len
      if (d > max) [max, far] = [d, i]
    }
    if (far > 0) {
      keep[far] = 1
      stack.push([a, far], [far, b])
    }
  }
  const out = ring.filter((_, i) => keep[i]).map(([x, y]) => [round(x), round(y)])
  return out.length >= 4 ? out : undefined
}

/** Simplify every ring; drop tiny islands and holes that collapse, but always keep each polygon's outer ring. */
function simplifyGeometry(geometry) {
  const polygon = (rings) => {
    const [outer, ...holes] = rings
    return [simplify(outer) ?? outer.map(([x, y]) => [round(x), round(y)]), ...holes.map(simplify).filter(Boolean)]
  }
  if (geometry.type === "Polygon") return { type: "Polygon", coordinates: polygon(geometry.coordinates) }
  const polys = geometry.coordinates.map(polygon).filter((p) => p[0].length >= 4)
  return polys.length === 1 ? { type: "Polygon", coordinates: polys[0] } : { type: "MultiPolygon", coordinates: polys }
}

const load = (file) => JSON.parse(readFileSync(join(SOURCE, file), "utf8")).features
const inBasin = (f) => BASIN.includes(f.properties.adm1_pcode)
const byPcode = (a, b) => (a.pcode < b.pcode ? -1 : 1)

const provinces = load("tha_admin1.geojson").filter(inBasin)
const districts = load("tha_admin2.geojson").filter(inBasin)

const provinceRows = provinces
  .map((f) => ({ pcode: f.properties.adm1_pcode, nameTh: f.properties.adm1_name1, nameEn: f.properties.adm1_name }))
  .sort(byPcode)
const districtRows = districts
  .map((f) => {
    const p = f.properties
    return {
      pcode: p.adm2_pcode,
      nameTh: NAME_FIXES[p.adm2_pcode] ?? p.adm2_name1,
      nameEn: p.adm2_name,
      provincePcode: p.adm1_pcode,
      centre: [round(p.center_lon), round(p.center_lat)]
    }
  })
  .sort(byPcode)

const SOURCE_NOTE = {
  name: "Thailand - Subnational Administrative Boundaries (COD-AB), Royal Thai Survey Department / OCHA ROAP",
  url: "https://data.humdata.org/dataset/cod-ab-tha",
  licence: "CC BY-IGO",
  validOn: districts[0]?.properties.valid_on
}

writeFileSync(join(ROOT, "data/districts-th.json"), JSON.stringify({ source: SOURCE_NOTE, provinces: provinceRows, districts: districtRows }, null, 1) + "\n")

mkdirSync(join(ROOT, "public/data"), { recursive: true })
const collection = (features) => JSON.stringify({ type: "FeatureCollection", source: SOURCE_NOTE, features }) + "\n"
writeFileSync(
  join(ROOT, "public/data/basin-provinces.geojson"),
  collection(provinces.map((f) => ({ type: "Feature", properties: { pcode: f.properties.adm1_pcode, nameTh: f.properties.adm1_name1 }, geometry: simplifyGeometry(f.geometry) })))
)
writeFileSync(
  join(ROOT, "public/data/basin-districts.geojson"),
  collection(
    districts.map((f) => ({
      type: "Feature",
      properties: { pcode: f.properties.adm2_pcode, nameTh: NAME_FIXES[f.properties.adm2_pcode] ?? f.properties.adm2_name1, provincePcode: f.properties.adm1_pcode },
      geometry: simplifyGeometry(f.geometry)
    }))
  )
)
console.log(`build-districts: ${provinceRows.length} provinces, ${districtRows.length} districts`)
