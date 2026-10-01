import { randomBytes } from "node:crypto"
import { describe, expect, it } from "vitest"
import { createApp, handle } from "../src/app.ts"
import { createMemoryReportStore } from "../src/report-store.ts"
import type { Report } from "../src/reports.ts"

const NOW = new Date("2026-09-30T12:30:00Z")
const IP = "203.0.113.10"
const OTHER_IP = "203.0.113.11"

// Made up inside the test; the real token comes from the environment.
const TOKEN = randomBytes(16).toString("hex")
const SECRET = "test-ip-hash-secret"

const authorized = { now: NOW, clientIp: IP, authorization: `Bearer ${TOKEN}` }

function report(overrides: Partial<Report> = {}): Report {
  return {
    id: "r-1",
    districtId: "sai-mai",
    landmark: "ปากซอยสายไหม 15",
    landmarkKey: "ปากซอยสายไหม15",
    depthCm: 25,
    observedAt: "2026-09-30T12:20:00.000Z",
    receivedAt: "2026-09-30T12:30:00.000Z",
    reporterHash: "a1b2c3d4".padEnd(64, "e"),
    hiddenAt: null,
    ...overrides
  }
}

/** `adminToken: null` builds an app with no admin token at all (an omitted argument means TOKEN). */
function setup(adminToken: string | null = TOKEN, reports: Report[] = []) {
  const store = createMemoryReportStore()
  for (const r of reports) store.add(r)
  const app = createApp({ store, ipHashSecret: SECRET, adminToken: adminToken ?? undefined })
  return { store, app }
}

describe("admin gate", () => {
  it("RPT-REQ-014 AC1 answers 401 with WWW-Authenticate when there is no Authorization header", () => {
    const { app } = setup()
    const res = app("GET", "/admin/reports", undefined, { now: NOW, clientIp: IP })
    expect(res.status).toBe(401)
    expect(res.headers).toMatchObject({ "WWW-Authenticate": "Bearer" })
  })

  it.each([
    ["a wrong token", `Bearer ${randomBytes(16).toString("hex")}`],
    ["the right token without the word Bearer", TOKEN],
    ["a prefix of the real token", `Bearer ${TOKEN.slice(0, 20)}`]
  ])("RPT-REQ-014 AC2 answers 401 for %s", (_name, authorization) => {
    const { app } = setup()
    expect(app("GET", "/admin/reports", undefined, { now: NOW, clientIp: IP, authorization }).status).toBe(401)
  })

  it("RPT-REQ-014 AC3 answers 200 for the right token", () => {
    const { app } = setup()
    expect(app("GET", "/admin/reports", undefined, authorized).status).toBe(200)
  })

  it.each([
    ["no admin token is set", null],
    ["the admin token is 15 characters", "x".repeat(15)]
  ])("RPT-REQ-014 AC4 closes every /admin/ route when %s, even for a matching token", (_name, adminToken) => {
    const { app } = setup(adminToken)
    const ctx = { now: NOW, clientIp: IP, authorization: `Bearer ${adminToken ?? TOKEN}` }
    for (const [method, path] of [
      ["GET", "/admin/reports"],
      ["POST", "/admin/reports/r-1/hide"],
      ["POST", "/admin/reports/r-1/unhide"],
      ["GET", "/admin/anything"]
    ] as const) {
      const res = app(method, path, undefined, ctx)
      expect(res.status, `${method} ${path}`).toBe(503)
      expect(res.body).toEqual({ error: "admin disabled" })
    }
  })

  it("RPT-REQ-014 AC4 keeps the default handle closed to /admin/", () => {
    expect(handle("GET", "/admin/reports", undefined, authorized).status).toBe(503)
  })

  it("RPT-REQ-014 AC4 accepts a token of exactly 16 characters", () => {
    const token = "x".repeat(16)
    const { app } = setup(token)
    const res = app("GET", "/admin/reports", undefined, { now: NOW, clientIp: IP, authorization: `Bearer ${token}` })
    expect(res.status).toBe(200)
  })

  it("RPT-REQ-014 AC5 limits an address to 10 failed attempts per 15 minutes, even with the right token", () => {
    const { app } = setup()
    for (let i = 0; i < 10; i++) {
      expect(app("GET", "/admin/reports", undefined, { now: NOW, clientIp: IP, authorization: "Bearer nope" }).status).toBe(401)
    }
    const res = app("GET", "/admin/reports", undefined, authorized)
    expect(res.status).toBe(429)
    expect(res.body).toEqual({ error: "rate limit exceeded", retryAfterSeconds: 900 })
    expect(res.headers).toMatchObject({ "Retry-After": "900" })
  })

  it("RPT-REQ-014 AC5 does not affect another address", () => {
    const { app } = setup()
    for (let i = 0; i < 11; i++) app("GET", "/admin/reports", undefined, { now: NOW, clientIp: IP, authorization: "Bearer nope" })
    expect(app("GET", "/admin/reports", undefined, { ...authorized, clientIp: OTHER_IP }).status).toBe(200)
  })

  it("RPT-REQ-014 AC5 lets the address back in after 15 minutes", () => {
    const { app } = setup()
    for (let i = 0; i < 10; i++) app("GET", "/admin/reports", undefined, { now: NOW, clientIp: IP, authorization: "Bearer nope" })
    const later = new Date(NOW.getTime() + 15 * 60_000)
    expect(app("GET", "/admin/reports", undefined, { ...authorized, now: later }).status).toBe(200)
  })

  it("RPT-REQ-014 AC5 does not count successful requests", () => {
    const { app } = setup()
    for (let i = 0; i < 20; i++) expect(app("GET", "/admin/reports", undefined, authorized).status).toBe(200)
  })

  it("RPT-REQ-014 AC5 answers 500 when the client address is missing, because failures cannot be limited", () => {
    const { app } = setup()
    const res = app("GET", "/admin/reports", undefined, { now: NOW, authorization: `Bearer ${TOKEN}` })
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: "client address unavailable" })
  })

  it("RPT-REQ-014 AC8 answers the same 401 whether or not the report id exists", () => {
    const { app } = setup(TOKEN, [report({ id: "r-1" })])
    const ctx = { now: NOW, clientIp: IP }
    const known = app("POST", "/admin/reports/r-1/hide", undefined, ctx)
    const unknown = app("POST", "/admin/reports/nope/hide", undefined, ctx)
    expect(known.status).toBe(401)
    expect(unknown).toEqual(known)
  })

  it("RPT-REQ-014 AC8 answers 401, not 404, for an unknown /admin/ path before authentication", () => {
    const { app } = setup()
    expect(app("GET", "/admin/nothing", undefined, { now: NOW, clientIp: IP }).status).toBe(401)
    expect(app("GET", "/admin/nothing", undefined, authorized).status).toBe(404)
  })
})

