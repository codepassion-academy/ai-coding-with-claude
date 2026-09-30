import { createServer, type Server, type ServerResponse } from "node:http"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { handle, NOTICE, type Context, type Response } from "./app.ts"
import { clientKeyFromAddress } from "./rate-limit.ts"
import { readBody } from "./read-body.ts"
import { DEFAULT_PUBLIC_DIR, serveStatic } from "./static.ts"

/** Same shape as `handle`, but the server always passes a context. */
export type Handler = (method: string, path: string, body: unknown, ctx: Context) => Response

const JSON_TYPE = "application/json; charset=utf-8"

/** Fixed bodies: never the parser message or the exception text (RPT-REQ-013 AC3, RPT-REQ-015). */
const INVALID_JSON = JSON.stringify({ notice: NOTICE, error: "invalid JSON" })
const INTERNAL = JSON.stringify({ notice: NOTICE, error: "internal" })
const TOO_LARGE = JSON.stringify({ notice: NOTICE, error: "payload_too_large" })

function send(res: ServerResponse, status: number, payload: string, headers: Record<string, string> = {}): void {
  if (!res.headersSent) res.writeHead(status, { "content-type": JSON_TYPE, ...headers })
  res.end(payload)
}

export type ServerOptions = { publicDir?: string }

/**
 * Thin node:http adapter: the map page's fixed list of files first, then `handle` for the API.
 * Takes the handler so tests can inject a store or a failure, and the folder so tests can use fake tiles.
 */
export function createAppServer(handler: Handler = handle, options: ServerOptions = {}): Server {
  const publicDir = options.publicDir ?? DEFAULT_PUBLIC_DIR
  return createServer(async (req, res) => {
    try {
      const path = new URL(req.url ?? "/", "http://x").pathname
      if (serveStatic(req, res, path, publicDir)) return

      const read = await readBody(req)
      // Close the connection so the rest of an oversized upload is not read (RPT-REQ-014).
      if (!read.ok) return send(res, 413, TOO_LARGE, { connection: "close" })

      let body: unknown = undefined
      if (read.raw) {
        try {
          body = JSON.parse(read.raw)
        } catch {
          return send(res, 400, INVALID_JSON)
        }
      }

      // Socket address only. Never X-Forwarded-For / Forwarded: the client can fake those (RPT-REQ-009).
      const clientKey = clientKeyFromAddress(req.socket.remoteAddress)
      const { status, body: out, headers } = handler(req.method ?? "GET", path, body, { now: new Date(), clientKey })
      // Serialize before writing the head so a throw here still becomes a clean 500.
      send(res, status, JSON.stringify(out), headers)
    } catch {
      // Nothing from the error is logged or returned: it may hold input or paths (RPT-REQ-013, RPT-REQ-015).
      send(res, 500, INTERNAL)
    }
  })
}

/** Listen only when run directly (`tsx src/server.ts`), never on import. */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000)
  createAppServer().listen(port, () => console.log(`น้ำท่วมไหม listening on http://localhost:${port}`))
}
