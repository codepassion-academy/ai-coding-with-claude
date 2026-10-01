import { createReadStream, statSync } from "node:fs"
import type { IncomingMessage, ServerResponse } from "node:http"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseRange, staticEntry, staticHeaders, type Range } from "./static-files.ts"

// fileURLToPath, not .pathname: a checkout under a folder with spaces or Thai letters must still work.
export const DEFAULT_PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url))

/**
 * Serve a listed file for GET. Returns false when the path is not a listed file or the file does
 * not exist, so the caller can fall through to the API router and its 404.
 */
export function serveStatic(req: IncomingMessage, res: ServerResponse, path: string, publicDir = DEFAULT_PUBLIC_DIR): boolean {
  if (req.method !== "GET") return false
  const entry = staticEntry(path)
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

  const headers = staticHeaders(path, entry)
  if (path.startsWith("/tiles/")) {
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
