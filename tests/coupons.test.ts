import { describe, expect, it } from "vitest"
import { discountFor, findCoupon, type Coupon } from "../src/coupons.ts"

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
