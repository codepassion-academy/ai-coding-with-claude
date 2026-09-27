import { describe, expect, it } from "vitest"
import { discountFor, findCoupon, validateCoupon, type Coupon } from "../src/coupons.ts"

const base: Omit<Coupon, "kind"> = {
  code: "T",
  minSubtotalSatang: 0,
  expiresAt: new Date("2030-01-01T00:00:00Z"),
  usageLimit: 10,
  usedCount: 0
}

describe("findCoupon", () => {
  it("ignores case and surrounding spaces", () => {
    expect(findCoupon("  welcome100 ")?.code).toBe("WELCOME100")
  })
})

describe("discountFor", () => {
  it("fixed coupon takes its value off (COUP-REQ-001)", () => {
    expect(discountFor({ ...base, kind: "fixed", valueSatang: 10_000 }, 45_000)).toBe(10_000)
  })

  it("percent coupon rounds down to whole satang (COUP-REQ-002)", () => {
    expect(discountFor({ ...base, kind: "percent", percent: 10 }, 9_999)).toBe(999)
  })

  it("never discounts more than the subtotal (COUP-REQ-003)", () => {
    expect(discountFor({ ...base, kind: "fixed", valueSatang: 50_000 }, 9_900)).toBe(9_900)
  })
})

describe("validateCoupon (W6)", () => {
  const now = new Date("2026-09-30T12:00:00Z")

  it("rejects an expired coupon (COUP-REQ-005)", () => {
    const c: Coupon = { ...base, kind: "fixed", valueSatang: 1_000, expiresAt: new Date("2026-09-01T00:00:00Z") }
    expect(validateCoupon(c, { subtotalSatang: 10_000, now })).toEqual({ ok: false, reason: "expired" })
  })

  it("treats the exact expiry instant as expired (COUP-REQ-005)", () => {
    const c: Coupon = { ...base, kind: "fixed", valueSatang: 1_000, expiresAt: now }
    expect(validateCoupon(c, { subtotalSatang: 10_000, now })).toEqual({ ok: false, reason: "expired" })
  })

  it("rejects a subtotal below the minimum (COUP-REQ-006)", () => {
    const c: Coupon = { ...base, kind: "fixed", valueSatang: 1_000, minSubtotalSatang: 50_000 }
    expect(validateCoupon(c, { subtotalSatang: 49_999, now })).toEqual({ ok: false, reason: "below_minimum" })
    expect(validateCoupon(c, { subtotalSatang: 50_000, now }).ok).toBe(true)
  })

  it("caps a percent discount at maxDiscountSatang (COUP-REQ-004)", () => {
    const c: Coupon = { ...base, kind: "percent", percent: 10, maxDiscountSatang: 20_000 }
    expect(validateCoupon(c, { subtotalSatang: 500_000, now })).toEqual({ ok: true, discountSatang: 20_000 })
  })

  it("rejects a coupon that is used up (COUP-REQ-007)", () => {
    const c: Coupon = { ...base, kind: "fixed", valueSatang: 1_000, usageLimit: 10, usedCount: 10 }
    expect(validateCoupon(c, { subtotalSatang: 10_000, now })).toEqual({ ok: false, reason: "used_up" })
    expect(validateCoupon({ ...c, usedCount: 9 }, { subtotalSatang: 10_000, now }).ok).toBe(true)
  })
})
