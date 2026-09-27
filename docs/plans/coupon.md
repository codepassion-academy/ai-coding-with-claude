# Plan: คูปองส่วนลดตอน checkout

> Spec: docs/specs/coupon.md · Branch: feat/coupon

## Steps

- [x] 1. Tracer bullet: คูปองแบบ fixed วิ่งผ่าน API → quote → coupon store
  - Files: `src/coupons.ts` (ใหม่), `src/checkout.ts`, `src/app.ts`
  - Test first: quote with a fixed coupon lowers the total (COUP-REQ-001) · API returns discount (COUP-REQ-001)
- [x] 2. คูปองแบบเปอร์เซ็นต์ และส่วนลดไม่เกินยอดสินค้า
  - Files: `src/coupons.ts`
  - Test first: percent rounds down (COUP-REQ-002) · fixed larger than subtotal caps at subtotal (COUP-REQ-003)
- [x] 3. กติกาของคูปองใน `validateCoupon`: เพดาน หมดอายุ ยอดขั้นต่ำ จำนวนครั้ง
  - Files: `src/coupons.ts`, `src/checkout.ts` (ส่ง `now`)
  - Test first: cap (COUP-REQ-004) · expired incl. exact boundary (COUP-REQ-005) · min subtotal (COUP-REQ-006) · usage limit (COUP-REQ-007)
- [ ] 4. ปฏิเสธด้วยข้อความเดียว และจำกัดการลองโค้ดผิด
  - Files: `src/rate-limit.ts` (ใหม่), `src/app.ts`, `src/server.ts`
  - Test first: every rejection gives the same 422 body (COUP-REQ-008) · 6th failure in 10 min gives 429 (COUP-REQ-009)

## Risks / unknowns

- Rate limit อยู่ในหน่วยความจำ ถ้ารันหลาย instance จะนับแยกกัน (รับได้สำหรับรอบนี้ บันทึกไว้)
- IP หลัง proxy อาจเป็น IP ของ proxy (ยังไม่แก้ในรอบนี้)

## Decisions made while building

<!-- Append as you go: what changed from the plan, and why. -->

- Step 3: `handle` in `src/app.ts` also takes a context `{ now }` so API tests can control time (not in the plan's file list).
