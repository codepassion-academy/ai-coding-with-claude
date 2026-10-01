import fs from "node:fs"
import { syncBuiltinESMExports } from "node:module"
import http from "node:http"
import https from "node:https"
import type { AddressInfo } from "node:net"
import { afterEach, describe, expect, it, vi } from "vitest"
import { handle, NOTICE } from "../src/app.ts"
import { createRateLimiter } from "../src/rate-limit.ts"
import { createReportStore, MAX_ACTIVE_REPORTS, RATE_LIMIT_MAX } from "../src/reports.ts"
import { createAppServer, type Handler } from "../src/server.ts"

const IP = "203.0.113.7"
// Over HTTP the key the server really uses is the socket address of the test client.
const SOCKET_IP = "127.0.0.1"
const LANDMARK = "หน้าร้านป้าแดง"
const PHONE = "0812345678"
const now = new Date("2026-09-30T12:30:00Z")
const seenAt = "2026-09-30T12:00:00Z"

afterEach(() => {
  vi.restoreAllMocks()
  syncBuiltinESMExports()
})

/**
 * vi.spyOn patches the default-export object of a builtin. syncBuiltinESMExports copies that onto
 * the named exports too, so `import { writeFileSync } from "node:fs"` in app code is caught as well.
 */
function spyBuiltin<T extends object>(target: T, method: keyof T & string) {
  const spy = vi.spyOn(target, method as never)
  syncBuiltinESMExports()
  return spy
}

/** Every handle() flow: success, merge, each 400, 404, 429, 503 and both GETs. */
function runHandleFlows() {
  const ctx = { now, clientKey: IP, reports: createReportStore() }
  const url = "/districts/lat-phrao/reports"
  const valid = { landmark: `${LANDMARK} โทร ${PHONE}`, depth: "knee", seenAt }
  const bodies: unknown[] = [
    valid,
    valid,
    null,
    [valid],
    { ...valid, phone: PHONE },
    { ...valid, landmark: PHONE },
    { ...valid, landmark: `${LANDMARK}\n${PHONE}` },
    { ...valid, depth: "chest" },
    { ...valid, seenAt: "yesterday" },
    { ...valid, seenAt: "2026-09-30T13:00:00Z" },
    { ...valid, seenAt: "2026-09-30T08:00:00Z" }
  ]
  const outputs: unknown[] = bodies.map((b) => handle("POST", url, b, ctx))
  outputs.push(handle("POST", "/districts/atlantis/reports", valid, ctx))
  for (let i = 0; i < RATE_LIMIT_MAX; i++) outputs.push(handle("POST", url, { ...valid, landmark: `${LANDMARK} ${i}` }, ctx))
  outputs.push(handle("GET", "/districts/lat-phrao", undefined, ctx))
  outputs.push(handle("GET", "/nope", undefined, ctx))

  // 503 store_full, with the same personal data in the rejected report.
  const full = { now, reports: createReportStore(createRateLimiter(MAX_ACTIVE_REPORTS + 10)), clientKey: IP }
  for (let i = 0; i < MAX_ACTIVE_REPORTS; i++) handle("POST", "/districts/bang-na/reports", { ...valid, landmark: `จุด ${i}` }, full)
  const rejected = handle("POST", url, valid, full)
  if (rejected.status !== 503) throw new Error(`expected 503, got ${rejected.status}`)
  outputs.push(rejected)

  // The store keys reports by P-code; "lat-phrao" in the URL is the old slug alias for TH1038.
  return { outputs, stored: ctx.reports.activeIn("TH1038", now) }
}

