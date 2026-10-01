import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { describe, expect, it } from "vitest"
import { ageLabelTh } from "../src/reports.ts"

type Item = {
  id?: string
  key?: string
  kind: "report" | "station"
  districtId: string
  landmark?: string
  depthLevel?: string
  seenAt?: string
  lngLat?: [number, number]
  demo?: boolean
}

type Logic = {
  mergeReports(real: Item[], demo: Item[], demoOn: boolean): Item[]
  countByDepth(reports: Item[], filter: string): Record<string, number>
  countByDistrict(reports: Item[]): Record<string, number>
  place(centres: Record<string, [number, number]>, districtId: string, landmark: string): [number, number]
  positionOf(item: Item, centres: Record<string, [number, number]>): [number, number]
  errorMessage(code: string, retryAfterSec?: number): string
  ageLabel(minutes: number): string
  tabFromHash(hash: string): "flood" | "north"
}

/** The page logic module, loaded the way the browser loads it: a plain script that sets one global. */
function loadLogic(): Logic {
  const window: { NAMTUAM_LOGIC?: Logic } = {}
  runInNewContext(readFileSync(new URL("../public/logic.js", import.meta.url), "utf8"), { window })
  if (!window.NAMTUAM_LOGIC) throw new Error("logic.js did not define window.NAMTUAM_LOGIC")
  return window.NAMTUAM_LOGIC
}

const logic = loadLogic()
// Copy out of the VM realm so toEqual compares plain values.
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const report = (id: string, districtId: string, seenAt: string, depthLevel = "knee"): Item => ({
  id,
  key: id,
  kind: "report",
  districtId,
  landmark: `จุด ${id}`,
  depthLevel,
  seenAt
})

describe("mergeReports", () => {
  const real = [report("r1", "lat-phrao", "2026-09-30T19:00:00+07:00"), report("r2", "chatuchak", "2026-09-30T19:30:00+07:00")]
  const demo = [{ ...report("demo-0", "bang-na", "2026-09-30T19:15:00+07:00"), demo: true }]

  it("shows only real reports while ข้อมูลจำลอง is off", () => {
    expect(plain(logic.mergeReports(real, demo, false)).map((r) => r.id)).toEqual(["r2", "r1"])
  })

  it("adds ข้อมูลจำลอง when it is on, newest เวลาที่เห็น first", () => {
    expect(plain(logic.mergeReports(real, demo, true)).map((r) => r.id)).toEqual(["r2", "demo-0", "r1"])
  })

  it("breaks ties on เวลาที่เห็น by id", () => {
    const same = "2026-09-30T19:00:00+07:00"
    const tied = [report("r9", "lat-phrao", same), report("r10", "lat-phrao", same), report("r3", "lat-phrao", same)]
    expect(plain(logic.mergeReports(tied, [], false)).map((r) => r.id)).toEqual(["r10", "r3", "r9"])
  })
})

describe("counts", () => {
  const reports = [
    report("a", "lat-phrao", "2026-09-30T19:00:00+07:00", "ankle"),
    report("b", "lat-phrao", "2026-09-30T19:00:00+07:00", "waist"),
    report("c", "chatuchak", "2026-09-30T19:00:00+07:00", "waist"),
    report("d", "chatuchak", "2026-09-30T19:00:00+07:00", "knee")
  ]

  it("counts รายงาน per ระดับความลึก for every เขต", () => {
    expect(plain(logic.countByDepth(reports, "all"))).toEqual({ ankle: 1, knee: 1, waist: 2 })
  })

  it("respects the เขต filter", () => {
    expect(plain(logic.countByDepth(reports, "chatuchak"))).toEqual({ ankle: 0, knee: 1, waist: 1 })
  })

  it("counts รายงาน per เขต", () => {
    expect(plain(logic.countByDistrict(reports))).toEqual({ "lat-phrao": 2, chatuchak: 2 })
  })
})

