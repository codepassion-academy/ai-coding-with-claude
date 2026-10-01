import { describe, expect, it } from "vitest"
import { clientKeyFromAddress, createRateLimiter } from "../src/rate-limit.ts"
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from "../src/reports.ts"

const t0 = new Date("2026-09-30T12:00:00Z")
const after = (ms: number) => new Date(t0.getTime() + ms)
const MINUTE = 60 * 1000

/** Accept like submit() will: check first, record only when allowed. */
function accept(limiter: ReturnType<typeof createRateLimiter>, key: string, now: Date) {
  const result = limiter.check(key, now)
  if (result.allowed) limiter.record(key, now)
  return result
}

describe("spec constants (§2)", () => {
  it("are 5 per hour", () => {
    expect(RATE_LIMIT_MAX).toBe(5)
    expect(RATE_LIMIT_WINDOW_MS).toBe(3_600_000)
  })
})

describe("createRateLimiter (RPT-REQ-008)", () => {
  it("AC1: the first 5 from one key pass, the 6th is refused", () => {
    const limiter = createRateLimiter()
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      expect(accept(limiter, "a", after(i * MINUTE)), `#${i + 1}`).toEqual({ allowed: true })
    }
    expect(accept(limiter, "a", after(5 * MINUTE))).toMatchObject({ allowed: false })
  })

  it("AC2: another key is not affected", () => {
    const limiter = createRateLimiter()
    for (let i = 0; i < RATE_LIMIT_MAX; i++) accept(limiter, "a", t0)
    expect(limiter.check("a", t0)).toMatchObject({ allowed: false })
    expect(limiter.check("b", t0)).toEqual({ allowed: true })
  })

  it("AC3: retryAfterSec = ceil((oldest in window + window - now) / 1000)", () => {
    const limiter = createRateLimiter()
    for (let i = 0; i < RATE_LIMIT_MAX; i++) accept(limiter, "a", after(i * 10 * MINUTE))
    const now = after(45 * MINUTE + 500)
    // oldest = t0, so (t0 + 60 min - (t0 + 45 min + 500 ms)) / 1000 = 899.5 → 900
    expect(limiter.check("a", now)).toEqual({ allowed: false, retryAfterSec: 900 })
  })

  it("AC3: retryAfterSec is an integer of at least 1, even 1 ms before the window ends", () => {
    const limiter = createRateLimiter()
    for (let i = 0; i < RATE_LIMIT_MAX; i++) accept(limiter, "a", t0)
    const result = limiter.check("a", after(RATE_LIMIT_WINDOW_MS - 1))
    expect(result).toEqual({ allowed: false, retryAfterSec: 1 })
  })

  it("AC4 / E13: when the oldest leaves the window exactly (now = t0 + window) one more is allowed", () => {
    const limiter = createRateLimiter()
    accept(limiter, "a", t0)
    for (let i = 1; i < RATE_LIMIT_MAX; i++) accept(limiter, "a", after(i * MINUTE))
    expect(limiter.check("a", after(RATE_LIMIT_WINDOW_MS))).toEqual({ allowed: true })
    accept(limiter, "a", after(RATE_LIMIT_WINDOW_MS))
    // the window slides: t0 + 1 min is now the oldest, so the next one is refused again
    expect(limiter.check("a", after(RATE_LIMIT_WINDOW_MS))).toEqual({ allowed: false, retryAfterSec: 60 })
  })

  it("check alone never uses up quota (A2: only accepted reports are recorded)", () => {
    const limiter = createRateLimiter()
    for (let i = 0; i < 20; i++) limiter.check("a", t0)
    for (let i = 0; i < RATE_LIMIT_MAX; i++) expect(accept(limiter, "a", t0)).toEqual({ allowed: true })
  })

  it("takes a custom max and window", () => {
    const limiter = createRateLimiter(2, 1000)
    accept(limiter, "a", t0)
    accept(limiter, "a", t0)
    expect(limiter.check("a", after(999))).toEqual({ allowed: false, retryAfterSec: 1 })
    expect(limiter.check("a", after(1000))).toEqual({ allowed: true })
  })

  it("prune() drops old entries and empty keys for every key (RPT-REQ-012 AC3)", () => {
    const limiter = createRateLimiter()
    accept(limiter, "a", t0)
    accept(limiter, "b", after(30 * MINUTE))
    limiter.prune(after(RATE_LIMIT_WINDOW_MS))
    expect(limiter.size()).toBe(1)
    limiter.prune(after(30 * MINUTE + RATE_LIMIT_WINDOW_MS))
    expect(limiter.size()).toBe(0)
  })

  it("prune() keeps entries still in the window, so quota is unchanged", () => {
    const limiter = createRateLimiter()
    for (let i = 0; i < RATE_LIMIT_MAX; i++) accept(limiter, "a", t0)
    limiter.prune(after(RATE_LIMIT_WINDOW_MS - 1))
    expect(limiter.check("a", after(RATE_LIMIT_WINDOW_MS - 1))).toMatchObject({ allowed: false })
  })

  it("size() counts keys that still have entries in the window", () => {
    const limiter = createRateLimiter()
    expect(limiter.size()).toBe(0)
    accept(limiter, "a", t0)
    accept(limiter, "b", t0)
    accept(limiter, "b", t0)
    expect(limiter.size()).toBe(2)
  })
})