describe("GET /admin/reports", () => {
  it("RPT-REQ-013 AC6 lists reports received in the last 24 hours, newest received first", () => {
    const { app } = setup(TOKEN, [
      report({ id: "edge-out", receivedAt: "2026-09-29T12:30:00.000Z" }),
      report({ id: "edge-in", receivedAt: "2026-09-29T12:30:01.000Z" }),
      report({ id: "recent", receivedAt: "2026-09-30T12:00:00.000Z" }),
      report({ id: "oldest-in-day", receivedAt: "2026-09-29T20:00:00.000Z" })
    ])
    const res = app("GET", "/admin/reports", undefined, authorized)
    const ids = (res.body as { reports: { id: string }[] }).reports.map((r) => r.id)
    expect(ids).toEqual(["recent", "oldest-in-day", "edge-in"])
  })

  it("RPT-REQ-013 AC6 lists hidden reports too, and reports whose observation is older than the public window", () => {
    const { app } = setup(TOKEN, [
      report({ id: "hidden", hiddenAt: "2026-09-30T12:10:00.000Z" }),
      report({ id: "stale", observedAt: "2026-09-30T01:00:00.000Z", receivedAt: "2026-09-30T02:00:00.000Z" })
    ])
    const res = app("GET", "/admin/reports", undefined, authorized)
    expect((res.body as { reports: { id: string }[] }).reports.map((r) => r.id).sort()).toEqual(["hidden", "stale"])
  })

  it("RPT-REQ-013 AC7 gives each item exactly the documented keys, with times in Bangkok time", () => {
    const { app } = setup(TOKEN, [report({ hiddenAt: "2026-09-30T12:10:00.000Z" })])
    const res = app("GET", "/admin/reports", undefined, authorized)
    const [item] = (res.body as { reports: Record<string, unknown>[] }).reports
    expect(Object.keys(item ?? {}).sort()).toEqual(
      ["depthCm", "districtId", "hiddenAt", "id", "landmark", "observedAt", "receivedAt", "reporterRef"].sort()
    )
    expect(item).toMatchObject({
      id: "r-1",
      districtId: "sai-mai",
      landmark: "ปากซอยสายไหม 15",
      depthCm: 25,
      observedAt: "2026-09-30T19:20:00+07:00",
      receivedAt: "2026-09-30T19:30:00+07:00",
      hiddenAt: "2026-09-30T19:10:00+07:00"
    })
  })

  it("RPT-REQ-013 AC7 shows hiddenAt as null for a report that is not hidden", () => {
    const { app } = setup(TOKEN, [report()])
    const res = app("GET", "/admin/reports", undefined, authorized)
    expect((res.body as { reports: { hiddenAt: unknown }[] }).reports[0]?.hiddenAt).toBeNull()
  })

  it("RPT-REQ-013 AC7 shows reporterRef as the first 8 characters of the hash, never the full hash", () => {
    const stored = report()
    const { app } = setup(TOKEN, [stored])
    const res = app("GET", "/admin/reports", undefined, authorized)
    expect((res.body as { reports: { reporterRef: unknown }[] }).reports[0]?.reporterRef).toBe("a1b2c3d4")
    expect(JSON.stringify(res.body)).not.toContain(stored.reporterHash ?? "")
  })

  it("RPT-REQ-013 AC7 shows reporterRef as null when the hash has been cleared", () => {
    const { app } = setup(TOKEN, [report({ reporterHash: null })])
    const res = app("GET", "/admin/reports", undefined, authorized)
    expect((res.body as { reports: { reporterRef: unknown }[] }).reports[0]?.reporterRef).toBeNull()
  })

  it("RPT-REQ-013 AC7 never contains the address a report was sent from", () => {
    const { app } = setup()
    app("POST", "/reports", { districtId: "sai-mai", landmark: "ปากซอยสายไหม 15", depthCm: 25, observedAt: "2026-09-30T12:20:00Z" }, { now: NOW, clientIp: IP })
    const res = app("GET", "/admin/reports", undefined, authorized)
    expect((res.body as { reports: unknown[] }).reports).toHaveLength(1)
    expect(JSON.stringify(res.body)).not.toContain(IP)
  })
})
