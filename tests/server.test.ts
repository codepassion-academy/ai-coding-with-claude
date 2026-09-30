import { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { afterEach, describe, expect, it, vi } from "vitest"
import { handle, NOTICE } from "../src/app.ts"
import { createReportStore, RATE_LIMIT_MAX } from "../src/reports.ts"
import { createAppServer, type Handler } from "../src/server.ts"

// Only ever talks to a server this file starts on 127.0.0.1 with a random port.
const servers: Server[] = []

async function start(handler?: Handler): Promise<string> {
  const server = createAppServer(handler)
  servers.push(server)
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done))
  const { port } = server.address() as AddressInfo
  return `http://127.0.0.1:${port}`
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((done) => s.close(done))))
  vi.restoreAllMocks()
})

/** Real handle() with its own store per server, so tests never share reports or quota. */
function isolated(): Handler {
  const reports = createReportStore()
  return (method, path, body, ctx) => handle(method, path, body, { ...ctx, reports })
}

const report = (i: number) =>
  JSON.stringify({ landmark: `ปากซอย ${i}`, depth: "knee", seenAt: new Date().toISOString() })

describe("server module", () => {
  it("does not listen just because it was imported", async () => {
    const listen = vi.spyOn(Server.prototype, "listen")
    vi.resetModules()
    await import("../src/server.ts")
    expect(listen).not.toHaveBeenCalled()
  })
})

describe("notice on every response (RPT-REQ-016)", () => {
  it("AC3: GET unknown district and unknown route are 404 with notice and the old error", async () => {
    const base = await start(isolated())
    const district = await fetch(`${base}/districts/atlantis`)
    expect(district.status).toBe(404)
    expect(await district.json()).toEqual({ notice: NOTICE, error: "unknown district" })
    const route = await fetch(`${base}/nope`)
    expect(route.status).toBe(404)
    expect(await route.json()).toEqual({ notice: NOTICE, error: "not found" })
  })

  it("AC2 / RPT-REQ-013 AC3: invalid JSON is a fixed 400 with notice and no parser message", async () => {
    const base = await start(isolated())
    const res = await fetch(`${base}/districts/lat-phrao/reports`, { method: "POST", body: "{landmark: 081-234-5678" })
    expect(res.status).toBe(400)
    expect(res.headers.get("content-type")).toContain("application/json")
    expect(await res.json()).toEqual({ notice: NOTICE, error: "invalid JSON" })
  })

  it("AC1: POST 201, 200, 400, 404 and 429 all carry notice over HTTP", async () => {
    const base = await start(isolated())
    const post = (path: string, body: string) => fetch(`${base}${path}`, { method: "POST", body })
    const bodies: unknown[] = []
    for (let i = 0; i < RATE_LIMIT_MAX - 1; i++) bodies.push(await (await post("/districts/lat-phrao/reports", report(i))).json())
    bodies.push(await (await post("/districts/lat-phrao/reports", report(0))).json()) // 200 merged
    bodies.push(await (await post("/districts/lat-phrao/reports", JSON.stringify({ depth: "knee" }))).json()) // 400
    bodies.push(await (await post("/districts/atlantis/reports", report(9))).json()) // 404
    bodies.push(await (await post("/districts/lat-phrao/reports", report(9))).json()) // 429
    for (const body of bodies) expect(body).toMatchObject({ notice: NOTICE })
  })
})

describe("unexpected errors (RPT-REQ-015)", () => {
  it("AC1-2: a throwing handler gives a fixed 500 with notice, no message, and the server keeps serving", async () => {
    let calls = 0
    const base = await start((method, path, body, ctx) => {
      calls += 1
      if (calls === 1) throw new Error("secret 0812345678 at /Users/someone/store.ts:42")
      return handle(method, path, body, ctx)
    })
    const failed = await fetch(`${base}/districts`)
    expect(failed.status).toBe(500)
    const text = await failed.text()
    expect(JSON.parse(text)).toEqual({ notice: NOTICE, error: "internal" })
    expect(text).not.toMatch(/secret|0812345678|store\.ts/)

    const next = await fetch(`${base}/districts`)
    expect(next.status).toBe(200)
  })

  it("AC2 / RPT-REQ-013: the error is not written to the console", async () => {
    const spies = (["log", "info", "warn", "error"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
    const base = await start(() => {
      throw new Error("secret 0812345678")
    })
    await fetch(`${base}/districts`)
    for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toMatch(/secret|0812345678/)
  })
})

describe("client key comes from the socket only (RPT-REQ-009 AC3 / E15)", () => {
  it("different X-Forwarded-For headers share one quota; the 6th is 429 with Retry-After", async () => {
    const base = await start(isolated())
    const statuses: number[] = []
    let last: Response | undefined
    for (let i = 0; i <= RATE_LIMIT_MAX; i++) {
      last = await fetch(`${base}/districts/lat-phrao/reports`, {
        method: "POST",
        headers: { "x-forwarded-for": `10.0.0.${i}`, forwarded: `for=10.0.1.${i}` },
        body: report(i)
      })
      statuses.push(last.status)
    }
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429])
    const retryAfter = Number(last?.headers.get("retry-after"))
    expect(Number.isInteger(retryAfter) && retryAfter >= 1).toBe(true)
    expect(await last?.json()).toEqual({ notice: NOTICE, error: "rate_limited", retryAfterSec: retryAfter })
  })

  it("passes the normalized socket address, not a header, to handle()", async () => {
    const keys: (string | undefined)[] = []
    const inner = isolated()
    const base = await start((method, path, body, ctx) => {
      keys.push(ctx.clientKey)
      return inner(method, path, body, ctx)
    })
    await fetch(`${base}/districts`, { headers: { "x-forwarded-for": "203.0.113.7" } })
    expect(keys).toEqual(["127.0.0.1"])
  })
})
