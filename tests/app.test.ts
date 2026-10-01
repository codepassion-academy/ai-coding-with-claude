import { describe, expect, it } from "vitest"
import { handle, NOTICE } from "../src/app.ts"

const now = new Date("2026-09-30T12:30:00Z")

describe("GET /districts", () => {
  it("lists districts with the teaching notice", () => {
    const res = handle("GET", "/districts", undefined, { now })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ notice: NOTICE })
    expect((res.body as { districts: unknown[] }).districts.length).toBe(12)
  })
})

describe("GET /districts/:id", () => {
  it("shows the latest station reading in Bangkok time", () => {
    const res = handle("GET", "/districts/lat-phrao", undefined, { now })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      district: { id: "lat-phrao", nameTh: "ลาดพร้าว" },
      stations: [{ id: "st-ladprao-01", latest: { at: "2026-09-30T19:00:00+07:00", levelCm: 104 } }]
    })
  })

  it("ignores readings after now", () => {
    const res = handle("GET", "/districts/lat-phrao", undefined, { now: new Date("2026-09-30T10:30:00Z") })
    expect(res.body).toMatchObject({ stations: [{ latest: { levelCm: 88 } }] })
  })

  it("returns an empty station list for a district with no stations", () => {
    const res = handle("GET", "/districts/sai-mai", undefined, { now })
    expect(res.body).toMatchObject({ stations: [] })
  })

  it("returns 404 for an unknown district", () => {
    expect(handle("GET", "/districts/atlantis", undefined, { now }).status).toBe(404)
  })
})

describe("กึ่งกลางเขต (district centre)", () => {
  // Bangkok's bounds as the map page uses them: [[west, south], [east, north]].
  const inBangkok = ([lon, lat]: [number, number]) => lon >= 100.3 && lon <= 100.95 && lat >= 13.5 && lat <= 14.05

  it("gives every district in GET /districts a [lon, lat] centre inside Bangkok", () => {
    const { districts } = handle("GET", "/districts", undefined, { now }).body as { districts: { centre: [number, number] }[] }
    for (const d of districts) {
      expect(d.centre).toHaveLength(2)
      expect(inBangkok(d.centre)).toBe(true)
    }
  })

  it("includes the centre on GET /districts/:id", () => {
    const res = handle("GET", "/districts/chatuchak", undefined, { now })
    expect(res.body).toMatchObject({ district: { id: "chatuchak", centre: [100.56, 13.83] } })
  })
})

describe("unknown routes", () => {
  it("returns 404", () => {
    expect(handle("GET", "/nope", undefined, { now }).status).toBe(404)
  })
})
