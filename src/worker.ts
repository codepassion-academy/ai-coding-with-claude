import { NOTICE } from "./app.ts"
import { clientKeyFromAddress } from "./rate-limit.ts"
import { readWebBody } from "./read-body.ts"
import type { ObjectRequest } from "./reports-object.ts"
import { parseRange, staticEntry, staticHeaders } from "./static-files.ts"

// wrangler.jsonc names this class; it must be exported from the Worker's main module.
export { ReportsObject } from "./reports-object.ts"

/** The bindings in wrangler.jsonc, typed by just what this file uses. */
export type Env = {
  ASSETS: { fetch(request: Request): Promise<Response> }
  TILES: {
    head(key: string): Promise<{ size: number } | null>
    get(key: string, options?: { range: { offset: number; length: number } }): Promise<{ body: ReadableStream } | null>
  }
  REPORTS: {
    idFromName(name: string): unknown
    get(id: unknown): { fetch(request: Request): Promise<Response> }
  }
  /** `wrangler secret put CLIENT_KEY_SECRET`. Turns a client IP into an HMAC before it reaches storage. */
  CLIENT_KEY_SECRET?: string
}

const JSON_TYPE = "application/json; charset=utf-8"

/** Fixed bodies: never the parser message or the exception text (RPT-REQ-013 AC3, RPT-REQ-015). */
const INVALID_JSON = JSON.stringify({ notice: NOTICE, error: "invalid JSON" })
const INTERNAL = JSON.stringify({ notice: NOTICE, error: "internal" })
const TOO_LARGE = JSON.stringify({ notice: NOTICE, error: "payload_too_large" })

function json(status: number, payload: string, headers: Record<string, string> = {}): Response {
  return new Response(payload, { status, headers: { "content-type": JSON_TYPE, ...headers } })
}

/**
 * Rate-limit key on Cloudflare (ADR 0003, RPT-REQ-009): `CF-Connecting-IP` only, never `X-Forwarded-For` /
 * `Forwarded`. Normalized like the socket address, then HMAC-SHA-256 so no raw IP is ever stored.
 */
export async function clientKeyFromRequest(request: Request, secret: string | undefined): Promise<string> {
  const key = clientKeyFromAddress(request.headers.get("cf-connecting-ip") ?? undefined)
  if (key === "unknown") return key
  if (!secret) throw new Error("CLIENT_KEY_SECRET is not set")
  const encoder = new TextEncoder()
  const hmacKey = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, encoder.encode(key)))
  return "h:" + [...mac].map((b) => b.toString(16).padStart(2, "0")).join("")
}

/** A listed file: tiles from R2 with byte ranges, the rest from Workers Static Assets. Undefined falls through to the API's 404. */
async function serveStatic(request: Request, path: string, env: Env): Promise<Response | undefined> {
  if (request.method !== "GET") return undefined
  const entry = staticEntry(path)
  if (!entry) return undefined
  const headers = staticHeaders(path, entry)

  if (path.startsWith("/tiles/")) {
    // Too big for Static Assets (25 MiB per file), so R2 under the same name (ADR 0003).
    const key = entry.file.slice("tiles/".length)
    const head = await env.TILES.head(key)
    if (!head) return undefined
    const size = head.size
    const rangeHeader = request.headers.get("range")
    if (rangeHeader !== null) {
      const range = parseRange(rangeHeader, size)
      if (!range) return new Response(null, { status: 416, headers: { ...headers, "content-range": `bytes */${size}` } })
      const length = range.end - range.start + 1
      const object = await env.TILES.get(key, { range: { offset: range.start, length } })
      if (!object) return undefined
      return new Response(object.body, {
        status: 206,
        headers: { ...headers, "content-range": `bytes ${range.start}-${range.end}/${size}`, "content-length": String(length) }
      })
    }
    const object = await env.TILES.get(key)
    if (!object) return undefined
    return new Response(object.body, { status: 200, headers: { ...headers, "content-length": String(size) } })
  }

  // Fetch the file by its own name, so only listed paths are ever served (no folder lookup).
  const asset = await env.ASSETS.fetch(new Request(new URL("/" + entry.file, request.url)))
  if (!asset.ok) return undefined
  return new Response(asset.body, { status: 200, headers })
}

/**
 * Cloudflare Worker adapter, the twin of server.ts (ADR 0003): the page's fixed files first, then the body
 * (max 2048 bytes, 413), JSON.parse (400), then `handle()` inside the ReportsObject Durable Object. 500 on any throw.
 */
export async function handleRequest(request: Request, env: Env, now: () => Date = () => new Date()): Promise<Response> {
  try {
    const path = new URL(request.url).pathname
    const file = await serveStatic(request, path, env)
    if (file) return file

    const read = await readWebBody(request.body)
    if (!read.ok) return json(413, TOO_LARGE)

    let body: unknown = undefined
    if (read.raw) {
      try {
        body = JSON.parse(read.raw)
      } catch {
        return json(400, INVALID_JSON)
      }
    }

    // Only a POST is rate-limited, so reads never pay for the HMAC or need the secret.
    const clientKey = request.method === "POST" ? await clientKeyFromRequest(request, env.CLIENT_KEY_SECRET) : "unknown"
    const message: ObjectRequest = { method: request.method, path, body, clientKey, now: now().getTime() }
    const stub = env.REPORTS.get(env.REPORTS.idFromName("reports"))
    const reply = await stub.fetch(new Request("https://reports-object/handle", { method: "POST", body: JSON.stringify(message) }))
    if (!reply.ok) return json(500, INTERNAL)
    const { status, body: out, headers } = (await reply.json()) as { status: number; body: unknown; headers?: Record<string, string> }
    return json(status, JSON.stringify(out), headers)
  } catch {
    // Nothing from the error is logged or returned: it may hold input or paths (RPT-REQ-013, RPT-REQ-015).
    return json(500, INTERNAL)
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env)
  }
}
