import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { createApp, handle, NOTICE } from "../src/app.ts"
import { createFileReportStore, createMemoryReportStore } from "../src/report-store.ts"
import { REPORT_LABEL } from "../src/reports.ts"

const NOW = new Date("2026-09-30T12:30:00Z")
const IP = "203.0.113.10"

const validReport = {
  districtId: "sai-mai",
  landmark: "ปากซอยสายไหม 15",
  depthCm: 25,
  observedAt: "2026-09-30T12:20:00Z"
}

// Made up for the tests; real secrets come from the environment.
const SECRET = "test-ip-hash-secret"

function setup() {
  const store = createMemoryReportStore()
  const app = createApp({ store, ipHashSecret: SECRET })
  return { store, app }
}

describe("POST /reports", () => {
  it("RPT-REQ-001 AC1 accepts a valid report with the notice and the label", () => {
    const { app } = setup()
    const res = app("POST", "/reports", validReport, { now: NOW, clientIp: IP })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      notice: NOTICE,
      label: REPORT_LABEL,
      report: {
        districtId: "sai-mai",
        landmark: "ปากซอยสายไหม 15",
        depthCm: 25,
        severity: "medium",
        observedAt: "2026-09-30T19:20:00+07:00"
      }
    })
    const { id } = (res.body as { report: { id: unknown } }).report
    expect(typeof id).toBe("string")
    expect(id).not.toBe("")
  })

  it("RPT-REQ-001 AC2 stores one report with UTC times", () => {
    const { app, store } = setup()
    app("POST", "/reports", validReport, { now: NOW, clientIp: IP })
    expect(store.all()).toHaveLength(1)
    expect(store.all()[0]).toMatchObject({
      observedAt: "2026-09-30T12:20:00.000Z",
      receivedAt: "2026-09-30T12:30:00.000Z"
    })
  })

  it.each([undefined, null, [validReport], "report", 25])("RPT-REQ-001 AC4 rejects a body that is not a JSON object: %j", (body) => {
    const { app, store } = setup()
    const res = app("POST", "/reports", body, { now: NOW, clientIp: IP })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: "invalid report", fields: ["body"] })
    expect(store.all()).toHaveLength(0)
  })

  it("RPT-REQ-001 AC3 keeps unknown fields out of the store and the response", () => {
    const { app, store } = setup()
    const res = app("POST", "/reports", { ...validReport, phone: "0812345678", name: "สมชาย" }, { now: NOW, clientIp: IP })
    expect(res.status).toBe(201)
    expect(JSON.stringify([res.body, store.all()])).not.toMatch(/phone|name|0812345678|สมชาย/)
  })

  it("RPT-REQ-004 AC3 stores server time for a report seen up to 2 minutes ahead", () => {
    const { app, store } = setup()
    const res = app("POST", "/reports", { ...validReport, observedAt: "2026-09-30T12:32:00Z" }, { now: NOW, clientIp: IP })
    expect(res.status).toBe(201)
    expect(store.all()[0]?.observedAt).toBe("2026-09-30T12:30:00.000Z")
  })

  it("RPT-REQ-005 AC6 AC7 answers 400 with field names only, never the submitted values", () => {
    const { app, store } = setup()
    const res = app("POST", "/reports", { ...validReport, districtId: "x-marks-the-spot", depthCm: 0 }, { now: NOW, clientIp: IP })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: "invalid report", fields: ["districtId", "depthCm"] })
    expect(store.all()).toHaveLength(0)
  })

  it("RPT-REQ-006 AC1 AC5 stores and returns the masked landmark, and the file never holds the number", () => {
    const dir = mkdtempSync(join(tmpdir(), "flood-reports-"))
    try {
      const path = join(dir, "reports.json")
      const app = createApp({ store: createFileReportStore(path), ipHashSecret: SECRET })
      const res = app("POST", "/reports", { ...validReport, landmark: "หน้าร้านป้าแดง โทร 081-234-5678" }, { now: NOW, clientIp: IP })
      expect(res.status).toBe(201)
      expect(res.body).toMatchObject({ report: { landmark: "หน้าร้านป้าแดง โทร [ปิดเบอร์โทร]" } })
      const file = readFileSync(path, "utf8")
      expect(file).toContain("หน้าร้านป้าแดง โทร [ปิดเบอร์โทร]")
      expect(file).not.toContain("5678")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("RPT-REQ-008 AC1 stores a hash of the address, never the address", () => {
    const dir = mkdtempSync(join(tmpdir(), "flood-reports-"))
    try {
      const path = join(dir, "reports.json")
      const store = createFileReportStore(path)
      createApp({ store, ipHashSecret: SECRET })("POST", "/reports", validReport, { now: NOW, clientIp: IP })
      expect(store.all()[0]?.reporterHash).toMatch(/^[0-9a-f]{64}$/)
      expect(readFileSync(path, "utf8")).not.toContain(IP)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("RPT-REQ-001 AC5 RPT-REQ-008 AC6 keeps the reporter hash and address out of public responses", () => {
    const { app, store } = setup()
    const posted = app("POST", "/reports", validReport, { now: NOW, clientIp: IP })
    const shown = app("GET", "/districts/sai-mai", undefined, { now: NOW })
    const hash = store.all()[0]?.reporterHash ?? "missing"
    for (const text of [JSON.stringify(posted.body), JSON.stringify(shown.body)]) {
      expect(text).not.toContain(hash)
      expect(text).not.toContain("reporterHash")
      expect(text).not.toContain(IP)
    }
  })

  it("RPT-REQ-012 AC4 does not store severity", () => {
    const { app, store } = setup()
    app("POST", "/reports", validReport, { now: NOW, clientIp: IP })
    expect(store.all()[0]).not.toHaveProperty("severity")
  })
})

describe("POST /reports rate limit", () => {
  const at = (iso: string) => ({ now: new Date(iso), clientIp: IP })

  function fillQuota(app: ReturnType<typeof setup>["app"], ctx = { now: NOW, clientIp: IP }) {
    const observedAt = ctx.now.toISOString()
    return Array.from({ length: 5 }, () => app("POST", "/reports", { ...validReport, observedAt }, ctx).status)
  }

  it("RPT-REQ-007 AC1 AC2 answers 429 with Retry-After on the 6th report in an hour", () => {
    const { app, store } = setup()
    expect(fillQuota(app)).toEqual([201, 201, 201, 201, 201])
    const res = app("POST", "/reports", validReport, { now: NOW, clientIp: IP })
    expect(res.status).toBe(429)
    expect(res.body).toEqual({ error: "rate limit exceeded", retryAfterSeconds: 3600 })
    expect(res.headers).toEqual({ "Retry-After": "3600" })
    expect(store.all()).toHaveLength(5)
  })

  it("RPT-REQ-007 AC3 counts each address separately", () => {
    const { app } = setup()
    fillQuota(app)
    expect(app("POST", "/reports", validReport, { now: NOW, clientIp: "203.0.113.11" }).status).toBe(201)
  })

  it("RPT-REQ-007 AC4 frees the quota exactly 60 minutes after the reports were received", () => {
    const { app } = setup()
    fillQuota(app, at("2026-09-30T11:30:00Z"))
    const early = app("POST", "/reports", validReport, at("2026-09-30T12:29:59Z"))
    expect(early.status).toBe(429)
    expect(early.body).toMatchObject({ retryAfterSeconds: 1 })
    expect(app("POST", "/reports", validReport, at("2026-09-30T12:30:00Z")).status).toBe(201)
  })

  it("RPT-REQ-007 AC5 does not count rejected reports", () => {
    const { app } = setup()
    for (let i = 0; i < 10; i++) {
      expect(app("POST", "/reports", { ...validReport, depthCm: 0 }, { now: NOW, clientIp: IP }).status).toBe(400)
    }
    expect(app("POST", "/reports", validReport, { now: NOW, clientIp: IP }).status).toBe(201)
  })

  it("RPT-REQ-007 AC6 answers 429, not 400, for an invalid report once the quota is full", () => {
    const { app } = setup()
    fillQuota(app)
    expect(app("POST", "/reports", { ...validReport, depthCm: 0 }, { now: NOW, clientIp: IP }).status).toBe(429)
  })

  it("RPT-REQ-007 AC8 refuses a report when the client address is unknown", () => {
    const { app, store } = setup()
    const res = app("POST", "/reports", validReport, { now: NOW })
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: "client address unavailable" })
    expect(store.all()).toHaveLength(0)
  })
})

describe("GET /districts/:id reports", () => {
  type DistrictBody = { stations: unknown[]; reports: { label: string; items: Record<string, unknown>[] } }

  it("RPT-REQ-009 AC1 adds an empty reports key and leaves stations as they were", () => {
    const { app } = setup()
    const res = app("GET", "/districts/lat-phrao", undefined, { now: NOW })
    expect(res.body).toEqual({
      notice: NOTICE,
      district: { id: "lat-phrao", nameTh: "ลาดพร้าว", nameEn: "Lat Phrao" },
      stations: [
        { id: "st-ladprao-01", nameTh: "คลองลาดพร้าว (ตัวอย่าง)", latest: { at: "2026-09-30T19:00:00+07:00", levelCm: 104 } }
      ],
      reports: { label: REPORT_LABEL, items: [] }
    })
  })

  it("RPT-REQ-009 AC2 AC7 shows a report in a district with no stations, with only the public keys", () => {
    const { app } = setup()
    app("POST", "/reports", validReport, { now: NOW, clientIp: IP })
    const body = app("GET", "/districts/sai-mai", undefined, { now: NOW }).body as DistrictBody
    expect(body.stations).toEqual([])
    expect(body.reports.items).toEqual([
      {
        landmark: "ปากซอยสายไหม 15",
        depthCm: 25,
        severity: "medium",
        observedAt: "2026-09-30T19:20:00+07:00",
        minutesAgo: 10,
        reporterCount: 1
      }
    ])
  })

  it("RPT-REQ-009 AC3 keeps a report out of other districts", () => {
    const { app } = setup()
    app("POST", "/reports", validReport, { now: NOW, clientIp: IP })
    const body = app("GET", "/districts/lat-phrao", undefined, { now: NOW }).body as DistrictBody
    expect(body.reports.items).toEqual([])
  })

  it("RPT-REQ-009 AC4 never lets a report change a station reading", () => {
    const { app } = setup()
    app("POST", "/reports", { ...validReport, districtId: "lat-phrao", depthCm: 250 }, { now: NOW, clientIp: IP })
    const res = app("GET", "/districts/lat-phrao", undefined, { now: NOW })
    expect(res.body).toMatchObject({ stations: [{ latest: { levelCm: 104 } }] })
  })

  it("RPT-REQ-009 AC5 always carries the unverified label", () => {
    const { app } = setup()
    const body = app("GET", "/districts/sai-mai", undefined, { now: NOW }).body as DistrictBody
    expect(body.reports.items).toEqual([])
    expect(body.reports.label).toContain("รายงานจากประชาชน")
    expect(body.reports.label).toContain("ไม่ใช่ประกาศเตือนภัยทางการ")
  })
})

describe("existing routes", () => {
  it("RPT-REQ-018 AC2 handle still works with a context that only has now", () => {
    const res = handle("GET", "/districts", undefined, { now: NOW })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ notice: NOTICE })
  })
})
