import { describe, expect, it } from "vitest"
import { handle, NOTICE } from "../src/app.ts"
import { districts } from "../src/districts.ts"
import { createReportStore } from "../src/reports.ts"

const now = new Date("2026-09-30T12:30:00Z")
const seenAt = "2026-09-30T12:00:00Z"
const valid = { landmark: "หน้าปากซอยลาดพร้าว 71", depth: "knee", seenAt }

/** Every test gets its own store so nothing leaks between tests (RPT-REQ-017 AC4). */
function setup() {
  return { ctx: { now, reports: createReportStore() } }
}

type PostBody = { notice: string; merged: boolean; report: Record<string, unknown> }
type GetBody = { stations: Record<string, unknown>[]; userReports: Record<string, unknown>[] }

describe("POST /districts/:id/reports (tracer bullet)", () => {
  it("RPT-REQ-001 AC1-2: accepts a valid report with 201, uuid id, notice, merged=false", () => {
    const { ctx } = setup()
    const res = handle("POST", "/districts/lat-phrao/reports", valid, ctx)
    const body = res.body as PostBody
    expect(res.status).toBe(201)
    expect(body.notice).toBe(NOTICE)
    expect(body.merged).toBe(false)
    expect(body.report.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it("RPT-REQ-001 AC3: the report shows up in GET /districts/:id userReports", () => {
    const { ctx } = setup()
    handle("POST", "/districts/lat-phrao/reports", valid, ctx)
    const body = handle("GET", "/districts/lat-phrao", undefined, ctx).body as GetBody
    expect(body.userReports).toHaveLength(1)
  })

  it("RPT-REQ-002 AC1: unknown district is 404 and nothing is stored", () => {
    const { ctx } = setup()
    const res = handle("POST", "/districts/atlantis/reports", valid, ctx)
    expect(res.status).toBe(404)
    expect(res.body).toMatchObject({ error: "unknown district" })
    expect(ctx.reports.size()).toBe(0)
  })

  it("RPT-REQ-002 AC2: every known district accepts a report, including one without stations", () => {
    for (const id of districts.keys()) {
      const { ctx } = setup()
      expect(handle("POST", `/districts/${id}/reports`, valid, ctx).status).toBe(201)
    }
  })

  it("RPT-REQ-006 AC1: depth levels map to 10/50/100 integer cm", () => {
    const expected = { ankle: 10, knee: 50, waist: 100 }
    for (const [depth, cm] of Object.entries(expected)) {
      const { ctx } = setup()
      const res = handle("POST", "/districts/lat-phrao/reports", { ...valid, depth }, ctx)
      const report = (res.body as PostBody).report
      expect(report.depthLevel).toBe(depth)
      expect(report.depthCm).toBe(cm)
      expect(Number.isInteger(report.depthCm)).toBe(true)
    }
  })
})

describe("GET /districts/:id with userReports", () => {
  it("RPT-REQ-011 AC2: keeps user reports out of stations and has no levelCm", () => {
    const { ctx } = setup()
    handle("POST", "/districts/lat-phrao/reports", valid, ctx)
    const body = handle("GET", "/districts/lat-phrao", undefined, ctx).body as GetBody
    expect(body.stations.map((s) => s.id)).toEqual(["st-ladprao-01"])
    expect(body.userReports[0]).not.toHaveProperty("levelCm")
  })

  it("RPT-REQ-011 AC3: labels every report as an unverified user report", () => {
    const { ctx } = setup()
    handle("POST", "/districts/lat-phrao/reports", valid, ctx)
    const [report] = (handle("GET", "/districts/lat-phrao", undefined, ctx).body as GetBody).userReports
    expect(report).toMatchObject({
      source: "user-report",
      verified: false,
      label: "ผู้ใช้รายงาน ยังไม่ยืนยัน"
    })
  })

  it("RPT-REQ-011: a district with no reports gets [] not null", () => {
    const { ctx } = setup()
    const body = handle("GET", "/districts/sai-mai", undefined, ctx).body as GetBody
    expect(body.userReports).toEqual([])
  })
})

function post(body: unknown, ctx = setup().ctx) {
  return handle("POST", "/districts/lat-phrao/reports", body, ctx)
}

describe("body shape (RPT-REQ-003)", () => {
  it("AC1: non-object bodies are invalid_body", () => {
    for (const body of [undefined, null, [], [valid], "x", 42, true]) {
      const res = post(body)
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ notice: NOTICE, error: "invalid_body" })
    }
  })

  it("AC2: a missing or non-string field names that field", () => {
    const cases: [string, string][] = [
      ["landmark", "landmark_invalid"],
      ["depth", "depth_invalid"],
      ["seenAt", "seen_at_invalid"]
    ]
    for (const [field, error] of cases) {
      const missing = Object.fromEntries(Object.entries(valid).filter(([k]) => k !== field))
      expect(post(missing).body).toEqual({ notice: NOTICE, error, field })
      expect(post({ ...valid, [field]: 123 }).body).toEqual({ notice: NOTICE, error, field })
    }
  })

  it("AC3: any extra field is unknown_field and nothing is stored", () => {
    for (const extra of ["phone", "name", "ip", "lat", "district", "districtId"]) {
      const { ctx } = setup()
      const res = post({ ...valid, [extra]: "x" }, ctx)
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ notice: NOTICE, error: "unknown_field" })
      expect(ctx.reports.size()).toBe(0)
    }
  })

  it("AC3: __proto__ from JSON.parse is an unknown field", () => {
    const { ctx } = setup()
    const body = JSON.parse(`{"landmark":"ปากซอย","depth":"knee","seenAt":"${seenAt}","__proto__":{"x":1}}`)
    expect(post(body, ctx).body).toEqual({ notice: NOTICE, error: "unknown_field" })
    expect(ctx.reports.size()).toBe(0)
  })

  it("AC4: error responses never echo submitted values", () => {
    const secret = "ร้านลับสุดยอด"
    for (const body of [
      { ...valid, landmark: secret, depth: "chest" },
      { ...valid, landmark: secret, seenAt: "yesterday-" + secret },
      { ...valid, landmark: secret, extra: secret }
    ]) {
      const res = post(body)
      expect(res.status).toBe(400)
      expect(JSON.stringify(res.body)).not.toContain(secret)
      expect(Object.keys(res.body as object).every((k) => ["notice", "error", "field"].includes(k))).toBe(true)
    }
  })
})

