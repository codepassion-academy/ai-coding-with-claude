import { createServer, type Server } from "node:http"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { handle, NOTICE, type Context, type Response } from "./app.ts"
import { clientKeyFromAddress } from "./rate-limit.ts"

/** Same shape as `handle`, but the server always passes a context. */
export type Handler = (method: string, path: string, body: unknown, ctx: Context) => Response

const JSON_TYPE = "application/json; charset=utf-8"

/** Fixed bodies: never the parser message or the exception text (RPT-REQ-013 AC3, RPT-REQ-015). */
const INVALID_JSON = JSON.stringify({ notice: NOTICE, error: "invalid JSON" })
const INTERNAL = JSON.stringify({ notice: NOTICE, error: "internal" })

/** Thin node:http adapter around `handle`. Takes the handler so tests can inject a store or a failure. */
export function createAppServer(handler: Handler = handle): Server {
  return createServer((req, res) => {
    let raw = ""
    req.on("data", (chunk) => (raw += chunk))
    req.on("end", () => {
      let body: unknown = undefined
      if (raw) {
        try {
          body = JSON.parse(raw)
        } catch {
          res.writeHead(400, { "content-type": JSON_TYPE }).end(INVALID_JSON)
          return
        }
      }
      try {
        const path = new URL(req.url ?? "/", "http://x").pathname
        // Socket address only. Never X-Forwarded-For / Forwarded: the client can fake those (RPT-REQ-009).
        const clientKey = clientKeyFromAddress(req.socket.remoteAddress)
        const { status, body: out, headers } = handler(req.method ?? "GET", path, body, { now: new Date(), clientKey })
        // Serialize before writeHead so a throw here still becomes a clean 500.
        const payload = JSON.stringify(out)
        res.writeHead(status, { "content-type": JSON_TYPE, ...headers }).end(payload)
      } catch {
        // Nothing from the error is logged or returned: it may hold input or paths (RPT-REQ-013, RPT-REQ-015).
        if (!res.headersSent) res.writeHead(500, { "content-type": JSON_TYPE })
        res.end(INTERNAL)
      }
    })
  })
}

/** Listen only when run directly (`tsx src/server.ts`), never on import. */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000)
  createAppServer().listen(port, () => console.log(`น้ำท่วมไหม listening on http://localhost:${port}`))
}
