import { describe, expect, it } from "vitest"
import { createApp, handle } from "../src/app.ts"

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

describe("handle with a coupon", () => {
  it("returns the discount and the coupon used (COUP-REQ-001)", () => {
    const res = handle("POST", "/checkout/quote", { items: [{ productId: "hoodie", qty: 1 }], couponCode: "SUMMER10" }, { now: new Date("2026-09-30T12:00:00Z"), ip: "1.1.1.1" })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ subtotalSatang: 129_000, discountSatang: 12_900, totalSatang: 116_100, couponCode: "SUMMER10" })
  })

  it("returns 400 when couponCode is not a string", () => {
    expect(handle("POST", "/checkout/quote", { items: [{ productId: "mug", qty: 1 }], couponCode: 42 }).status).toBe(400)
  })

  it("returns 422 for an expired coupon", () => {
    expect(handle("POST", "/checkout/quote", { items: [{ productId: "mug", qty: 1 }], couponCode: "EXPIRED5" }, { now: new Date("2026-09-30T12:00:00Z"), ip: "1.1.1.1" }).status).toBe(422)
  })

  it("returns 422 for a coupon that cannot be used", () => {
    expect(handle("POST", "/checkout/quote", { items: [{ productId: "mug", qty: 1 }], couponCode: "NOPE" }).status).toBe(422)
  })
})

describe("coupon rejections and rate limit (step 4)", () => {
  const items = [{ productId: "mug", qty: 1 }]
  const at = (minute: number) => ({ now: new Date(Date.UTC(2026, 8, 30, 12, minute)), ip: "9.9.9.9" })

  it("gives every rejection the same 422 body (COUP-REQ-008)", () => {
    const app = createApp()
    const bodies = ["NOPE", "EXPIRED5", "LASTONE"].map((couponCode) => app("POST", "/checkout/quote", { items, couponCode }, at(0)))
    expect(bodies.map((b) => b.status)).toEqual([422, 422, 422])
    expect(new Set(bodies.map((b) => JSON.stringify(b.body))).size).toBe(1)
  })

  it("blocks the 6th failed attempt within 10 minutes (COUP-REQ-009)", () => {
    const app = createApp()
    for (let i = 0; i < 5; i++) expect(app("POST", "/checkout/quote", { items, couponCode: "NOPE" }, at(i)).status).toBe(422)
    expect(app("POST", "/checkout/quote", { items, couponCode: "WELCOME100" }, at(5)).status).toBe(429)
  })

  it("allows coupons again once the window has passed (COUP-REQ-009)", () => {
    const app = createApp()
    for (let i = 0; i < 5; i++) app("POST", "/checkout/quote", { items, couponCode: "NOPE" }, at(0))
    expect(app("POST", "/checkout/quote", { items, couponCode: "WELCOME100" }, at(11)).status).toBe(200)
  })

  it("does not rate-limit quotes without a coupon", () => {
    const app = createApp()
    for (let i = 0; i < 5; i++) app("POST", "/checkout/quote", { items, couponCode: "NOPE" }, at(0))
    expect(app("POST", "/checkout/quote", { items }, at(1)).status).toBe(200)
  })
})
