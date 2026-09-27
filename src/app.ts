import { CartError } from "./cart.ts"
import { quote, type CheckoutRequest } from "./checkout.ts"
import { CouponError } from "./coupons.ts"
import { products } from "./products.ts"
import { FailureLimiter } from "./rate-limit.ts"

export type Response = { status: number; body: unknown }

export type Context = { now: Date; ip: string }

const COUPON_REJECTED = { error: "coupon_not_applicable" }

/** Build a request handler. Kept free of node:http so it is easy to test. */
export function createApp(limiter = new FailureLimiter()) {
  return function handle(method: string, path: string, body: unknown, ctx: Context = { now: new Date(), ip: "local" }): Response {
    if (method === "GET" && path === "/products") {
      return { status: 200, body: [...products.values()] }
    }

    if (method === "POST" && path === "/checkout/quote") {
      if (!isCheckoutRequest(body)) return { status: 400, body: { error: "items must be an array of { productId, qty }; couponCode must be a string" } }
      if (body.couponCode?.trim() && limiter.isBlocked(ctx.ip, ctx.now)) {
        return { status: 429, body: { error: "too_many_attempts" } }
      }
      try {
        const q = quote(body, ctx.now)
        return {
          status: 200,
          body: {
            lines: q.lines.map((l) => ({ productId: l.product.id, qty: l.qty, lineTotalSatang: l.lineTotalSatang })),
            subtotalSatang: q.subtotalSatang,
            discountSatang: q.discountSatang,
            totalSatang: q.totalSatang,
            ...(q.couponCode ? { couponCode: q.couponCode } : {})
          }
        }
      } catch (err) {
        if (err instanceof CartError) return { status: 400, body: { error: err.message } }
        if (err instanceof CouponError) {
          limiter.recordFailure(ctx.ip, ctx.now)
          return { status: 422, body: COUPON_REJECTED }
        }
        throw err
      }
    }

    return { status: 404, body: { error: "not found" } }
  }
}

export const handle = createApp()

function isCheckoutRequest(body: unknown): body is CheckoutRequest {
  if (typeof body !== "object" || body === null) return false
  const { items, couponCode } = body as { items?: unknown; couponCode?: unknown }
  if (couponCode !== undefined && typeof couponCode !== "string") return false
  return (
    Array.isArray(items) &&
    items.every((i) => typeof i === "object" && i !== null && typeof i.productId === "string" && typeof i.qty === "number")
  )
}