describe("landmark through the API (RPT-REQ-004)", () => {
  it("rejects an invalid landmark with landmark_invalid", () => {
    expect(post({ ...valid, landmark: "ซอย\nลาดพร้าว" }).body).toEqual({
      notice: NOTICE,
      error: "landmark_invalid",
      field: "landmark"
    })
  })

  it("stores the normalized landmark", () => {
    const res = post({ ...valid, landmark: "  ซอย\u200Bลาดพร้าว   71 " })
    expect((res.body as PostBody).report.landmark).toBe("ซอยลาดพร้าว 71")
  })
})

describe("depth (RPT-REQ-006 AC2)", () => {
  it("rejects anything but the exact lowercase enum", () => {
    for (const depth of ["KNEE", "knee ", "chest", 50, "50", null, "toString", "__proto__"]) {
      expect(post({ ...valid, depth }).body).toEqual({ notice: NOTICE, error: "depth_invalid", field: "depth" })
    }
  })
})

describe("seenAt (RPT-REQ-007)", () => {
  const seen = (value: unknown) => post({ ...valid, seenAt: value })

  it("AC1: now passes, now + 1ms is seen_at_future", () => {
    expect(seen("2026-09-30T12:30:00Z").status).toBe(201)
    expect(seen("2026-09-30T12:30:00.001Z").body).toEqual({
      notice: NOTICE,
      error: "seen_at_future",
      field: "seenAt"
    })
  })

  it("AC2: now − 3h passes, now − 3h − 1ms is seen_at_too_old", () => {
    expect(seen("2026-09-30T09:30:00Z").status).toBe(201)
    expect(seen("2026-09-30T09:29:59.999Z").body).toEqual({
      notice: NOTICE,
      error: "seen_at_too_old",
      field: "seenAt"
    })
  })

  it("AC3: +07:00 and Z for the same instant are stored the same", () => {
    const a = (seen("2026-09-30T19:00:00+07:00").body as PostBody).report.seenAt
    const b = (seen("2026-09-30T12:00:00Z").body as PostBody).report.seenAt
    expect(a).toBe(b)
  })

  it("AC4: missing offset, other formats and impossible dates are seen_at_invalid", () => {
    for (const value of [
      "2026-09-30T12:00:00",
      "30/09/2026",
      "1790000000",
      1790000000000,
      "2026-02-30T12:00:00Z",
      "2026-09-31T12:00:00Z",
      "2026-09-30T24:00:00Z",
      "2026-09-30T12:60:00Z",
      "2026-09-30T12:00:00+7:00",
      "2026-09-30 12:00:00Z",
      " 2026-09-30T12:00:00Z",
      "2026-09-30T12:00:00z"
    ]) {
      expect(seen(value).body, String(value)).toEqual({ notice: NOTICE, error: "seen_at_invalid", field: "seenAt" })
    }
  })

  it("AC5: the response shows seenAt in Bangkok time", () => {
    const report = (seen("2026-09-30T12:00:00Z").body as PostBody).report
    expect(report.seenAt).toBe("2026-09-30T19:00:00+07:00")
  })
})
