# Spec: คูปองส่วนลดตอน checkout

> Intent: docs/intent/coupon.md · Skills applied: security-baseline

## Requirements

| ID | Requirement | Acceptance criteria (testable) |
| -- | ----------- | ------------------------------ |
| COUP-REQ-001 | ใช้คูปองกับใบเสนอราคาได้ | `POST /checkout/quote` รับ `couponCode` (ไม่บังคับ) ถ้าใช้ได้ ตอบ `discountSatang` และ `totalSatang = subtotalSatang - discountSatang` |
| COUP-REQ-002 | คูปองแบบจำนวนเงินและแบบเปอร์เซ็นต์ | แบบ `fixed` ลดตาม `valueSatang` แบบ `percent` ลด `floor(subtotal × percent / 100)` |
| COUP-REQ-003 | ส่วนลดไม่เกินยอดสินค้า | `discountSatang ≤ subtotalSatang` เสมอ ยอดสุทธิไม่ติดลบ |
| COUP-REQ-004 | เพดานส่วนลดของคูปองเปอร์เซ็นต์ | ถ้ามี `maxDiscountSatang` ส่วนลดต้องไม่เกินค่านี้ |
| COUP-REQ-005 | คูปองหมดอายุใช้ไม่ได้ | ถ้า `now ≥ expiresAt` ปฏิเสธ |
| COUP-REQ-006 | ยอดขั้นต่ำ | ถ้า `subtotalSatang < minSubtotalSatang` ปฏิเสธ |
| COUP-REQ-007 | จำนวนครั้งที่ใช้ได้ | ถ้า `usedCount ≥ usageLimit` ปฏิเสธ |
| COUP-REQ-008 | ปฏิเสธแบบไม่บอกเหตุผลภายใน | โค้ดไม่มีอยู่ หมดอายุ หรือไม่ผ่านเงื่อนไข ได้ HTTP 422 และข้อความเดียวกัน `{"error":"coupon_not_applicable"}` |
| COUP-REQ-009 | จำกัดการลองโค้ดผิด | ลองโค้ดที่ใช้ไม่ได้เกิน 5 ครั้งใน 10 นาทีต่อ client (IP) ครั้งถัดไปได้ HTTP 429 จนครบช่วงเวลา |

## Design

- **Data model:** `Coupon = { code, kind: "fixed" | "percent", valueSatang?, percent?, maxDiscountSatang?, minSubtotalSatang, expiresAt, usageLimit, usedCount }` เก็บในหน่วยความจำที่ `src/coupons.ts` เหมือน `products.ts`
- **โค้ดคูปอง:** ตัดช่องว่างหัวท้ายและไม่สนตัวพิมพ์เล็กใหญ่ (`summer10` = `SUMMER10`)
- **Logic:** `validateCoupon(coupon, { subtotalSatang, now })` คืน `{ ok: true, discountSatang }` หรือ `{ ok: false, reason }` โดย `reason` ใช้ภายในและใน test เท่านั้น ไม่ส่งกลับให้ client
- **API:** `POST /checkout/quote` body `{ items, couponCode? }` ตอบเหมือนเดิม และเพิ่ม `couponCode` ที่ใช้จริงเมื่อสำเร็จ
- **Rate limit:** `src/rate-limit.ts` นับความล้มเหลวต่อ key (IP) ในหน้าต่างเวลา 10 นาที เวลาส่งเข้ามาเป็นพารามิเตอร์เพื่อให้ test ได้
- **ไฟล์ที่แตะ:** `src/coupons.ts` (ใหม่), `src/rate-limit.ts` (ใหม่), `src/checkout.ts`, `src/app.ts`, `src/server.ts` (ส่ง IP), tests ที่เกี่ยวข้อง

## Edge cases

1. `couponCode` เป็นสตริงว่างหรือมีแต่ช่องว่าง: ถือว่าไม่ได้ใส่คูปอง
2. ส่วนลดแบบ fixed มากกว่ายอดสินค้า: ลดเท่ายอดสินค้า ยอดสุทธิเป็น 0
3. เปอร์เซ็นต์ที่ได้เศษสตางค์: ปัดลง
4. หมดอายุตรงวินาทีนั้นพอดี (`now = expiresAt`): ถือว่าหมดอายุ
5. ยอดเท่ากับยอดขั้นต่ำพอดี: ใช้ได้
6. `usedCount = usageLimit - 1`: ยังใช้ได้
7. ลองโค้ดผิดครบ 5 ครั้งแล้วลองโค้ดที่ถูก: ยังได้ 429 จนครบ 10 นาที
8. `couponCode` ไม่ใช่สตริง: 400 เหมือน body ผิดรูปแบบอื่น

## Out of scope

- การสั่งซื้อจริงและการเพิ่ม `usedCount` (รอบนี้มีแค่ใบเสนอราคา)
- คืนสิทธิ์คูปองเมื่อยกเลิกออเดอร์
- หน้าจัดการคูปองของแอดมิน
- ใช้หลายคูปองในออเดอร์เดียว

## Risks

- ถ้าคิดส่วนลดผิด ร้านเสียเงินทุกออเดอร์ที่ใช้คูปอง จึงต้องมี test ของทุกกติกา
- ถ้าข้อความตอบกลับต่างกันตามเหตุผล คนนอกจะใช้แยกโค้ดจริงออกจากโค้ดมั่วได้
