import { describe, expect, it } from "vitest"
import { createApp, handle, NOTICE } from "../src/app.ts"
import { createMemoryReportStore } from "../src/report-store.ts"
import { REPORT_LABEL } from "../src/reports.ts"

const NOW = new Date("2026-09-30T12:30:00Z")
const IP = "203.0.113.10"

const validReport = {
  districtId: "sai-mai",
  landmark: "ปากซอยสายไหม 15",
  depthCm: 25,
  observedAt: "2026-09-30T12:20:00Z"
}

function setup() {
  const store = createMemoryReportStore()
  const app = createApp({ store })
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

  it("RPT-REQ-012 AC4 does not store severity", () => {
    const { app, store } = setup()
    app("POST", "/reports", validReport, { now: NOW, clientIp: IP })
    expect(store.all()[0]).not.toHaveProperty("severity")
  })
})

describe("existing routes", () => {
  it("RPT-REQ-018 AC2 handle still works with a context that only has now", () => {
    const res = handle("GET", "/districts", undefined, { now: NOW })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ notice: NOTICE })
  })
})
