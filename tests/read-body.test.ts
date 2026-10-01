import { Readable } from "node:stream"
import { describe, expect, it } from "vitest"
import { readBody } from "../src/read-body.ts"
import { MAX_BODY_BYTES } from "../src/reports.ts"

const stream = (...chunks: (string | Buffer)[]) => Readable.from(chunks.map((c) => (typeof c === "string" ? Buffer.from(c) : c)))

describe("readBody (RPT-REQ-014)", () => {
  it("MAX_BODY_BYTES is 2048 (spec §2)", () => {
    expect(MAX_BODY_BYTES).toBe(2048)
  })

  it("AC2: exactly 2048 bytes passes and comes back as text", async () => {
    const body = "a".repeat(MAX_BODY_BYTES)
    expect(await readBody(stream(body.slice(0, 1000), body.slice(1000)))).toEqual({ ok: true, raw: body })
  })

  it("AC1: 2049 bytes is 413, whatever the content", async () => {
    expect(await readBody(stream("{", "x".repeat(MAX_BODY_BYTES)))).toEqual({ ok: false, status: 413 })
  })

  it("counts UTF-8 bytes, not characters (Thai is 3 bytes each)", async () => {
    const thai = "ก".repeat(683) // 2049 bytes in 683 characters
    expect(await readBody(stream(thai))).toEqual({ ok: false, status: 413 })
    expect(await readBody(stream("ก".repeat(682)))).toEqual({ ok: true, raw: "ก".repeat(682) })
  })

  it("keeps a Thai character that is split across two chunks intact", async () => {
    const bytes = Buffer.from("ปากซอย")
    expect(await readBody(stream(bytes.subarray(0, 4), bytes.subarray(4)))).toEqual({ ok: true, raw: "ปากซอย" })
  })

  it("an empty body is ok with empty text", async () => {
    expect(await readBody(stream())).toEqual({ ok: true, raw: "" })
  })

  it("stops collecting once over the limit but still settles when the sender keeps going", async () => {
    let pushed = 0
    const endless = new Readable({
      read() {
        pushed += 1
        this.push(pushed < 200 ? Buffer.alloc(1024, 120) : null)
      }
    })
    expect(await readBody(endless)).toEqual({ ok: false, status: 413 })
  })

  it("AC1: stops reading once over the limit instead of draining the rest of the upload", async () => {
    let pushed = 0
    const endless = new Readable({
      read() {
        pushed += 1
        this.push(pushed < 1000 ? Buffer.alloc(1024, 120) : null)
      }
    })
    expect(await readBody(endless)).toEqual({ ok: false, status: 413 })
    await new Promise((done) => setTimeout(done, 50))
    // Only what the stream buffers on its own may still be pulled (about 70 here); draining would be 1000.
    expect(pushed).toBeLessThan(100)
    expect(endless.isPaused()).toBe(true)
  })
})
