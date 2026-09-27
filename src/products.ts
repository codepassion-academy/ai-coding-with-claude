export type Product = {
  id: string
  name: string
  /** Price in satang (1 baht = 100 satang). Money is always an integer. */
  priceSatang: number
}

export const products: ReadonlyMap<string, Product> = new Map(
  [
    { id: "tee-black", name: "เสื้อยืด CodePassion สีดำ", priceSatang: 45_000 },
    { id: "mug", name: "แก้วกาแฟ >_", priceSatang: 29_000 },
    { id: "sticker-pack", name: "สติกเกอร์ 10 ชิ้น", priceSatang: 9_900 },
    { id: "hoodie", name: "ฮู้ดดี้ AI Engineer", priceSatang: 129_000 }
  ].map((p) => [p.id, p])
)
