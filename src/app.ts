import { CartError } from "./cart.ts"
import { quote, type CheckoutRequest } from "./checkout.ts"
import { products } from "./products.ts"

export type Response = { status: number; body: unknown }

/** Route one request. Kept free of node:http so it is easy to test. */
export function handle(method: string, path: string, body: unknown): Response {
  if (method === "GET" && path === "/products") {
    return { status: 200, body: [...products.values()] }
  }

  if (method === "POST" && path === "/checkout/quote") {
    if (!isCheckoutRequest(body)) return { status: 400, body: { error: "items must be an array of { productId, qty }" } }
    try {
      const q = quote(body)
      return {
        status: 200,
        body: {
          lines: q.lines.map((l) => ({ productId: l.product.id, qty: l.qty, lineTotalSatang: l.lineTotalSatang })),
          subtotalSatang: q.subtotalSatang,
          discountSatang: q.discountSatang,
          totalSatang: q.totalSatang
        }
      }
    } catch (err) {
      if (err instanceof CartError) return { status: 400, body: { error: err.message } }
      throw err
    }
  }

  return { status: 404, body: { error: "not found" } }
}

function isCheckoutRequest(body: unknown): body is CheckoutRequest {
  if (typeof body !== "object" || body === null) return false
  const items = (body as { items?: unknown }).items
  return (
    Array.isArray(items) &&
    items.every((i) => typeof i === "object" && i !== null && typeof i.productId === "string" && typeof i.qty === "number")
  )
}
