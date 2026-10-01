import { randomBytes } from "node:crypto"
import { describe, expect, it } from "vitest"
import { checkBearer, createAuthFailureLimiter } from "../src/admin.ts"

// Made up inside the test; the real token comes from the environment.
const TOKEN = randomBytes(16).toString("hex")
const NOW = new Date("2026-09-30T12:30:00Z")
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000)

describe("checkBearer", () => {
  it("RPT-REQ-014 AC3 accepts the right token after Bearer", () => {
    expect(checkBearer(`Bearer ${TOKEN}`, TOKEN)).toBe(true)
  })

  it.each([
    ["no header", undefined],
    ["an empty header", ""],
    ["a wrong token", `Bearer ${randomBytes(16).toString("hex")}`],
    ["the right token without the word Bearer", TOKEN],
    ["a different scheme", `Basic ${TOKEN}`],
    ["a prefix of the real token", `Bearer ${TOKEN.slice(0, 20)}`],
    ["the real token plus extra characters", `Bearer ${TOKEN}x`],
    ["Bearer with no token", "Bearer "]
  ])("RPT-REQ-014 AC2 rejects %s", (_name, header) => {
    expect(checkBearer(header, TOKEN)).toBe(false)
  })
})

describe("createAuthFailureLimiter", () => {
  it("RPT-REQ-014 AC5 allows 10 failures and then limits", () => {
    const limiter = createAuthFailureLimiter()
    for (let i = 0; i < 10; i++) {
      expect(limiter.status("a", NOW)).toEqual({ limited: false })
      limiter.recordFailure("a", NOW)
    }
    expect(limiter.status("a", NOW)).toEqual({ limited: true, retryAfterSeconds: 900 })
  })

  it("RPT-REQ-014 AC5 counts each key on its own", () => {
    const limiter = createAuthFailureLimiter()
    for (let i = 0; i < 10; i++) limiter.recordFailure("a", NOW)
    expect(limiter.status("b", NOW)).toEqual({ limited: false })
  })

  it("RPT-REQ-014 AC5 forgets a failure after 15 minutes", () => {
    const limiter = createAuthFailureLimiter()
    for (let i = 0; i < 10; i++) limiter.recordFailure("a", NOW)
    expect(limiter.status("a", new Date(at(15).getTime() - 1000))).toEqual({ limited: true, retryAfterSeconds: 1 })
    expect(limiter.status("a", at(15))).toEqual({ limited: false })
  })
})
