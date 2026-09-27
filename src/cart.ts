import { products, type Product } from "./products.ts"

export type CartLine = { productId: string; qty: number }

export type PricedLine = {
  product: Product
  qty: number
  lineTotalSatang: number
}

export class CartError extends Error {}

const MAX_QTY = 99

/** Price every line of a cart. Throws CartError for unknown products or bad quantities. */
export function priceCart(lines: CartLine[]): { lines: PricedLine[]; subtotalSatang: number } {
  if (lines.length === 0) throw new CartError("cart is empty")

  const priced = lines.map((line) => {
    const product = products.get(line.productId)
    if (!product) throw new CartError(`unknown product: ${line.productId}`)
    if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > MAX_QTY) {
      throw new CartError(`qty must be an integer from 1 to ${MAX_QTY}`)
    }
    return { product, qty: line.qty, lineTotalSatang: product.priceSatang * line.qty }
  })

  const subtotalSatang = priced.reduce((sum, l) => sum + l.lineTotalSatang, 0)
  return { lines: priced, subtotalSatang }
}
