export type Coupon = {
  code: string
  kind: "fixed" | "percent"
  /** For kind "fixed": amount off in satang. */
  valueSatang?: number
  /** For kind "percent": whole percent off, 1–100. */
  percent?: number
  maxDiscountSatang?: number
  minSubtotalSatang: number
  expiresAt: Date
  usageLimit: number
  usedCount: number
}

const seed: Coupon[] = [
  { code: "WELCOME100", kind: "fixed", valueSatang: 10_000, minSubtotalSatang: 0, expiresAt: new Date("2027-01-01T00:00:00+07:00"), usageLimit: 1000, usedCount: 0 },
  { code: "SUMMER10", kind: "percent", percent: 10, maxDiscountSatang: 20_000, minSubtotalSatang: 50_000, expiresAt: new Date("2027-01-01T00:00:00+07:00"), usageLimit: 500, usedCount: 12 },
  { code: "EXPIRED5", kind: "percent", percent: 5, minSubtotalSatang: 0, expiresAt: new Date("2026-01-01T00:00:00+07:00"), usageLimit: 100, usedCount: 3 },
  { code: "LASTONE", kind: "fixed", valueSatang: 5_000, minSubtotalSatang: 0, expiresAt: new Date("2027-01-01T00:00:00+07:00"), usageLimit: 10, usedCount: 10 }
]

const coupons = new Map(seed.map((c) => [c.code, c]))

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

export function findCoupon(code: string): Coupon | undefined {
  return coupons.get(normalizeCode(code))
}

/** Discount in satang for a subtotal. Never more than the subtotal. */
export function discountFor(coupon: Coupon, subtotalSatang: number): number {
  const raw =
    coupon.kind === "fixed"
      ? (coupon.valueSatang ?? 0)
      : Math.floor((subtotalSatang * (coupon.percent ?? 0)) / 100)
  return Math.min(raw, subtotalSatang)
}

export class CouponError extends Error {
  constructor(readonly reason: string) {
    super(`coupon rejected: ${reason}`)
  }
}
