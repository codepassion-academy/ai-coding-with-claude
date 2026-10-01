import { randomBytes } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createApp, handle } from "../src/app.ts"
import { createFileReportStore, createMemoryReportStore, type ReportStore } from "../src/report-store.ts"
import { LOG_FIELD_NAMES } from "../src/report-log.ts"
import { hashReporter } from "../src/reporter.ts"

const NOW = new Date("2026-09-30T12:30:00Z")
const IP = "203.0.113.10"
const SECRET = "test-ip-hash-secret"

const validReport = {
  districtId: "sai-mai",
  landmark: "ปากซอยสายไหม 15",
  depthCm: 25,
  observedAt: "2026-09-30T12:20:00Z"
}

type Line = { event: string; fields: Record<string, unknown> }

function setup(store: ReportStore = createMemoryReportStore()) {
  const lines: Line[] = []
  const app = createApp({ store, ipHashSecret: SECRET, log: (event, fields) => lines.push({ event, fields }) })
  return { app, lines, store }
}

const send = (app: ReturnType<typeof setup>["app"], body: unknown, clientIp = IP) =>
  app("POST", "/reports", body, { now: NOW, clientIp })

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "flood-reports-log-"))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("report log: public events", () => {
  it("RPT-REQ-017 AC1 keeps the landmark, the phone number, the address and the hash out of the log", () => {
    const { app, lines } = setup()
    const res = send(app, { ...validReport, landmark: "บ้านคุณสมชาย 0812345678" })
    expect(res.status).toBe(201)
    const hash = hashReporter(SECRET, IP)
    const everything = JSON.stringify(lines)
    for (const forbidden of ["สมชาย", "0812345678", "ปิดเบอร์โทร", IP, hash, hash.slice(0, 8)]) {
      expect(everything, forbidden).not.toContain(forbidden)
    }
  })

  it("RPT-REQ-017 AC2 logs one report.accepted line whose id matches the response", () => {
    const { app, lines } = setup()
    const res = send(app, validReport)
    const { id } = (res.body as { report: { id: string } }).report
    expect(lines).toEqual([{ event: "report.accepted", fields: { id, districtId: "sai-mai", status: 201 } }])
  })

  it("RPT-REQ-017 AC3 logs report.rejected with the names of the bad fields and none of their values", () => {
    const { app, lines } = setup()
    const res = send(app, { ...validReport, landmark: "xq", depthCm: 987654 })
    expect(res.status).toBe(400)
    expect(lines).toHaveLength(1)
    expect(lines[0]?.event).toBe("report.rejected")
    expect(lines[0]?.fields).toMatchObject({ reason: "validation", status: 400 })
    expect([...((lines[0]?.fields.fields as string[]) ?? [])].sort()).toEqual(["depthCm", "landmark"])
    expect(JSON.stringify(lines)).not.toContain("987654")
    expect(JSON.stringify(lines)).not.toContain("xq")
  })

  it("RPT-REQ-017 AC3 does not log a districtId on a rejected report, because it may be what was wrong", () => {
    const { app, lines } = setup()
    send(app, { ...validReport, districtId: "not-a-district-zz" })
    expect(lines[0]?.fields).not.toHaveProperty("districtId")
    expect(JSON.stringify(lines)).not.toContain("not-a-district-zz")
  })

  it("RPT-REQ-017 AC3 logs a body that is not an object as the field body", () => {
    const { app, lines } = setup()
    send(app, "report")
    expect(lines[0]?.fields).toMatchObject({ reason: "validation", fields: ["body"] })
  })

  it("RPT-REQ-017 AC4 logs report.rejected with reason rate_limit for a 429", () => {
    const { app, lines } = setup()
    for (let i = 0; i < 5; i++) send(app, validReport)
    expect(send(app, validReport).status).toBe(429)
    expect(lines.filter((l) => l.event === "report.accepted")).toHaveLength(5)
    expect(lines.at(-1)).toEqual({ event: "report.rejected", fields: { reason: "rate_limit", status: 429 } })
  })

  it("RPT-REQ-017 logs nothing for a request that is not a report", () => {
    const { app, lines } = setup()
    app("GET", "/districts/sai-mai", undefined, { now: NOW, clientIp: IP })
    app("GET", "/nothing", undefined, { now: NOW, clientIp: IP })
    expect(lines).toEqual([])
  })

  it("RPT-REQ-017 logs nothing when the client address is missing, since nothing was accepted or judged", () => {
    const { app, lines } = setup()
    expect(app("POST", "/reports", validReport, { now: NOW }).status).toBe(500)
    expect(lines).toEqual([])
  })

  it("RPT-REQ-017 only ever puts allowed field names on a line", () => {
    const { app, lines } = setup()
    send(app, validReport)
    send(app, { ...validReport, depthCm: 0 })
    send(app, null)
    for (let i = 0; i < 5; i++) send(app, validReport)
    expect(lines.length).toBeGreaterThan(3)
    for (const line of lines) {
      for (const name of Object.keys(line.fields)) expect(LOG_FIELD_NAMES, `${line.event}.${name}`).toContain(name)
    }
  })

  it("RPT-REQ-017 works without a logger: createApp and the default handle just stay quiet", () => {
    const quiet = createApp({ store: createMemoryReportStore(), ipHashSecret: SECRET })
    expect(quiet("POST", "/reports", validReport, { now: NOW, clientIp: IP }).status).toBe(201)
    expect(handle("POST", "/reports", validReport, { now: NOW, clientIp: IP }).status).toBe(201)
  })

  it("RPT-REQ-006 AC5 leaves 5678 out of both the stored file and the log", () => {
    const path = join(dir, "reports.json")
    const { app, lines } = setup(createFileReportStore(path))
    const res = send(app, { ...validReport, landmark: "หน้าร้านป้าแดง โทร 081-234-5678" })
    expect(res.status).toBe(201)
    expect(readFileSync(path, "utf8")).not.toContain("5678")
    expect(JSON.stringify(lines)).not.toContain("5678")
  })
})