describe("placing a หมุด", () => {
  const centres: Record<string, [number, number]> = { "lat-phrao": [100.61, 13.815], chatuchak: [100.56, 13.83] }
  const distance = ([a, b]: [number, number], [c, d]: [number, number]) => Math.hypot(a - c, b - d)

  it("puts the same เขต + จุดสังเกต on the same spot every time, so a merged รายงาน keeps one หมุด", () => {
    expect(logic.place(centres, "lat-phrao", "ปากซอยลาดพร้าว 71")).toEqual(logic.place(centres, "lat-phrao", "ปากซอยลาดพร้าว 71"))
  })

  it("spreads different จุดสังเกต in the same เขต apart", () => {
    expect(logic.place(centres, "lat-phrao", "ปากซอยลาดพร้าว 71")).not.toEqual(logic.place(centres, "lat-phrao", "หน้าตลาด"))
  })

  it("keeps every หมุด near its กึ่งกลางเขต (within about 1.5 km)", () => {
    for (const landmark of ["ก", "ปากซอยลาดพร้าว 71", "หน้าตลาด", "x".repeat(80), "ใต้สะพาน"]) {
      for (const id of ["lat-phrao", "chatuchak"]) {
        expect(distance(logic.place(centres, id, landmark), centres[id] as [number, number])).toBeLessThan(0.0135)
      }
    }
  })

  it("uses a demo item's own coordinate and a station's กึ่งกลางเขต", () => {
    const demo: Item = { ...report("demo-1", "lat-phrao", "2026-09-30T19:00:00+07:00"), lngLat: [100.7, 13.9], demo: true }
    expect(plain(logic.positionOf(demo, centres))).toEqual([100.7, 13.9])
    expect(plain(logic.positionOf({ kind: "station", districtId: "chatuchak" }, centres))).toEqual([100.56, 13.83])
  })

  it("places a real รายงาน the same way place() does, ignoring case in the จุดสังเกต", () => {
    const r: Item = { ...report("r1", "lat-phrao", "2026-09-30T19:00:00+07:00"), landmark: "Soi 71" }
    expect(plain(logic.positionOf(r, centres))).toEqual(plain(logic.place(centres, "lat-phrao", "soi 71")))
  })
})

describe("error messages", () => {
  // Every error code the API can return (src/app.ts, src/reports.ts, src/server.ts).
  const codes = [
    "invalid_body",
    "unknown_field",
    "landmark_invalid",
    "depth_invalid",
    "seen_at_invalid",
    "seen_at_future",
    "seen_at_too_old",
    "kind_invalid",
    "store_full",
    "payload_too_large",
    "unknown district",
    "not found",
    "invalid JSON",
    "internal"
  ]
  const fallback = logic.errorMessage("something-new")

  it("has its own Thai message for every API error code", () => {
    for (const code of codes) {
      const message = logic.errorMessage(code)
      expect(message, code).toMatch(/[฀-๿]/u)
      expect(message, code).not.toBe(fallback)
    }
  })

  it("tells a rate-limited reporter how many minutes to wait, rounded up", () => {
    expect(logic.errorMessage("rate_limited", 300)).toContain("5 นาที")
    expect(logic.errorMessage("rate_limited", 61)).toContain("2 นาที")
  })

  it("falls back to a generic Thai message for an unknown code", () => {
    expect(fallback).toBe("ส่งไม่สำเร็จ ลองใหม่อีกครั้ง")
  })
})

describe("ageLabel", () => {
  it("words the age the same way the API does (RPT-REQ-011)", () => {
    for (const minutes of [0, 1, 5, 59, 60, 125, 359]) expect(logic.ageLabel(minutes), String(minutes)).toBe(ageLabelTh(minutes))
  })
})

describe("tabFromHash (north-water 01)", () => {
  it("opens น้ำเหนืออยู่ไหน only for #/north", () => {
    expect(logic.tabFromHash("#/north")).toBe("north")
  })

  it("falls back to น้ำท่วมไหม for anything else", () => {
    for (const hash of ["", "#", "#/", "#/North", "#north", "#/north/x", "#/flood"]) expect(logic.tabFromHash(hash), hash).toBe("flood")
  })
})
