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

/** Discount in satang for a subtotal. Respects the coupon's cap and never exceeds the subtotal. */
export function discountFor(coupon: Coupon, subtotalSatang: number): number {
  const raw =
    coupon.kind === "fixed"
      ? (coupon.valueSatang ?? 0)
      : Math.floor((subtotalSatang * (coupon.percent ?? 0)) / 100)
  const capped = coupon.maxDiscountSatang === undefined ? raw : Math.min(raw, coupon.maxDiscountSatang)
  return Math.min(capped, subtotalSatang)
}

export type RejectReason = "unknown" | "expired" | "below_minimum" | "used_up"

export type Validation = { ok: true; discountSatang: number } | { ok: false; reason: RejectReason }

/** Check a coupon's rules for this cart. `reason` is for logs and tests only, never for clients. */
export function validateCoupon(coupon: Coupon, ctx: { subtotalSatang: number; now: Date }): Validation {
  if (ctx.now.getTime() >= coupon.expiresAt.getTime()) return { ok: false, reason: "expired" }
  if (ctx.subtotalSatang < coupon.minSubtotalSatang) return { ok: false, reason: "below_minimum" }
  if (coupon.usedCount >= coupon.usageLimit) return { ok: false, reason: "used_up" }
  return { ok: true, discountSatang: discountFor(coupon, ctx.subtotalSatang) }
}

export class CouponError extends Error {
  constructor(readonly reason: RejectReason) {
    super(`coupon rejected: ${reason}`)
  }
}
