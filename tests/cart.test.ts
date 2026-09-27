import { describe, expect, it } from "vitest"
import { CartError, priceCart } from "../src/cart.ts"

describe("priceCart", () => {
  it("sums line totals in satang", () => {
    const { subtotalSatang, lines } = priceCart([
      { productId: "tee-black", qty: 2 },
      { productId: "sticker-pack", qty: 1 }
    ])
    expect(lines.map((l) => l.lineTotalSatang)).toEqual([90_000, 9_900])
    expect(subtotalSatang).toBe(99_900)
  })

  it("rejects an empty cart", () => {
    expect(() => priceCart([])).toThrow(CartError)
  })

  it("rejects unknown products", () => {
    expect(() => priceCart([{ productId: "nope", qty: 1 }])).toThrow(/unknown product/)
  })

  it.each([0, -1, 1.5, 100])("rejects qty %s", (qty) => {
    expect(() => priceCart([{ productId: "mug", qty }])).toThrow(/qty/)
  })
})