describe("src/server.ts logging", () => {
  const server = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8")

  it("RPT-REQ-017 AC5 does not log the request body or the Authorization header", () => {
    const consoleLines = server.split(/\r?\n/).filter((line) => /console\./.test(line))
    expect(consoleLines.length).toBeGreaterThan(0)
    for (const line of consoleLines) expect(line).not.toMatch(/\b(body|raw|authorization|headers)\b/i)
  })

  it("RPT-REQ-017 hands a logger to createApp", () => {
    expect(server).toMatch(/createApp\(\{[\s\S]*\blog\b[\s\S]*\}\)/)
  })
})

describe("report log: admin events", () => {
  // Made up inside the test; the real token comes from the environment.
  const TOKEN = randomBytes(16).toString("hex")
  const authorized = { now: NOW, clientIp: IP, authorization: `Bearer ${TOKEN}` }

  function setupAdmin() {
    const lines: Line[] = []
    const store = createMemoryReportStore()
    const app = createApp({
      store,
      ipHashSecret: SECRET,
      adminToken: TOKEN,
      log: (event, fields) => lines.push({ event, fields })
    })
    // A report from another address, so the hash and the landmark are in the store but must stay out of the log.
    const created = app("POST", "/reports", { ...validReport, landmark: "บ้านคุณสมชาย" }, { now: NOW, clientIp: "198.51.100.7" })
    const { id } = (created.body as { report: { id: string } }).report
    lines.length = 0
    return { app, lines, id }
  }

  it("RPT-REQ-017 events: hiding logs one report.hidden line whose id matches the response", () => {
    const { app, lines, id } = setupAdmin()
    const res = app("POST", `/admin/reports/${id}/hide`, undefined, authorized)
    expect((res.body as { report: { id: string } }).report.id).toBe(id)
    expect(lines).toEqual([{ event: "report.hidden", fields: { id, districtId: "sai-mai", status: 200 } }])
  })

  it("RPT-REQ-017 events: unhiding logs one report.unhidden line", () => {
    const { app, lines, id } = setupAdmin()
    app("POST", `/admin/reports/${id}/hide`, undefined, authorized)
    lines.length = 0
    app("POST", `/admin/reports/${id}/unhide`, undefined, authorized)
    expect(lines).toEqual([{ event: "report.unhidden", fields: { id, districtId: "sai-mai", status: 200 } }])
  })

  it("RPT-REQ-017 events: repeating hide or unhide changes nothing and logs nothing", () => {
    const { app, lines, id } = setupAdmin()
    app("POST", `/admin/reports/${id}/unhide`, undefined, authorized) // never hidden
    expect(lines).toEqual([])
    app("POST", `/admin/reports/${id}/hide`, undefined, authorized)
    lines.length = 0
    app("POST", `/admin/reports/${id}/hide`, undefined, authorized)
    expect(lines).toEqual([])
  })

  it("RPT-REQ-017 events: an unknown id logs nothing", () => {
    const { app, lines } = setupAdmin()
    expect(app("POST", "/admin/reports/nope/hide", undefined, authorized).status).toBe(404)
    expect(lines).toEqual([])
  })

  it.each([
    ["a wrong token", `Bearer ${randomBytes(16).toString("hex")}`],
    ["no Authorization header", undefined]
  ])("RPT-REQ-017 events: %s logs one admin.auth_failed line with only the status", (_name, authorization) => {
    const { app, lines } = setupAdmin()
    expect(app("GET", "/admin/reports", undefined, { now: NOW, clientIp: IP, authorization }).status).toBe(401)
    expect(lines).toEqual([{ event: "admin.auth_failed", fields: { status: 401 } }])
  })

  it("RPT-REQ-014 AC7 keeps the token that was sent, wrong or right, out of the log", () => {
    const { app, lines } = setupAdmin()
    const wrong = randomBytes(16).toString("hex")
    app("GET", "/admin/reports", undefined, { now: NOW, clientIp: IP, authorization: `Bearer ${wrong}` })
    app("GET", "/admin/reports", undefined, authorized)
    const everything = JSON.stringify(lines)
    expect(lines).toHaveLength(1)
    expect(everything).not.toContain(wrong)
    expect(everything).not.toContain(TOKEN)
    expect(everything).not.toContain("Bearer")
  })

  it("RPT-REQ-017 AC1 keeps the landmark, the addresses and the hashes out of admin lines too", () => {
    const { app, lines, id } = setupAdmin()
    app("POST", `/admin/reports/${id}/hide`, undefined, authorized)
    app("POST", `/admin/reports/${id}/unhide`, undefined, authorized)
    app("GET", "/admin/reports", undefined, { now: NOW, clientIp: IP, authorization: "Bearer nope" })
    const reporter = hashReporter(SECRET, "198.51.100.7")
    const admin = hashReporter(SECRET, IP)
    const everything = JSON.stringify(lines)
    expect(lines).toHaveLength(3)
    for (const forbidden of ["สมชาย", IP, "198.51.100.7", reporter, reporter.slice(0, 8), admin, admin.slice(0, 8)]) {
      expect(everything, forbidden).not.toContain(forbidden)
    }
    for (const line of lines) {
      for (const name of Object.keys(line.fields)) expect(LOG_FIELD_NAMES, `${line.event}.${name}`).toContain(name)
    }
  })

  it("RPT-REQ-017 events: a request blocked for too many failures is not logged (no event exists for it)", () => {
    const { app, lines } = setupAdmin()
    for (let i = 0; i < 10; i++) app("GET", "/admin/reports", undefined, { now: NOW, clientIp: IP, authorization: "Bearer nope" })
    lines.length = 0
    expect(app("GET", "/admin/reports", undefined, authorized).status).toBe(429)
    expect(lines).toEqual([])
  })
})
