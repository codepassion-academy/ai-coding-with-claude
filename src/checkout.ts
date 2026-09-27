import { priceCart, type CartLine, type PricedLine } from "./cart.ts"

export type Quote = {
  lines: PricedLine[]
  subtotalSatang: number
  discountSatang: number
  totalSatang: number
}

export type CheckoutRequest = {
  items: CartLine[]
}

/** Build a price quote for a cart. No discounts yet. */
export function quote(req: CheckoutRequest): Quote {
  const { lines, subtotalSatang } = priceCart(req.items)
  const discountSatang = 0
  return { lines, subtotalSatang, discountSatang, totalSatang: subtotalSatang - discountSatang }
}
