/**
 * The map page's files: which URL paths exist, and the headers each one gets. No Node imports, so the
 * node:http server (static.ts) and the Cloudflare Worker (worker.ts) share one list (ADR 0003).
 */

export type StaticEntry = { file: string; type: string }

/**
 * The only files the server hands out, by exact URL path. A fixed list instead of a folder
 * lookup, so no path trick (`..`, encoded dots, trailing slash) can reach any other file.
 */
const FILES: Record<string, StaticEntry> = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
  "/demo.js": { file: "demo.js", type: "text/javascript; charset=utf-8" },
  "/logic.js": { file: "logic.js", type: "text/javascript; charset=utf-8" },
  // Noto Sans Thai (SIL OFL 1.1, public/fonts/OFL.txt), hosted here so no font request leaves the site.
  "/fonts/noto-sans-thai-thai.woff2": { file: "fonts/noto-sans-thai-thai.woff2", type: "font/woff2" },
  "/fonts/noto-sans-thai-latin.woff2": { file: "fonts/noto-sans-thai-latin.woff2", type: "font/woff2" },
  "/app.css": { file: "app.css", type: "text/css; charset=utf-8" },
  // Protomaps extracts (ADR 0001): Bangkok in detail, Thailand to about z10. On Cloudflare they live in R2 (ADR 0003).
  "/tiles/bangkok.pmtiles": { file: "tiles/bangkok.pmtiles", type: "application/octet-stream" },
  "/tiles/thailand.pmtiles": { file: "tiles/thailand.pmtiles", type: "application/octet-stream" },
  // จังหวัด and อำเภอ outlines of the Chao Phraya basin, from HDX COD-AB (scripts/build-districts.mjs).
  "/data/basin-provinces.geojson": { file: "data/basin-provinces.geojson", type: "application/geo+json" },
  "/data/basin-districts.geojson": { file: "data/basin-districts.geojson", type: "application/geo+json" },
  // Real เขื่อน as reference points, no release figures (north-water 02).
  "/data/dams.geojson": { file: "data/dams.geojson", type: "application/geo+json" },
  // The one hand-authored สถานการณ์จำลอง (north-water 03). A static file: the scenario never touches the API.
  "/data/scenarios/chao-phraya.json": { file: "data/scenarios/chao-phraya.json", type: "application/json" },
  ...vendoredFiles()
}

/**
 * Map assets pinned and checked by scripts/vendor-map.sh (public/vendor/SHA256SUMS), so the page loads
 * nothing from another site (ADR 0001). Glyph URLs keep the font stack name MapLibre asks for, with the
 * space encoded; on disk the folder has no spaces.
 */
function vendoredFiles(): Record<string, StaticEntry> {
  const js = "text/javascript; charset=utf-8"
  const files: Record<string, StaticEntry> = {
    "/vendor/maplibre-gl.js": { file: "vendor/maplibre-gl.js", type: js },
    "/vendor/maplibre-gl.css": { file: "vendor/maplibre-gl.css", type: "text/css; charset=utf-8" },
    "/vendor/pmtiles.js": { file: "vendor/pmtiles.js", type: js },
    "/vendor/basemaps.js": { file: "vendor/basemaps.js", type: js },
    "/vendor/glyphs/OFL.txt": { file: "vendor/glyphs/OFL.txt", type: "text/plain; charset=utf-8" }
  }
  for (const face of ["Regular", "Medium"]) {
    for (const range of ["0-255", "256-511", "3584-3839", "8192-8447"]) {
      files[`/vendor/glyphs/Noto%20Sans%20${face}/${range}.pbf`] = {
        file: `vendor/glyphs/noto-sans-${face.toLowerCase()}/${range}.pbf`,
        type: "application/x-protobuf"
      }
    }
  }
  for (const flavor of ["light", "dark"]) {
    for (const scale of ["", "@2x"]) {
      files[`/vendor/sprites/${flavor}${scale}.json`] = { file: `vendor/sprites/${flavor}${scale}.json`, type: "application/json" }
      files[`/vendor/sprites/${flavor}${scale}.png`] = { file: `vendor/sprites/${flavor}${scale}.png`, type: "image/png" }
    }
  }
  return files
}

/** The listed file for an exact URL path, or undefined. */
export function staticEntry(path: string): StaticEntry | undefined {
  return Object.hasOwn(FILES, path) ? FILES[path] : undefined
}

/** Everything comes from this server (ADR 0001). MapLibre still needs blob: workers. */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src blob:",
  "child-src blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join("; ")

/** Headers for a listed file, before any range headers. */
export function staticHeaders(path: string, entry: StaticEntry): Record<string, string> {
  const headers: Record<string, string> = { "content-type": entry.type, "x-content-type-options": "nosniff" }
  if (entry.type.startsWith("text/html")) {
    headers["content-security-policy"] = CSP
    headers["referrer-policy"] = "no-referrer"
    headers["cache-control"] = "no-cache"
  }

  if (path.startsWith("/fonts/")) headers["cache-control"] = "public, max-age=31536000, immutable"
  // Vendored URLs carry no version, so a bump must reach browsers: cache for a day, not for good.
  if (path.startsWith("/vendor/")) headers["cache-control"] = "public, max-age=86400"
  if (path.startsWith("/tiles/")) headers["accept-ranges"] = "bytes"
  return headers
}

export type Range = { start: number; end: number }

/** One `bytes=` range (`a-b`, `a-`, `-n`) against a file of `size` bytes; undefined when unusable. */
export function parseRange(header: string, size: number): Range | undefined {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m || (m[1] === "" && m[2] === "")) return undefined
  const [first, last] = [m[1] ?? "", m[2] ?? ""]
  const range =
    first === ""
      ? { start: Math.max(0, size - Number(last)), end: size - 1 }
      : { start: Number(first), end: last === "" ? size - 1 : Math.min(Number(last), size - 1) }
  return range.start <= range.end && range.start < size ? range : undefined
}
