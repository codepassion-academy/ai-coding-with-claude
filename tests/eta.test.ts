import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { describe, expect, it } from "vitest"

// north-water 05: ETA inside the สถานการณ์จำลอง only. Worked examples computed separately (Python, haversine).
type Eta = { distanceKm: number; speedKmh: number; arrivalT: number; depthLevel: string | null; offKm: number; beyondScenario: boolean }
type Logic = {
  eta(place: [number, number], scenario: unknown): Eta
  etaText(eta: Eta): string
  ETA_PRESETS: { name: string; at: [number, number] }[]
}

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
const scenario = JSON.parse(read("public/data/scenarios/chao-phraya.json")) as unknown
const window: { NAMTUAM_LOGIC?: Logic } = {}
runInNewContext(read("public/logic.js"), { window })
const logic = window.NAMTUAM_LOGIC as Logic

describe("eta", () => {
  it("Ayutthaya, on the river: 162.9 km at 2.5 km/h is T+66, waist deep", () => {
    const e = logic.eta([100.577, 14.353], scenario)
    expect(e.distanceKm).toBeCloseTo(162.87, 1)
    expect(e.speedKmh).toBe(2.5)
    expect(e.arrivalT).toBe(66)
    expect(e.depthLevel).toBe("waist")
    expect(e.offKm).toBeLessThan(0.01)
    expect(e.beyondScenario).toBe(false)
  })

  it("Don Mueang airport: snaps to the river 10.3 km away, T+85, outside every flood area", () => {
    const e = logic.eta([100.6068, 13.9126], scenario)
    expect(e.distanceKm).toBeCloseTo(210.18, 1)
    expect(e.offKm).toBeCloseTo(10.35, 1)
    expect(e.arrivalT).toBe(85)
    expect(e.depthLevel).toBeNull()
  })

  it("the source itself is T+0 with no flooding", () => {
    const e = logic.eta([100.126, 15.7], scenario)
    expect(e.distanceKm).toBeCloseTo(0, 5)
    expect(e.arrivalT).toBe(0)
    expect(e.depthLevel).toBeNull()
  })
})

describe("etaText", () => {
  it("always shows the formula and inputs with the result", () => {
    expect(logic.etaText(logic.eta([100.577, 14.353], scenario))).toBe("ระยะทาง 162.9 กม. ÷ 2.5 กม./ชม. ≈ T+66 ชม., ระดับเอว")
  })

  it("says how far the place is from the water path, and when it is outside the flood areas", () => {
    const text = logic.etaText(logic.eta([100.6068, 13.9126], scenario))
    expect(text).toContain("ระยะทาง 210.2 กม. ÷ 2.5 กม./ชม. ≈ T+85 ชม.")
    expect(text).toContain("ห่างจากเส้นทางน้ำ 10.3 กม.")
    expect(text).toContain("ไม่อยู่ในพื้นที่น้ำท่วมของสถานการณ์จำลองนี้")
  })

  it("never shows a clock time", () => {
    expect(logic.etaText(logic.eta([100.577, 14.353], scenario))).not.toMatch(/\d{1,2}[:.]\d{2}\s*น/)
  })
})

describe("presets", () => {
  it("include ดอนเมือง and the river towns, all inside the basin", () => {
    const names = logic.ETA_PRESETS.map((p) => p.name)
    for (const name of ["ดอนเมือง", "อยุธยา", "นครสวรรค์"]) expect(names).toContain(name)
    for (const { name, at } of logic.ETA_PRESETS) expect(at[0] > 99 && at[0] < 101.6 && at[1] > 13.4 && at[1] < 16.3, name).toBe(true)
  })
})

describe("no coordinates leave the browser (safety rule 6, RPT-REQ-013)", () => {
  const app = read("public/app.js")

  it("the page sends exactly one request body, the report, and it has no coordinate fields", () => {
    expect(app.match(/JSON\.stringify\(/g)).toHaveLength(1)
    expect(app).toContain("body: JSON.stringify(body)")
    const literal = /const body = \{([\s\S]*?)\n {4}\}/.exec(app)?.[1] ?? ""
    const keys = [...literal.matchAll(/^\s*(?:\.\.\.\(.*\{ (\w+):|(\w+):)/gm)].map((m) => m[1] ?? m[2])
    expect(keys.sort()).toEqual(["depth", "kind", "landmark", "seenAt"])
  })

  it("never puts a coordinate in a URL", () => {
    expect(app).not.toMatch(/api\([^)]*(lng|lat|lngLat|coordinates|centre)/)
  })
})
