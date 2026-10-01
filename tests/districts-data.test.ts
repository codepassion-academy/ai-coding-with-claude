import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// data/districts-th.json and public/data/basin-*.geojson come from scripts/build-districts.mjs (HDX COD-AB).
const read = (path: string) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"))

type Row = { pcode: string; nameTh: string; nameEn: string; provincePcode?: string; centre?: [number, number] }
const data = read("data/districts-th.json") as { source: { licence: string; url: string }; provinces: Row[]; districts: Row[] }
const districtShapes = read("public/data/basin-districts.geojson") as { features: { properties: { pcode: string } }[] }
const provinceShapes = read("public/data/basin-provinces.geojson") as { features: { properties: { pcode: string } }[] }

// Nakhon Sawan down to the sea (north-water spec, Q10).
const BASIN = ["TH10", "TH11", "TH12", "TH13", "TH14", "TH15", "TH16", "TH17", "TH18", "TH19", "TH60", "TH61"]

describe("district data (HDX COD-AB, CC BY-IGO)", () => {
  it("records its source and licence", () => {
    expect(data.source).toMatchObject({ licence: "CC BY-IGO", url: "https://data.humdata.org/dataset/cod-ab-tha" })
  })

  it("covers exactly the 12 Chao Phraya basin จังหวัด", () => {
    expect(data.provinces.map((p) => p.pcode).sort()).toEqual(BASIN)
  })

  it("gives every อำเภอ a unique P-code inside a basin จังหวัด, with Thai and English names", () => {
    const pcodes = data.districts.map((d) => d.pcode)
    expect(new Set(pcodes).size).toBe(pcodes.length)
    for (const d of data.districts) {
      expect(d.pcode.startsWith(d.provincePcode ?? "?"), d.pcode).toBe(true)
      expect(BASIN).toContain(d.provincePcode)
      expect(d.nameTh, d.pcode).toMatch(/[฀-๿]/u)
      expect(d.nameEn, d.pcode).toMatch(/[A-Za-z]/)
    }
    expect(data.districts.filter((d) => d.provincePcode === "TH10")).toHaveLength(50)
  })

  it("puts every กึ่งกลางเขต inside the basin's rough box", () => {
    for (const d of data.districts) {
      const [lon, lat] = d.centre ?? [0, 0]
      expect(lon, d.pcode).toBeGreaterThan(99)
      expect(lon, d.pcode).toBeLessThan(101.6)
      expect(lat, d.pcode).toBeGreaterThan(13.4)
      expect(lat, d.pcode).toBeLessThan(16.3)
    }
  })

  it("uses the correct Thai name for TH1008 (HDX caveat)", () => {
    expect(data.districts.find((d) => d.pcode === "TH1008")?.nameTh).toBe("ป้อมปราบศัตรูพ่าย")
  })

  it("has one outline per district and per province on the map", () => {
    expect(districtShapes.features.map((f) => f.properties.pcode).sort()).toEqual(data.districts.map((d) => d.pcode).sort())
    expect(provinceShapes.features.map((f) => f.properties.pcode).sort()).toEqual(BASIN)
  })
})
