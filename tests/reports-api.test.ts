import { describe, expect, it } from "vitest"
import { handle, NOTICE } from "../src/app.ts"
import { districts } from "../src/districts.ts"
import { createRateLimiter } from "../src/rate-limit.ts"
import {
  ageLabelTh,
  createReportStore,
  DISPLAY_TTL_MS,
  MAX_ACTIVE_REPORTS,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS
} from "../src/reports.ts"

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

describe("merging duplicate reports (RPT-REQ-010)", () => {
  it("AC1: a duplicate is 200 merged=true and GET shows one entry with confirmations 2", () => {
    const { ctx } = setup()
    const first = handle("POST", "/districts/lat-phrao/reports", valid, ctx)
    const second = handle("POST", "/districts/lat-phrao/reports", valid, ctx)
    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    expect(second.body).toMatchObject({ notice: NOTICE, merged: true, report: { confirmations: 2 } })
    const body = handle("GET", "/districts/lat-phrao", undefined, ctx).body as GetBody
    expect(body.userReports).toEqual([expect.objectContaining({ confirmations: 2 })])
  })
})

describe("rate limit through the API (RPT-REQ-008, RPT-REQ-009)", () => {
  const KEY = "203.0.113.7"
  const url = "/districts/lat-phrao/reports"
  const landmark = (i: number) => ({ ...valid, landmark: `ปากซอย ${i}` })

  function withKey(clientKey?: string) {
    const reports = createReportStore()
    return clientKey === undefined ? { now, reports } : { now, reports, clientKey }
  }

  function fill(ctx: ReturnType<typeof withKey>) {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) expect(handle("POST", url, landmark(i), ctx).status, `#${i + 1}`).toBe(201)
  }

  it("008 AC1: the 6th accepted report is 429 with a fixed body and Retry-After header", () => {
    const ctx = withKey(KEY)
    fill(ctx)
    const res = handle("POST", url, landmark(99), ctx)
    const body = res.body as { retryAfterSec: number }
    expect(res.status).toBe(429)
    expect(res.body).toEqual({ notice: NOTICE, error: "rate_limited", retryAfterSec: 3600 })
    expect(Number.isInteger(body.retryAfterSec) && body.retryAfterSec >= 1).toBe(true)
    expect(res.headers).toEqual({ "Retry-After": String(body.retryAfterSec) })
  })

  it("008: quota is checked before validation, so a bad body over quota is 429 not 400", () => {
    const ctx = withKey(KEY)
    fill(ctx)
    expect(handle("POST", url, { ...valid, depth: "chest" }, ctx).status).toBe(429)
  })

  it("008 AC5 / E14: merged reports count, so resending the same text cannot dodge the limit", () => {
    const ctx = withKey(KEY)
    const statuses = Array.from({ length: RATE_LIMIT_MAX + 1 }, () => handle("POST", url, valid, ctx).status)
    expect(statuses).toEqual([201, 200, 200, 200, 200, 429])
    const [report] = (handle("GET", "/districts/lat-phrao", undefined, ctx).body as GetBody).userReports
    expect(report?.confirmations).toBe(RATE_LIMIT_MAX)
  })

  it("008 AC6: rejected 400s do not use up quota", () => {
    const ctx = withKey(KEY)
    for (let i = 0; i < 10; i++) expect(handle("POST", url, { ...valid, depth: "chest" }, ctx).status).toBe(400)
    fill(ctx)
  })

  it("008: a 429 does not use up quota either; after the window one more passes", () => {
    const ctx = withKey(KEY)
    fill(ctx)
    for (let i = 0; i < 3; i++) expect(handle("POST", url, landmark(50 + i), ctx).status).toBe(429)
    const later = { ...ctx, now: new Date(now.getTime() + RATE_LIMIT_WINDOW_MS) }
    expect(handle("POST", url, landmark(60), later).status).toBe(201)
  })

  it("008 AC2 / 009: another client key is not affected", () => {
    const ctx = withKey(KEY)
    fill(ctx)
    expect(handle("POST", url, landmark(99), { ...ctx, clientKey: "198.51.100.1" }).status).toBe(201)
  })

  it("009 AC4: the client key never shows up in stored reports or any response", () => {
    const ctx = withKey(KEY)
    const outputs: unknown[] = []
    for (let i = 0; i <= RATE_LIMIT_MAX; i++) {
      const res = handle("POST", url, landmark(i), ctx)
      outputs.push(res.body, res.headers)
    }
    outputs.push(handle("GET", "/districts/lat-phrao", undefined, ctx).body)
    outputs.push(ctx.reports.activeIn("lat-phrao", now))
    expect(JSON.stringify(outputs)).not.toContain(KEY)
  })

  it("009 AC5 / E17: no clientKey still gets limited in the shared 'unknown' bucket", () => {
    const ctx = withKey()
    fill(ctx)
    expect(handle("POST", url, landmark(99), ctx).status).toBe(429)
  })

  it("success responses carry no headers", () => {
    expect(handle("POST", url, valid, withKey(KEY)).headers).toBeUndefined()
  })
})

