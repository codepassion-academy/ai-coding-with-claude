import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { NOTICE } from "../src/app.ts"
import { createAppServer } from "../src/server.ts"

// Only ever talks to servers this file starts on 127.0.0.1 with a random port.
const servers: Server[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((done) => s.close(done))))
})

async function start(options?: Parameters<typeof createAppServer>[1]): Promise<string> {
  const server = createAppServer(undefined, options)
  servers.push(server)
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

describe("web page (GET /)", () => {
  it("serves the map page as HTML with the notice on it", async () => {
    const res = await fetch(`${await start()}/`)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8")
    expect(await res.text()).toContain(NOTICE)
  })

  it("sends a CSP that allows only this site and the pinned CDN, with no inline script", async () => {
    const res = await fetch(`${await start()}/`)
    const csp = res.headers.get("content-security-policy") ?? ""
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self' https://unpkg.com")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).not.toContain("unsafe-inline")
    expect(csp).not.toContain("unsafe-eval")
    expect(res.headers.get("x-content-type-options")).toBe("nosniff")
  })

  it("pins every CDN script and stylesheet to an exact version with an integrity hash", async () => {
    const html = await (await fetch(`${await start()}/`)).text()
    const external = [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="(https:[^"]+)"[^>]*>/g)]
    expect(external.length).toBeGreaterThan(0)
    for (const [tag, url] of external) {
      expect(url, url).toMatch(/@\d+\.\d+\.\d+\//)
      expect(tag, url).toMatch(/integrity="sha384-[A-Za-z0-9+/=]+"/)
      expect(tag, url).toContain("crossorigin=\"anonymous\"")
    }
  })

  it("has no inline script, so the CSP can stay strict", async () => {
    const html = await (await fetch(`${await start()}/`)).text()
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/)
    expect(html).not.toMatch(/\son[a-z]+="/)
  })

  it("serves the page's own script and stylesheet with the right types", async () => {
    const base = await start()
    const js = await fetch(`${base}/app.js`)
    expect(js.status).toBe(200)
    expect(js.headers.get("content-type")).toBe("text/javascript; charset=utf-8")
    const css = await fetch(`${base}/app.css`)
    expect(css.status).toBe(200)
    expect(css.headers.get("content-type")).toBe("text/css; charset=utf-8")
  })

  it("the page script never sets innerHTML, so report text cannot become markup", () => {
    const js = readFileSync(new URL("../public/app.js", import.meta.url), "utf8")
    expect(js).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|setHTML\(|document\.write/)
  })
})

describe("static files are a fixed list", () => {
  it("does not serve anything outside the list, including path tricks", async () => {
    const base = await start()
    for (const path of ["/package.json", "/../package.json", "/%2e%2e/package.json", "/public/app.js", "/index.html", "/app.js/", "/tiles/"]) {
      const res = await fetch(`${base}${path}`)
      expect(res.status, path).toBe(404)
      expect(await res.json(), path).toEqual({ notice: NOTICE, error: "not found" })
    }
  })

  it("only GET is served; POST / goes to the API router and is 404 JSON", async () => {
    const res = await fetch(`${await start()}/`, { method: "POST", body: "{}" })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ notice: NOTICE, error: "not found" })
  })

  it("the API still answers next to the page", async () => {
    const res = await fetch(`${await start()}/districts`)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ notice: NOTICE })
  })
})

describe("map tiles (GET /tiles/bangkok.pmtiles)", () => {
  let dir: string
  const tiles = Buffer.from("PMTiles-fake-archive-0123456789")

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "namtuam-web-"))
    for (const f of ["index.html", "app.js", "app.css"]) writeFileSync(join(dir, f), f)
    mkdirSync(join(dir, "tiles"))
    writeFileSync(join(dir, "tiles", "bangkok.pmtiles"), tiles)
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it("answers a byte range with 206 and exactly those bytes (PMTiles reads by range)", async () => {
    const res = await fetch(`${await start({ publicDir: dir })}/tiles/bangkok.pmtiles`, { headers: { range: "bytes=2-6" } })
    expect(res.status).toBe(206)
    expect(res.headers.get("content-range")).toBe(`bytes 2-6/${tiles.length}`)
    expect(res.headers.get("accept-ranges")).toBe("bytes")
    expect(Buffer.from(await res.arrayBuffer())).toEqual(tiles.subarray(2, 7))
  })

  it("supports an open-ended range and a suffix range", async () => {
    const base = await start({ publicDir: dir })
    const open = await fetch(`${base}/tiles/bangkok.pmtiles`, { headers: { range: "bytes=20-" } })
    expect(Buffer.from(await open.arrayBuffer())).toEqual(tiles.subarray(20))
    const suffix = await fetch(`${base}/tiles/bangkok.pmtiles`, { headers: { range: "bytes=-4" } })
    expect(Buffer.from(await suffix.arrayBuffer())).toEqual(tiles.subarray(tiles.length - 4))
  })

  it("without a range sends the whole file", async () => {
    const res = await fetch(`${await start({ publicDir: dir })}/tiles/bangkok.pmtiles`)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/octet-stream")
    expect(Buffer.from(await res.arrayBuffer())).toEqual(tiles)
  })

  it("an unsatisfiable or malformed range is 416", async () => {
    const base = await start({ publicDir: dir })
    for (const range of [`bytes=${tiles.length}-`, "bytes=9-3", "bytes=abc", "bytes=0-1,4-5"]) {
      const res = await fetch(`${base}/tiles/bangkok.pmtiles`, { headers: { range } })
      expect(res.status, range).toBe(416)
      expect(res.headers.get("content-range"), range).toBe(`bytes */${tiles.length}`)
    }
  })

  it("is 404 with notice when the tiles file has not been downloaded yet", async () => {
    const empty = mkdtempSync(join(tmpdir(), "namtuam-empty-"))
    try {
      const res = await fetch(`${await start({ publicDir: empty })}/tiles/bangkok.pmtiles`)
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ notice: NOTICE, error: "not found" })
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })
})
