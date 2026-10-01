import type { Readable } from "node:stream"
import { MAX_BODY_BYTES } from "./reports.ts"

export type ReadBodyResult = { ok: true; raw: string } | { ok: false; status: 413 }

/**
 * Read a request body up to `maxBytes` UTF-8 bytes (RPT-REQ-014). Past the limit it settles with 413
 * right away, drops what it collected and stops reading, so nothing oversized is ever parsed.
 * Chunks are joined as bytes before decoding so a Thai character split across chunks stays whole.
 */
export function readBody(stream: Readable, maxBytes = MAX_BODY_BYTES): Promise<ReadBodyResult> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let settled = false
    const settle = (result: ReadBodyResult) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    const onData = (chunk: Buffer | string) => {
      const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk
      size += bytes.length
      if (size > maxBytes) {
        // Stop reading: detach and pause, so the rest of the upload is never pulled in.
        stream.off("data", onData)
        stream.pause()
        chunks.length = 0
        settle({ ok: false, status: 413 })
        return
      }
      chunks.push(bytes)
    }
    stream.on("data", onData)
    stream.on("end", () => settle({ ok: true, raw: Buffer.concat(chunks).toString("utf8") }))
    stream.on("error", (error) => {
      if (settled) return
      settled = true
      reject(error)
    })
  })
}

/**
 * Same rule for a web `ReadableStream` (Cloudflare Worker, ADR 0003). Counts the bytes that arrive instead of
 * trusting `Content-Length`, and cancels the stream past the limit.
 */
export async function readWebBody(body: ReadableStream<Uint8Array> | null, maxBytes = MAX_BODY_BYTES): Promise<ReadBodyResult> {
  if (!body) return { ok: true, raw: "" }
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      chunks.length = 0
      await reader.cancel()
      return { ok: false, status: 413 }
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { ok: true, raw: new TextDecoder().decode(bytes) }
}
