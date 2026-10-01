import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { runInNewContext } from "node:vm"
import { join } from "node:path"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { NOTICE } from "../src/app.ts"
import { districts } from "../src/districts.ts"
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

  it("sends a CSP that allows only this site, with no inline script", async () => {
    const res = await fetch(`${await start()}/`)
    const csp = res.headers.get("content-security-policy") ?? ""
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self';")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).not.toContain("unsafe-inline")
    expect(csp).not.toContain("unsafe-eval")
    expect(res.headers.get("x-content-type-options")).toBe("nosniff")
  })

  it("loads every script and stylesheet from this site (pinned in public/vendor/SHA256SUMS)", async () => {
    const html = await (await fetch(`${await start()}/`)).text()
    const assets = [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"[^>]*>/g)].map((m) => m[1] ?? "")
    expect(assets).toContain("/vendor/maplibre-gl.js")
    for (const url of assets) expect(url, url).toMatch(/^\/(?!\/)/)
  })

  it("has no inline script or inline style, so the CSP can stay strict", async () => {
    const html = await (await fetch(`${await start()}/`)).text()
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/)
    expect(html).not.toMatch(/\son[a-z]+="/)
    // The CSP has no 'unsafe-inline' for styles, so a style attribute would be silently dropped.
    expect(html).not.toMatch(/\sstyle="/)
  })

  it("serves Noto Sans Thai from this site, and the CSP allows fonts only from here", async () => {
    const base = await start()
    for (const file of ["noto-sans-thai-thai.woff2", "noto-sans-thai-latin.woff2"]) {
      const res = await fetch(`${base}/fonts/${file}`)
      expect(res.status, file).toBe(200)
      expect(res.headers.get("content-type"), file).toBe("font/woff2")
      expect(Buffer.from(await res.arrayBuffer()).subarray(0, 4).toString(), file).toBe("wOF2")
    }
    const csp = (await fetch(`${base}/`)).headers.get("content-security-policy") ?? ""
    expect(csp).toContain("font-src 'self'")
    const css = await (await fetch(`${base}/app.css`)).text()
    expect(css).toContain("/fonts/noto-sans-thai-thai.woff2")
    expect(css).toMatch(/font-family:\s*"Noto Sans Thai"/)
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

  it("the page scripts never set innerHTML, so report text cannot become markup", () => {
    for (const file of ["app.js", "demo.js", "logic.js"]) {
      const js = readFileSync(new URL(`../public/${file}`, import.meta.url), "utf8")
      expect(js, file).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|setHTML\(|document\.write/)
    }
  })

  it("serves the demo data script", async () => {
    const res = await fetch(`${await start()}/demo.js`)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("text/javascript; charset=utf-8")
  })

  it("serves the basin จังหวัด and อำเภอ outlines and the เขื่อน for the north tab", async () => {
    const base = await start()
    for (const name of ["basin-provinces", "basin-districts", "dams"]) {
      const res = await fetch(`${base}/data/${name}.geojson`)
      expect(res.status, name).toBe(200)
      expect(res.headers.get("content-type"), name).toBe("application/geo+json")
      expect(((await res.json()) as { type: string }).type).toBe("FeatureCollection")
    }
  })

  it("serves the สถานการณ์จำลอง as a static file", async () => {
    const res = await fetch(`${await start()}/data/scenarios/chao-phraya.json`)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/json")
    expect(((await res.json()) as { label: string }).label).toBe("ข้อมูลจำลอง · ไม่ใช่การพยากรณ์")
  })

  it("serves the page logic script", async () => {
    const res = await fetch(`${await start()}/logic.js`)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("text/javascript; charset=utf-8")
  })
})

describe("demo data (public/demo.js)", () => {
  type Demo = {
    reports: { landmark: string; label: string; depthLevel: string; depthCm: number; ageMinutes: number; confirmations: number; districtId: string; lngLat: [number, number] }[]
    floodAreas: () => { type: string; features: { geometry: { type: string; coordinates: number[][][] }; properties: { depthCm: number; zone: string } }[] }
  }
  function loadDemo(): Demo {
    const window: { NAMTUAM_DEMO?: Demo } = {}
    runInNewContext(readFileSync(new URL("../public/demo.js", import.meta.url), "utf8"), { window })
    if (!window.NAMTUAM_DEMO) throw new Error("demo.js did not define window.NAMTUAM_DEMO")
    return window.NAMTUAM_DEMO
  }
  const inBangkok = ([lon, lat]: number[]) => lon! > 100.3 && lon! < 100.95 && lat! > 13.5 && lat! < 14.05

  it("every demo report says it is simulated and uses the API's depth levels", () => {
    const { reports } = loadDemo()
    expect(reports.length).toBeGreaterThanOrEqual(6)
    const cm: Record<string, number> = { ankle: 10, knee: 50, waist: 100 }
    for (const r of reports) {
      expect(r.label, r.landmark).toContain("ข้อมูลจำลอง")
      expect(r.depthCm, r.landmark).toBe(cm[r.depthLevel])
      expect(Number.isInteger(r.ageMinutes) && r.ageMinutes >= 0 && r.ageMinutes < 360, r.landmark).toBe(true)
      expect(inBangkok(r.lngLat), r.landmark).toBe(true)
    }
  })

  it("covers the Ramkhamhaeng zone and the Khlong Chan flats", () => {
    const { reports, floodAreas } = loadDemo()
    const text = reports.map((r) => r.landmark).join(" ")
    expect(text).toContain("รามคำแหง")
    expect(text).toContain("คลองจั่น")
    const zones = new Set(floodAreas().features.map((f) => f.properties.zone))
    expect(zones.has("ramkhamhaeng") && zones.has("khlong-chan")).toBe(true)
  })

  it("spreads across Bangkok: most of the 12 districts, known flood spots, many flood areas", () => {
    const { reports, floodAreas } = loadDemo()
    const known = new Set([...districts.keys()])
    for (const r of reports) expect(known.has(r.districtId), `${r.landmark} → ${r.districtId}`).toBe(true)
    expect(new Set(reports.map((r) => r.districtId)).size).toBeGreaterThanOrEqual(10)
    const text = reports.map((r) => r.landmark).join(" ")
    for (const spot of ["ห้าแยกลาดพร้าว", "เกษตร", "สายไหม", "อโศก", "ลาดกระบัง", "ดอนเมือง"]) expect(text, spot).toContain(spot)
    expect(new Set(floodAreas().features.map((f) => f.properties.zone)).size).toBeGreaterThanOrEqual(8)
  })

  it("pins agree with the water drawn under them: deep reports sit inside deep bands", () => {
    const { reports, floodAreas } = loadDemo()
    const inside = ([x, y]: number[], ring: number[][]) => {
      let hit = false
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]!
        const [xj, yj] = ring[j]!
        if (yi! > y! !== yj! > y! && x! < ((xj! - xi!) * (y! - yi!)) / (yj! - yi!) + xi!) hit = !hit
      }
      return hit
    }
    const bands = floodAreas().features
    const deepestUnder = (p: number[]) => Math.max(0, ...bands.filter((f) => inside(p, f.geometry.coordinates[0]!)).map((f) => f.properties.depthCm))
    for (const r of reports.filter((x) => x.depthLevel === "waist")) expect(deepestUnder(r.lngLat), r.landmark).toBeGreaterThanOrEqual(50)
    for (const r of reports.filter((x) => x.depthLevel === "knee")) expect(deepestUnder(r.lngLat), r.landmark).toBeGreaterThanOrEqual(30)
  })

  it("reports vary in age and confirmations like a live feed", () => {
    const { reports } = loadDemo()
    expect(new Set(reports.map((r) => r.ageMinutes)).size).toBeGreaterThanOrEqual(reports.length - 2)
    expect(Math.max(...reports.map((r) => r.ageMinutes))).toBeGreaterThanOrEqual(180)
    expect(Math.min(...reports.map((r) => r.ageMinutes))).toBeLessThanOrEqual(10)
    expect(reports.some((r) => r.confirmations === 1) && reports.some((r) => r.confirmations >= 10)).toBe(true)
  })

  it("flood areas are closed polygons in Bangkok, getting deeper toward the middle of each zone", () => {
    const { features } = loadDemo().floodAreas()
    for (const zone of ["ramkhamhaeng", "khlong-chan"]) {
      const bands = features.filter((f) => f.properties.zone === zone)
      expect(bands.length).toBeGreaterThanOrEqual(3)
      const depths = bands.map((f) => f.properties.depthCm)
      expect(depths).toEqual([...depths].sort((a, b) => a - b))
      for (const f of bands) {
        const ring = f.geometry.coordinates[0]!
        expect(f.geometry.type).toBe("Polygon")
        expect(ring[0]).toEqual(ring[ring.length - 1])
        expect(ring.every(inBangkok)).toBe(true)
      }
    }
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
