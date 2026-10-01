import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { describe, expect, it } from "vitest"

// north-water 03: one hand-authored สถานการณ์จำลอง. Scenario clock only (safety rule 2), banner on the canvas (rule 3).
type LineString = { type: "LineString"; coordinates: [number, number][] }
type Area = { name: string; centre: [number, number]; radiusKm: number; depthLevel: string; fromT: number }
type Scenario = {
  label: string
  title: string
  speedKmh: number
  maxT: number
  stepT: number
  flowLine: LineString
  releases: { dam: string; steps: { fromT: number; m3s: number }[] }[]
  floodAreas: Area[]
}
type Step = { t: number; frontKm: number; releases: { dam: string; m3s: number }[]; areas: Area[] }
type Logic = {
  scenarioStep(scenario: Scenario, t: number): Step
  lineLengthKm(line: LineString): number
  snapToLine(line: LineString, point: [number, number]): { km: number; offKm: number; point: [number, number] }
  formatT(t: number): string
  lineUpToKm(line: LineString, km: number): [number, number][]
  circleRing(centre: [number, number], radiusKm: number): [number, number][]
  haversineKm(a: [number, number], b: [number, number]): number
  bannerFeatures(bounds: [[number, number], [number, number]], label: string, on: boolean): { properties: { text: string }; geometry: { coordinates: [number, number] } }[]
  damPopup(dam: { nameTh: string; rid: string }, release?: { m3s: number }): { title: string; note: string; link: { href: string; text: string } }
  releaseText(m3s: number): string
}

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
const raw = read("public/data/scenarios/chao-phraya.json")
const scenario = JSON.parse(raw) as Scenario
const window: { NAMTUAM_LOGIC?: Logic } = {}
runInNewContext(read("public/logic.js"), { window })
const logic = window.NAMTUAM_LOGIC as Logic
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const damIds = (JSON.parse(read("public/data/dams.geojson")) as { features: { properties: { id: string } }[] }).features.map((f) => f.properties.id)

describe("the scenario data", () => {
  it("is labelled as demo data, not a forecast", () => {
    expect(scenario.label).toBe("ข้อมูลจำลอง · ไม่ใช่การพยากรณ์")
  })

  it("has no wall-clock date or time anywhere, only T+hours", () => {
    expect(raw).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(raw).not.toMatch(/\d{1,2}[:.]\d{2}\s*น/)
    expect(raw).not.toMatch(/มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม|ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\./u)
  })

  it("releases water only from the dams on the map", () => {
    for (const r of scenario.releases) expect(damIds, r.dam).toContain(r.dam)
  })

  it("never floods a spot before the water front reaches it", () => {
    for (const area of scenario.floodAreas) {
      const { km } = logic.snapToLine(scenario.flowLine, area.centre)
      expect(area.fromT, area.name).toBeGreaterThanOrEqual(km / scenario.speedKmh)
    }
  })
})

describe("scenarioStep", () => {
  it("starts with the first release of every dam, no flooding and the front at the source", () => {
    const step = plain(logic.scenarioStep(scenario, 0))
    expect(step.t).toBe(0)
    expect(step.frontKm).toBe(0)
    expect(step.areas).toEqual([])
    expect(step.releases).toContainEqual({ dam: "bhumibol", m3s: 2500 })
  })

  it("at T+50 uses each dam's latest release step and the areas the front has passed", () => {
    const step = plain(logic.scenarioStep(scenario, 50))
    expect(step.releases).toContainEqual({ dam: "bhumibol", m3s: 3200 })
    expect(step.releases).toContainEqual({ dam: "chao-phraya", m3s: 2700 })
    expect(step.releases).toContainEqual({ dam: "pasak-jolasid", m3s: 400 })
    expect(step.areas.map((a) => a.name)).toEqual(["ท้ายเขื่อนเจ้าพระยา ชัยนาท", "ริมแม่น้ำ อำเภอเมืองสิงห์บุรี"])
    expect(step.frontKm).toBe(125)
  })

  it("keeps T between 0 and maxT, and the front on the line", () => {
    expect(logic.scenarioStep(scenario, -5).t).toBe(0)
    const end = logic.scenarioStep(scenario, 10_000)
    expect(end.t).toBe(scenario.maxT)
    expect(end.frontKm).toBeLessThanOrEqual(logic.lineLengthKm(scenario.flowLine))
  })
})

describe("formatT", () => {
  it("says hours after the release, never a clock time", () => {
    expect(logic.formatT(0)).toBe("T+0 ชม.")
    expect(logic.formatT(18)).toBe("T+18 ชม.")
  })
})

describe("on-canvas banner (safety rule 3)", () => {
  const bounds: [[number, number], [number, number]] = [[98.6, 13.4], [101.7, 18.0]]

  it("covers the view with the label while the scenario is on", () => {
    const features = logic.bannerFeatures(bounds, scenario.label, true)
    expect(features.length).toBeGreaterThanOrEqual(6)
    for (const f of features) {
      expect(f.properties.text).toBe(scenario.label)
      const [lon, lat] = f.geometry.coordinates
      expect(lon >= 98.6 && lon <= 101.7 && lat >= 13.4 && lat <= 18.0).toBe(true)
    }
  })

  it("is gone when the scenario is off", () => {
    expect(plain(logic.bannerFeatures(bounds, scenario.label, false))).toEqual([])
  })
})

describe("dam popup inside the scenario", () => {
  it("shows the made-up release, marked as จำลอง", () => {
    const popup = logic.damPopup({ nameTh: "ภูมิพล", rid: "https://app.rid.go.th/reservoir/" }, { m3s: 3200 })
    expect(popup.note).toContain("3,200 ลบ.ม./วินาที")
    expect(popup.note).toContain("จำลอง")
  })

  it("words a release with thousands separators", () => {
    expect(logic.releaseText(400)).toBe("ระบาย 400 ลบ.ม./วินาที")
    expect(logic.releaseText(12500)).toBe("ระบาย 12,500 ลบ.ม./วินาที")
  })
})

describe("drawing helpers", () => {
  it("cuts the flow line at the water front", () => {
    const reached = logic.lineUpToKm(scenario.flowLine, 125)
    expect(logic.lineLengthKm({ type: "LineString", coordinates: reached })).toBeCloseTo(125, 1)
    expect(plain(reached[0])).toEqual(scenario.flowLine.coordinates[0])
  })

  it("draws a closed flood circle of the given radius", () => {
    const centre: [number, number] = [100.577, 14.353]
    const ring = logic.circleRing(centre, 7)
    expect(plain(ring[0])).toEqual(plain(ring.at(-1)))
    for (const p of ring) expect(logic.haversineKm(centre, p)).toBeCloseTo(7, 0)
  })
})
