import { describe, expect, it } from "vitest"
import { quote } from "../src/checkout.ts"
import { formatBaht } from "../src/money.ts"

describe("quote", () => {
  it("returns subtotal = total with no discount", () => {
    const q = quote({ items: [{ productId: "hoodie", qty: 1 }] })
    expect(q.subtotalSatang).toBe(129_000)
    expect(q.discountSatang).toBe(0)
    expect(q.totalSatang).toBe(129_000)
  })
})

describe("formatBaht", () => {
  it("formats satang as baht", () => {
    expect(formatBaht(123_450)).toBe("฿1,234.50")
    expect(formatBaht(9_900)).toBe("฿99.00")
  })
})

describe("quote with a coupon", () => {
  it("lowers the total by the coupon discount (COUP-REQ-001)", () => {
    const q = quote({ items: [{ productId: "tee-black", qty: 1 }], couponCode: "welcome100" })
    expect(q.discountSatang).toBe(10_000)
    expect(q.totalSatang).toBe(35_000)
    expect(q.couponCode).toBe("WELCOME100")
  })

  it("treats a blank coupon code as no coupon", () => {
    expect(quote({ items: [{ productId: "mug", qty: 1 }], couponCode: "   " }).discountSatang).toBe(0)
  })

  it("rejects an unknown coupon", () => {
    expect(() => quote({ items: [{ productId: "mug", qty: 1 }], couponCode: "NOPE" })).toThrow(/coupon rejected/)
  })
})
