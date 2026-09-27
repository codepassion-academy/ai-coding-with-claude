import { describe, expect, it } from "vitest"
import { handle } from "../src/app.ts"

describe("handle", () => {
  it("lists products", () => {
    const res = handle("GET", "/products", undefined)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it("quotes a cart", () => {
    const res = handle("POST", "/checkout/quote", { items: [{ productId: "mug", qty: 2 }] })
    expect(res).toEqual({
      status: 200,
      body: { lines: [{ productId: "mug", qty: 2, lineTotalSatang: 58_000 }], subtotalSatang: 58_000, discountSatang: 0, totalSatang: 58_000 }
    })
  })

  it("returns 400 for a bad body", () => {
    expect(handle("POST", "/checkout/quote", { items: "x" }).status).toBe(400)
  })

  it("returns 400 for an unknown product", () => {
    expect(handle("POST", "/checkout/quote", { items: [{ productId: "nope", qty: 1 }] }).status).toBe(400)
  })

  it("returns 404 for unknown routes", () => {
    expect(handle("GET", "/nope", undefined).status).toBe(404)
  })
})
