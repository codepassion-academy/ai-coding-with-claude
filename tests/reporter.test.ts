import { describe, expect, it } from "vitest"
import { hashReporter, normalizeIp } from "../src/reporter.ts"

const SECRET = "test-secret-one"

describe("hashReporter", () => {
  it("RPT-REQ-008 AC1 returns 64 hex characters that do not contain the address", () => {
    const hash = hashReporter(SECRET, "203.0.113.10")
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain("203.0.113.10")
  })

  it("RPT-REQ-008 AC2 depends on both the address and the secret", () => {
    expect(hashReporter(SECRET, "203.0.113.10")).toBe(hashReporter(SECRET, "203.0.113.10"))
    expect(hashReporter(SECRET, "203.0.113.10")).not.toBe(hashReporter("test-secret-two", "203.0.113.10"))
    expect(hashReporter(SECRET, "203.0.113.10")).not.toBe(hashReporter(SECRET, "203.0.113.11"))
  })

  it("RPT-REQ-008 AC3 treats IPv6 addresses in the same /64 as one reporter", () => {
    const first = hashReporter(SECRET, "2001:db8:1:2:aaaa::1")
    expect(hashReporter(SECRET, "2001:db8:1:2:bbbb::2")).toBe(first)
    expect(hashReporter(SECRET, "2001:db8:1:3::1")).not.toBe(first)
  })

  it("RPT-REQ-008 AC4 treats an IPv4-mapped address as IPv4", () => {
    expect(hashReporter(SECRET, "::ffff:203.0.113.10")).toBe(hashReporter(SECRET, "203.0.113.10"))
  })
})

describe("normalizeIp", () => {
  it.each([
    ["203.0.113.10", "203.0.113.10"],
    ["::ffff:203.0.113.10", "203.0.113.10"],
    ["::FFFF:203.0.113.10", "203.0.113.10"],
    ["2001:db8:1:2:aaaa::1", "2001:db8:1:2::/64"],
    ["2001:0DB8:0001:0002:0000:0000:0000:0001", "2001:db8:1:2::/64"],
    ["2001:db8::1", "2001:db8:0:0::/64"],
    ["::1", "0:0:0:0::/64"],
    ["fe80::1%eth0", "fe80:0:0:0::/64"]
  ])("RPT-REQ-008 AC3 AC4 normalizes %s to %s", (ip, expected) => {
    expect(normalizeIp(ip)).toBe(expected)
  })
})
