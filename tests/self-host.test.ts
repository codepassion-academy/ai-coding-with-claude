import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { afterEach, describe, expect, it } from "vitest"
import { createAppServer } from "../src/server.ts"

// ADR 0001: the map page loads nothing from another site. Only talks to 127.0.0.1; never the network.
const servers: Server[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((done) => s.close(done))))
})

async function start(): Promise<string> {
  const server = createAppServer()
  servers.push(server)
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

const publicFile = (path: string) => readFileSync(new URL(`../public/${path}`, import.meta.url))

/** Outside URLs the page may mention because it never loads them. */
const NOT_LOADED = new Set([
  "http://www.w3.org/2000/svg", // SVG namespace
  "https://openstreetmap.org/copyright", // attribution link the ODbL requires
  "https://protomaps.com" // attribution link
])

/** `public/vendor/SHA256SUMS` as [path, hash] pairs. */
const manifest = readFileSync(new URL("../public/vendor/SHA256SUMS", import.meta.url), "utf8")
  .trim()
  .split("\n")
  .map((line) => {
    const [hash, path] = line.split(/\s+/)
    return [path ?? "", hash ?? ""] as const
  })

/** The URL MapLibre asks for: glyph folders are named after the font stack, with the space encoded. */
const urlOf = (path: string) =>
  "/vendor/" +
  path.replace(/^glyphs\/noto-sans-(regular|medium)\//, (_m, face: string) => `glyphs/Noto%20Sans%20${face[0]?.toUpperCase()}${face.slice(1)}/`)

const TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".pbf": "application/x-protobuf",
  ".png": "image/png",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8"
}

describe("self-hosted map assets (ADR 0001)", () => {
  it("the page and its scripts mention no outside URL they would load", () => {
    for (const file of ["index.html", "app.js", "demo.js", "app.css"]) {
      const urls = publicFile(file).toString("utf8").match(/https?:\/\/[^\s"'`)<>\\]+/g) ?? []
      expect(
        urls.filter((url) => !NOT_LOADED.has(url)),
        file
      ).toEqual([])
    }
  })

  it("the CSP allows no outside host", async () => {
    const csp = (await fetch(`${await start()}/`)).headers.get("content-security-policy") ?? ""
    expect(csp).toContain("default-src 'self'")
    expect(csp).not.toMatch(/https?:|\*/)
  })

  it("vendors MapLibre, pmtiles, basemaps, glyphs and sprites", () => {
    const paths = manifest.map(([path]) => path)
    for (const expected of ["maplibre-gl.js", "maplibre-gl.css", "pmtiles.js", "basemaps.js", "glyphs/noto-sans-regular/3584-3839.pbf", "sprites/dark@2x.png"]) {
      expect(paths).toContain(expected)
    }
  })

  it("the vendored files on disk match the committed SHA256SUMS", () => {
    for (const [path, hash] of manifest) {
      expect(createHash("sha256").update(publicFile(`vendor/${path}`)).digest("hex"), path).toBe(hash)
    }
  })

  it("serves every vendored file at the URL MapLibre asks for, with the right content type", async () => {
    const base = await start()
    for (const [path] of manifest) {
      const res = await fetch(base + urlOf(path))
      expect(res.status, path).toBe(200)
      expect(res.headers.get("content-type"), path).toBe(TYPES[path.slice(path.lastIndexOf("."))])
      await res.arrayBuffer()
    }
  })

  it("still serves only listed paths under /vendor/", async () => {
    const base = await start()
    for (const path of [
      "/vendor/",
      "/vendor/SHA256SUMS",
      "/vendor/glyphs/noto-sans-regular/0-255.pbf",
      "/vendor/glyphs/Noto%20Sans%20Regular/1024-1279.pbf",
      "/vendor/../package.json",
      "/vendor/%2e%2e/package.json",
      "/vendor/maplibre-gl.js/"
    ]) {
      expect((await fetch(base + path)).status, path).toBe(404)
    }
  })
})
