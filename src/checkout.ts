import { priceCart, type CartLine, type PricedLine } from "./cart.ts"
import { CouponError, discountFor, findCoupon } from "./coupons.ts"

export type Quote = {
  lines: PricedLine[]
  subtotalSatang: number
  discountSatang: number
  totalSatang: number
  couponCode?: string
}

export type CheckoutRequest = {
  items: CartLine[]
  couponCode?: string
}

/** Build a price quote for a cart, applying a coupon when one is given. */
export function quote(req: CheckoutRequest): Quote {
  const { lines, subtotalSatang } = priceCart(req.items)

  const code = req.couponCode?.trim()
  if (!code) return { lines, subtotalSatang, discountSatang: 0, totalSatang: subtotalSatang }

  const coupon = findCoupon(code)
  if (!coupon) throw new CouponError("unknown")

  const discountSatang = discountFor(coupon, subtotalSatang)
  return { lines, subtotalSatang, discountSatang, totalSatang: subtotalSatang - discountSatang, couponCode: coupon.code }
}
