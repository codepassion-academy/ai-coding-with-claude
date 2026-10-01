import { describe, expect, it, vi } from "vitest"
import { createReportStore, MAX_BODY_BYTES } from "../src/reports.ts"
import { createRateLimiter } from "../src/rate-limit.ts"
import { ReportsObject, type SqlStorage } from "../src/reports-object.ts"
import { clientKeyFromRequest, handleRequest, type Env } from "../src/worker.ts"

const NOW = new Date("2026-10-01T03:00:00Z")
const SEEN = "2026-10-01T09:30:00+07:00"
const IP = "203.0.113.7"
const SECRET = "test-secret"
const TILE = new Uint8Array(1000).map((_, i) => i % 256)

/** Just the two statements ReportsObject runs, so the snapshot row can be inspected and reused. */
function fakeSql(): SqlStorage & { data?: string } {
  const sql: SqlStorage & { data?: string } = {
    exec(query, ...bindings) {
      if (query.startsWith("SELECT")) return { toArray: () => (sql.data === undefined ? [] : [{ data: sql.data }]) }
      if (query.startsWith("INSERT")) sql.data = String(bindings[0])
      return { toArray: () => [] }
    }
  }
  return sql
}

/** Bindings in memory: assets from a map, tiles from one byte array, one ReportsObject per fake namespace. */
function fakeEnv(sql = fakeSql(), assets: Record<string, string> = { "/index.html": "<html>", "/app.js": "js" }): Env & { sql: typeof sql } {
  let object: ReportsObject | undefined
  return {
    sql,
    CLIENT_KEY_SECRET: SECRET,
    ASSETS: {
      async fetch(request) {
        const path = new URL(request.url).pathname
        return path in assets ? new Response(assets[path]) : new Response("nope", { status: 404 })
      }
    },
    TILES: {
      async head(key) {
        return key === "bangkok.pmtiles" ? { size: TILE.length } : null
      },
      async get(key, options) {
        if (key !== "bangkok.pmtiles") return null
        const bytes = options ? TILE.slice(options.range.offset, options.range.offset + options.range.length) : TILE
        return { body: new Response(bytes).body! }
      }
    },
    REPORTS: {
      idFromName: (name) => name,
      get: () => ({
        fetch: (request) => {
          object ??= new ReportsObject({ storage: { sql } }, {})
          return object.fetch(request)
        }
      })
    }
  }
}

function post(path: string, body: unknown, headers: Record<string, string> = { "cf-connecting-ip": IP }): Request {
  return new Request("https://namthuam.example" + path, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) })
}

const report = (landmark: string) => ({ landmark, depth: "knee", seenAt: SEEN })

describe("Worker static files (ADR 0003)", () => {
  it("serves listed files from Static Assets with the same headers as the node server", async () => {
    const res = await handleRequest(new Request("https://namthuam.example/"), fakeEnv(), () => NOW)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe("<html>")
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'")
    expect(res.headers.get("referrer-policy")).toBe("no-referrer")
  })

  it("never serves an unlisted path, even when the asset exists", async () => {
    for (const path of ["/index.html", "/package.json", "/%2e%2e/package.json", "/vendor/SHA256SUMS"]) {
      const res = await handleRequest(new Request("https://namthuam.example" + path), fakeEnv(), () => NOW)
      expect(res.status, path).toBe(404)
      expect((await res.json()) as object, path).toHaveProperty("notice")
    }
  })

  it("serves tiles from R2 with byte ranges", async () => {
    const env = fakeEnv()
    const ranged = await handleRequest(new Request("https://namthuam.example/tiles/bangkok.pmtiles", { headers: { range: "bytes=10-19" } }), env, () => NOW)
    expect(ranged.status).toBe(206)
    expect(ranged.headers.get("content-range")).toBe("bytes 10-19/1000")
    expect([...new Uint8Array(await ranged.arrayBuffer())]).toEqual([...TILE.slice(10, 20)])

    const bad = await handleRequest(new Request("https://namthuam.example/tiles/bangkok.pmtiles", { headers: { range: "bytes=5000-" } }), env, () => NOW)
    expect(bad.status).toBe(416)
    expect(bad.headers.get("content-range")).toBe("bytes */1000")

    const whole = await handleRequest(new Request("https://namthuam.example/tiles/bangkok.pmtiles"), env, () => NOW)
    expect(whole.status).toBe(200)
    expect(whole.headers.get("accept-ranges")).toBe("bytes")

    const missing = await handleRequest(new Request("https://namthuam.example/tiles/thailand.pmtiles"), env, () => NOW)
    expect(missing.status).toBe(404)
  })
})