async function runServerFlows() {
  const reports = createReportStore()
  let posts = 0
  const handler: Handler = (method, path, body, ctx) => {
    // The second POST that reaches the handler blows up, with personal data in the error.
    if (method === "POST" && ++posts === 2) throw new Error(`boom ${ctx.clientKey} ${IP} ${LANDMARK} ${PHONE}`)
    return handle(method, path, body, { ...ctx, reports })
  }
  const server = createAppServer(handler)
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const post = (body: string, headers: Record<string, string> = {}) =>
    fetch(`${base}/districts/lat-phrao/reports`, { method: "POST", body, headers: { "x-forwarded-for": IP, ...headers } })
  const report = JSON.stringify({ landmark: `${LANDMARK} ${PHONE}`, depth: "knee", seenAt: new Date().toISOString() })
  try {
    const statuses = [
      (await post(report)).status, // 201
      (await post(`{"landmark": "${LANDMARK} ${PHONE}"`)).status, // 400 invalid JSON, never reaches the handler
      (await post(report)).status, // 500: second POST into the handler
      (await post(JSON.stringify({ landmark: `${LANDMARK} ${PHONE}`.repeat(200) }))).status, // 413
      (await fetch(`${base}/districts/lat-phrao`)).status // 200
    ]
    if (statuses.join() !== "201,400,500,413,200") throw new Error(`unexpected flow: ${statuses.join()}`)
  } finally {
    await new Promise((done) => server.close(done))
  }
}

describe("no personal data in logs (RPT-REQ-013 AC1)", () => {
  it("console and stdout/stderr never see the IP, the landmark text or the phone", async () => {
    const written: unknown[] = []
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => void written.push(args))
    }
    for (const stream of [process.stdout, process.stderr]) {
      vi.spyOn(stream, "write").mockImplementation((chunk: unknown) => {
        written.push(String(chunk))
        return true
      })
    }

    runHandleFlows()
    await runServerFlows()

    const text = JSON.stringify(written)
    expect(text).not.toContain(IP)
    expect(text).not.toContain(SOCKET_IP)
    expect(text).not.toContain(LANDMARK)
    expect(text).not.toContain(PHONE)
  })
})

describe("stored and returned data (RPT-REQ-013 AC2)", () => {
  it("a stored report has exactly the §3.1 fields", () => {
    const { stored } = runHandleFlows()
    expect(stored.length).toBeGreaterThan(0)
    for (const report of stored) {
      expect(Object.keys(report).sort()).toEqual(
        ["confirmations", "depthCm", "depthLevel", "districtId", "id", "kind", "landmark", "landmarkKey", "seenAt"].sort()
      )
    }
  })

  it("no response or stored report holds the IP or the raw phone", () => {
    const { outputs, stored } = runHandleFlows()
    const text = JSON.stringify([outputs, stored])
    expect(text).not.toContain(IP)
    expect(text).not.toContain(PHONE)
    expect(text).toContain(NOTICE)
  })
})

describe("no outside network and no files (RPT-REQ-017 AC2, RPT-REQ-012 AC4)", () => {
  it("never calls fetch or http(s).request to anywhere but the local test server, and never writes a file", async () => {
    const realFetch = globalThis.fetch
    const fetched: string[] = []
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      fetched.push(String(input instanceof Request ? input.url : input))
      return realFetch(input, init)
    })
    const httpRequest = spyBuiltin(http, "request")
    const httpGet = spyBuiltin(http, "get")
    const httpsRequest = spyBuiltin(https, "request")
    const httpsGet = spyBuiltin(https, "get")
    const writes = (["writeFile", "writeFileSync", "appendFile", "appendFileSync", "createWriteStream"] as const).map((m) =>
      spyBuiltin(fs, m)
    )
    const promiseWrites = (["writeFile", "appendFile"] as const).map((m) => spyBuiltin(fs.promises, m))

    runHandleFlows()
    await runServerFlows()

    // The only fetch calls are the test's own requests to 127.0.0.1.
    expect(fetched.length).toBeGreaterThan(0)
    expect(fetched.filter((u) => !u.startsWith("http://127.0.0.1:"))).toEqual([])
    for (const spy of [httpRequest, httpGet, httpsRequest, httpsGet, ...writes, ...promiseWrites]) {
      expect(spy).not.toHaveBeenCalled()
    }
  })
})