describe("age, order and fields in userReports (RPT-REQ-011)", () => {
  const MINUTE = 60 * 1000
  const at = (ms: number) => new Date(now.getTime() + ms)
  const iso = (d: Date) => d.toISOString()
  const get = (ctx: { now: Date; reports: ReturnType<typeof createReportStore> }, when = ctx.now) =>
    (handle("GET", "/districts/lat-phrao", undefined, { ...ctx, now: when }).body as GetBody).userReports

  it("AC4 / E8: shown at 5h59m59s old, gone at exactly 6h", () => {
    const { ctx } = setup()
    handle("POST", "/districts/lat-phrao/reports", { ...valid, seenAt: iso(now) }, ctx)
    expect(get(ctx, at(DISPLAY_TTL_MS - 1000))).toHaveLength(1)
    expect(get(ctx, at(DISPLAY_TTL_MS))).toEqual([])
  })

  it("AC5: ageMinutes and ageLabel for 0 s, 40 min and 125 min", () => {
    const { ctx } = setup()
    for (const [landmark, minutesAgo] of [["ก ข", 0], ["ค ง", 40], ["จ ฉ", 125]] as const) {
      handle("POST", "/districts/lat-phrao/reports", { ...valid, landmark, seenAt: iso(at(-minutesAgo * MINUTE)) }, ctx)
    }
    expect(get(ctx).map((r) => [r.landmark, r.ageMinutes, r.ageLabel])).toEqual([
      ["ก ข", 0, "เห็นเมื่อสักครู่"],
      ["ค ง", 40, "เห็นเมื่อ 40 นาทีก่อน"],
      ["จ ฉ", 125, "เห็นเมื่อ 2 ชั่วโมงก่อน"]
    ])
  })

  it("AC5: ageMinutes is floored and moves with now", () => {
    const { ctx } = setup()
    handle("POST", "/districts/lat-phrao/reports", { ...valid, seenAt: iso(now) }, ctx)
    expect(get(ctx, at(59_999))[0]?.ageMinutes).toBe(0)
    expect(get(ctx, at(60_000))[0]?.ageMinutes).toBe(1)
    expect(get(ctx, at(61 * MINUTE + 59_999))[0]).toMatchObject({ ageMinutes: 61, ageLabel: "เห็นเมื่อ 1 ชั่วโมงก่อน" })
  })

  it("AC6: newest seenAt first", () => {
    const { ctx } = setup()
    for (const [landmark, minutesAgo] of [["เก่า", 30], ["ใหม่", 10], ["กลาง", 20]] as const) {
      handle("POST", "/districts/lat-phrao/reports", { ...valid, landmark, seenAt: iso(at(-minutesAgo * MINUTE)) }, ctx)
    }
    expect(get(ctx).map((r) => r.landmark)).toEqual(["ใหม่", "กลาง", "เก่า"])
  })

  it("AC6: the same seenAt is ordered by id", () => {
    const { ctx } = setup()
    for (const landmark of ["ก ก", "ข ข", "ค ค", "ง ง"]) handle("POST", "/districts/lat-phrao/reports", { ...valid, landmark }, ctx)
    const ids = get(ctx).map((r) => String(r.id))
    expect(ids).toEqual([...ids].sort())
  })

  it("AC6: a merge with a newer seenAt moves the report up", () => {
    const { ctx } = setup()
    handle("POST", "/districts/lat-phrao/reports", { ...valid, landmark: "ก ก", seenAt: iso(at(-30 * MINUTE)) }, ctx)
    handle("POST", "/districts/lat-phrao/reports", { ...valid, landmark: "ข ข", seenAt: iso(at(-20 * MINUTE)) }, ctx)
    handle("POST", "/districts/lat-phrao/reports", { ...valid, landmark: "ก ก", seenAt: iso(at(-5 * MINUTE)) }, ctx)
    expect(get(ctx).map((r) => r.landmark)).toEqual(["ก ก", "ข ข"])
  })

  it("AC7: each userReport has exactly the public fields, and the POST report matches", () => {
    const { ctx } = setup()
    const posted = (handle("POST", "/districts/lat-phrao/reports", valid, ctx).body as PostBody).report
    const fields = ["id", "source", "verified", "label", "landmark", "depthLevel", "depthCm", "seenAt", "ageMinutes", "ageLabel", "confirmations", "kind"]
    const [shown] = get(ctx)
    expect(Object.keys(shown ?? {}).sort()).toEqual([...fields].sort())
    expect(posted).toEqual(shown)
  })
})