describe("Worker API (ADR 0003)", () => {
  it("routes the API through the Durable Object and keeps NOTICE", async () => {
    const env = fakeEnv()
    const created = await handleRequest(post("/districts/lat-phrao/reports", report("ปากซอยลาดพร้าว 71")), env, () => NOW)
    expect(created.status).toBe(201)
    const district = (await (await handleRequest(new Request("https://namthuam.example/districts/lat-phrao"), env, () => NOW)).json()) as {
      notice: string
      userReports: unknown[]
    }
    expect(district.notice).toBeTruthy()
    expect(district.userReports).toHaveLength(1)
  })

  it("returns the fixed 400, 413 and 500 bodies like the node server", async () => {
    const env = fakeEnv()
    const bad = await handleRequest(post("/districts/lat-phrao/reports", "{bad"), env, () => NOW)
    expect(bad.status).toBe(400)
    expect(await bad.json()).toMatchObject({ error: "invalid JSON" })

    const big = await handleRequest(post("/districts/lat-phrao/reports", "a".repeat(MAX_BODY_BYTES + 1)), env, () => NOW)
    expect(big.status).toBe(413)
    expect(await big.json()).toMatchObject({ error: "payload_too_large" })

    const broken = { ...env, CLIENT_KEY_SECRET: undefined }
    const read = await handleRequest(new Request("https://namthuam.example/districts/lat-phrao", { headers: { "cf-connecting-ip": IP } }), broken, () => NOW)
    expect(read.status, "reads work without the secret").toBe(200)
    const internal = await handleRequest(post("/districts/lat-phrao/reports", report("ซอยหนึ่ง")), broken, () => NOW)
    expect(internal.status).toBe(500)
    expect(await internal.json()).toMatchObject({ error: "internal" })
  })

  it("keys the quota on CF-Connecting-IP only, never X-Forwarded-For (RPT-REQ-009)", async () => {
    const env = fakeEnv()
    const statuses: number[] = []
    for (let i = 0; i < 6; i++) {
      const req = post("/districts/lat-phrao/reports", report(`ซอยที่ ${i}`), { "cf-connecting-ip": IP, "x-forwarded-for": `10.0.0.${i}` })
      statuses.push((await handleRequest(req, env, () => NOW)).status)
    }
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429])
    const other = await handleRequest(post("/districts/lat-phrao/reports", report("ซอยอื่น"), { "cf-connecting-ip": "198.51.100.9" }), env, () => NOW)
    expect(other.status).toBe(201)
  })

  it("stores only an HMAC of the client key, never the IP", async () => {
    const env = fakeEnv()
    const log = vi.spyOn(console, "log")
    await handleRequest(post("/districts/lat-phrao/reports", report("ซอยหนึ่ง")), env, () => NOW)
    expect(env.sql.data).toBeDefined()
    expect(env.sql.data).not.toContain(IP)
    expect(env.sql.data).toContain(await clientKeyFromRequest(post("/", {}), SECRET))
    expect(JSON.stringify(log.mock.calls)).not.toContain(IP)
    log.mockRestore()
  })

  it("keeps reports and quota when the Durable Object starts again", async () => {
    const sql = fakeSql()
    for (let i = 0; i < 5; i++) await handleRequest(post("/districts/lat-phrao/reports", report(`ซอยที่ ${i}`)), fakeEnv(sql), () => NOW)
    const restarted = fakeEnv(sql)
    const district = (await (await handleRequest(new Request("https://namthuam.example/districts/lat-phrao"), restarted, () => NOW)).json()) as {
      userReports: { seenAt: string }[]
    }
    expect(district.userReports).toHaveLength(5)
    expect(district.userReports[0]?.seenAt).toBe(SEEN)
    expect((await handleRequest(post("/districts/lat-phrao/reports", report("ซอยใหม่")), restarted, () => NOW)).status).toBe(429)
  })
})

describe("store snapshot (ADR 0003)", () => {
  it("round-trips reports and limiter, and a full store fits in one Durable Object row (2 MB)", () => {
    const store = createReportStore(createRateLimiter(10_000))
    for (let i = 0; i < 1000; i++) store.submit(report(`ซอยทดสอบยาวพอสมควร หมายเลข ${i} ใกล้ตลาดสด`), "TH1038", `h:${i % 500}`, NOW)
    const json = JSON.stringify(store.snapshot())
    expect(new TextEncoder().encode(json).length).toBeLessThan(2_000_000)

    const restored = createReportStore(undefined, JSON.parse(json))
    expect(restored.size()).toBe(1000)
    expect(restored.activeIn("TH1038", NOW)[0]?.seenAt).toBeInstanceOf(Date)
    expect(restored.snapshot().limiter).toEqual(store.snapshot().limiter)
  })
})