describe("clientKeyFromAddress (RPT-REQ-009)", () => {
  it("AC1: ::ffff: IPv4-mapped is normalized to plain IPv4", () => {
    expect(clientKeyFromAddress("::ffff:203.0.113.7")).toBe("203.0.113.7")
    expect(clientKeyFromAddress("::FFFF:203.0.113.7")).toBe("203.0.113.7")
    expect(clientKeyFromAddress("::ffff:cb00:7107")).toBe("203.0.113.7")
  })

  it("keeps plain IPv4 as is", () => {
    expect(clientKeyFromAddress("203.0.113.7")).toBe("203.0.113.7")
  })

  it("AC2 / E16: two IPv6 addresses in the same /64 share a key", () => {
    const a = clientKeyFromAddress("2001:db8:1:2:aaaa:bbbb:cccc:dddd")
    const b = clientKeyFromAddress("2001:db8:1:2::1")
    expect(a).toBe(b)
  })

  it("AC2: different /64 prefixes get different keys", () => {
    expect(clientKeyFromAddress("2001:db8:1:2::1")).not.toBe(clientKeyFromAddress("2001:db8:1:3::1"))
  })

  it("AC2: compressed, zero-padded and upper-case forms of the same /64 match", () => {
    const key = clientKeyFromAddress("2001:db8::1")
    expect(clientKeyFromAddress("2001:0DB8:0000:0000:ffff:0:0:9")).toBe(key)
    expect(clientKeyFromAddress("2001:db8:0:0::abcd")).toBe(key)
  })

  it("AC2: drops the interface suffix so the full address is not kept", () => {
    const key = clientKeyFromAddress("2001:db8:1:2:aaaa:bbbb:cccc:dddd")
    expect(key).not.toMatch(/aaaa|bbbb|cccc|dddd/)
  })

  it("ignores an IPv6 zone id", () => {
    expect(clientKeyFromAddress("fe80::1%eth0")).toBe(clientKeyFromAddress("fe80::2"))
  })

  it("E17: missing or unparseable address falls into the shared 'unknown' bucket (fail closed)", () => {
    expect(clientKeyFromAddress(undefined)).toBe("unknown")
    expect(clientKeyFromAddress("")).toBe("unknown")
    expect(clientKeyFromAddress("not an ip")).toBe("unknown")
    expect(clientKeyFromAddress("1:2:3:4:5:6:7:8:9")).toBe("unknown")
  })
})