describe("ageLabelTh (RPT-REQ-011)", () => {
  it("covers the three ranges and their edges", () => {
    expect(ageLabelTh(0)).toBe("เห็นเมื่อสักครู่")
    expect(ageLabelTh(1)).toBe("เห็นเมื่อ 1 นาทีก่อน")
    expect(ageLabelTh(59)).toBe("เห็นเมื่อ 59 นาทีก่อน")
    expect(ageLabelTh(60)).toBe("เห็นเมื่อ 1 ชั่วโมงก่อน")
    expect(ageLabelTh(125)).toBe("เห็นเมื่อ 2 ชั่วโมงก่อน")
    expect(ageLabelTh(359)).toBe("เห็นเมื่อ 5 ชั่วโมงก่อน")
  })
})

describe("expired reports are removed (RPT-REQ-012)", () => {
  // valid.seenAt is 30 min before now, so it expires at now + 5h30m.
  const expired = new Date(now.getTime() + DISPLAY_TTL_MS)

  it("AC1: after 6 h a GET removes the report from memory, not just from the list", () => {
    const { ctx } = setup()
    handle("POST", "/districts/lat-phrao/reports", valid, ctx)
    handle("GET", "/districts/lat-phrao", undefined, { ...ctx, now: expired })
    expect(ctx.reports.size()).toBe(0)
  })

  it("AC1: a GET or POST for any district purges every district", () => {
    const { ctx } = setup()
    handle("POST", "/districts/lat-phrao/reports", valid, ctx)
    handle("GET", "/districts/sai-mai", undefined, { ...ctx, now: expired })
    expect(ctx.reports.size()).toBe(0)

    handle("POST", "/districts/lat-phrao/reports", valid, ctx)
    const later = { ...ctx, now: expired }
    handle("POST", "/districts/bang-kapi/reports", { ...valid, seenAt: expired.toISOString() }, later)
    expect(ctx.reports.size()).toBe(1)
  })

  it("AC2 / E12: the same text after the old one expired is a new report, not a merge", () => {
    const { ctx } = setup()
    const first = (handle("POST", "/districts/lat-phrao/reports", valid, ctx).body as PostBody).report
    const res = handle("POST", "/districts/lat-phrao/reports", { ...valid, seenAt: expired.toISOString() }, { ...ctx, now: expired })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ merged: false, report: { confirmations: 1 } })
    expect((res.body as PostBody).report.id).not.toBe(first.id)
  })

  it("AC3: the limiter drops keys with nothing left in the window on the same GET", () => {
    const limiter = createRateLimiter()
    const ctx = { now, reports: createReportStore(limiter), clientKey: "203.0.113.7" }
    handle("POST", "/districts/lat-phrao/reports", valid, ctx)
    expect(limiter.size()).toBe(1)
    handle("GET", "/districts/sai-mai", undefined, { ...ctx, now: new Date(now.getTime() + RATE_LIMIT_WINDOW_MS) })
    expect(limiter.size()).toBe(0)
  })
})

describe("full store through the API (RPT-REQ-014, RPT-REQ-016 AC1)", () => {
  it("a new report into a full store is 503 store_full with notice; a duplicate is 200", () => {
    const { ctx } = setup()
    for (let i = 0; i < MAX_ACTIVE_REPORTS; i++) {
      handle("POST", "/districts/lat-phrao/reports", { ...valid, landmark: `จุด ${i}` }, { ...ctx, clientKey: `c${i}` })
    }
    const full = handle("POST", "/districts/sai-mai/reports", valid, { ...ctx, clientKey: "x" })
    expect(full.status).toBe(503)
    expect(full.body).toEqual({ notice: NOTICE, error: "store_full" })
    expect(handle("POST", "/districts/lat-phrao/reports", { ...valid, landmark: "จุด 3" }, { ...ctx, clientKey: "x" }).status).toBe(200)
  })
})

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
