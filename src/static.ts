import { createReadStream, statSync } from "node:fs"
import type { IncomingMessage, ServerResponse } from "node:http"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * The only files the server hands out, by exact URL path. A fixed list instead of a folder
 * lookup, so no path trick (`..`, encoded dots, trailing slash) can reach any other file.
 */
const FILES: Record<string, { file: string; type: string }> = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
  "/demo.js": { file: "demo.js", type: "text/javascript; charset=utf-8" },
  "/logic.js": { file: "logic.js", type: "text/javascript; charset=utf-8" },
  // Noto Sans Thai (SIL OFL 1.1, public/fonts/OFL.txt), hosted here so no font request leaves the site.
  "/fonts/noto-sans-thai-thai.woff2": { file: "fonts/noto-sans-thai-thai.woff2", type: "font/woff2" },
  "/fonts/noto-sans-thai-latin.woff2": { file: "fonts/noto-sans-thai-latin.woff2", type: "font/woff2" },
  "/app.css": { file: "app.css", type: "text/css; charset=utf-8" },
  // Protomaps extract of Bangkok (ADR 0001). Not in git; see README for how to make it.
  "/tiles/bangkok.pmtiles": { file: "tiles/bangkok.pmtiles", type: "application/octet-stream" }
}

/** Glyphs and sprites for the basemap still come from Protomaps' asset host until we self-host them (ADR 0001). */
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://unpkg.com",
  "style-src 'self' https://unpkg.com",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://protomaps.github.io",
  "worker-src blob:",
  "child-src blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join("; ")

// fileURLToPath, not .pathname: a checkout under a folder with spaces or Thai letters must still work.
export const DEFAULT_PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url))

type Range = { start: number; end: number }

/** One `bytes=` range (`a-b`, `a-`, `-n`) against a file of `size` bytes; undefined when unusable. */
function parseRange(header: string, size: number): Range | undefined {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m || (m[1] === "" && m[2] === "")) return undefined
  const [first, last] = [m[1] ?? "", m[2] ?? ""]
  const range =
    first === ""
      ? { start: Math.max(0, size - Number(last)), end: size - 1 }
      : { start: Number(first), end: last === "" ? size - 1 : Math.min(Number(last), size - 1) }
  return range.start <= range.end && range.start < size ? range : undefined
}

/**
 * Serve a listed file for GET. Returns false when the path is not a listed file or the file does
 * not exist, so the caller can fall through to the API router and its 404.
 */
export function serveStatic(req: IncomingMessage, res: ServerResponse, path: string, publicDir = DEFAULT_PUBLIC_DIR): boolean {
  if (req.method !== "GET") return false
  const entry = Object.hasOwn(FILES, path) ? FILES[path] : undefined
  if (!entry) return false
  const fullPath = join(publicDir, entry.file)
  let size: number
  try {
    const stat = statSync(fullPath)
    if (!stat.isFile()) return false
    size = stat.size
  } catch {
    return false
  }

  const headers: Record<string, string> = { "content-type": entry.type, "x-content-type-options": "nosniff" }
  if (entry.type.startsWith("text/html")) {
    headers["content-security-policy"] = CSP
    headers["referrer-policy"] = "no-referrer"
    headers["cache-control"] = "no-cache"
  }

  if (path.startsWith("/fonts/")) headers["cache-control"] = "public, max-age=31536000, immutable"

  if (path.startsWith("/tiles/")) {
    headers["accept-ranges"] = "bytes"
    const rangeHeader = req.headers.range
    if (rangeHeader !== undefined) {
      const range = parseRange(rangeHeader, size)
      if (!range) {
        res.writeHead(416, { ...headers, "content-range": `bytes */${size}` }).end()
        return true
      }
      res.writeHead(206, { ...headers, "content-range": `bytes ${range.start}-${range.end}/${size}`, "content-length": String(range.end - range.start + 1) })
      pipeFile(fullPath, res, range)
      return true
    }
  }

  res.writeHead(200, { ...headers, "content-length": String(size) })
  pipeFile(fullPath, res)
  return true
}

/** A file that vanishes mid-send just drops the connection; nothing about it is logged or returned. */
function pipeFile(fullPath: string, res: ServerResponse, range?: Range): void {
  createReadStream(fullPath, range)
    .on("error", () => res.destroy())
    .pipe(res)
}
