# AI Coding with Claude: repo ตัวอย่าง

ร้านค้าออนไลน์ขนาดเล็กที่ใช้ในคอร์ส [AI Coding with Claude](https://academy.codepassion.co/courses/ai-coding-with-claude/) ของ CodePassion Academy
ในคลาสเราจะเพิ่ม**ระบบคูปองส่วนลดตอน checkout** ให้ repo นี้ ตั้งแต่ขั้นวางแผนจนถึงตั้งด่านตรวจอัตโนมัติ
ขั้นตอนทั้งหมดอยู่ใน [Workshop Guide](https://academy.codepassion.co/courses/ai-coding-with-claude/workshop-guide)

## เริ่มใช้

ต้องมี Node.js 22 ขึ้นไป

```bash
git clone https://github.com/codepassion-academy/ai-coding-with-claude.git
cd ai-coding-with-claude
npm install
npm test        # รัน test ทั้งหมด
npm run lint    # เช็ก type ด้วย tsc
npm run dev     # เปิด server ที่ http://localhost:3000
```

ลองขอราคา

```bash
curl -X POST localhost:3000/checkout/quote \
  -H 'content-type: application/json' \
  -d '{"items":[{"productId":"tee-black","qty":2}]}'
```

## มีอะไรใน repo

| ไฟล์ | หน้าที่ |
| ---- | ------- |
| `src/products.ts` | สินค้าในร้าน (เก็บในหน่วยความจำ) |
| `src/cart.ts` | คิดราคาแต่ละบรรทัดในตะกร้าและยอดรวม |
| `src/checkout.ts` | สร้างใบเสนอราคา (quote) ตอนนี้ยังไม่มีส่วนลด |
| `src/app.ts` | routing ของ API แยกจาก `node:http` เพื่อให้ test ง่าย |
| `src/server.ts` | HTTP server |
| `tests/` | test ด้วย vitest |

กติกาที่ใช้ทั้ง repo: **เงินเก็บเป็นจำนวนเต็มหน่วยสตางค์เสมอ** (1 บาท = 100 สตางค์) ไม่ใช้ทศนิยม

## Branch

- `main` จุดเริ่มต้นของคลาส ยังไม่มีคูปอง
- `class-demo` ผลลัพธ์ที่ทำในคลาสครบทุกขั้น มี tag ตามจุดตรวจ ใช้เทียบกับงานของตัวเอง หรือข้ามไปเมื่อตามไม่ทัน

| Tag | ได้อะไรเพิ่ม | Workshop |
| --- | ------------ | -------- |
| `cp1-intent` | `docs/intent/coupon.md` | W1 |
| `cp2-spec` | Skill `security-baseline` และ `docs/specs/coupon.md` | W2 |
| `cp3-claude-md` | `CLAUDE.md` | W3 |
| `cp4-plan` | `docs/plans/coupon.md` | W4 |
| `cp5-loop` | คูปองแบบลดเป็นจำนวนเงินและเปอร์เซ็นต์ ผ่าน API | W5 |
| `cp6-tdd` | กติกาหมดอายุ ยอดขั้นต่ำ เพดานส่วนลด และจำนวนครั้ง | W6 |
| `cp7-review` | `REVIEW.md` และการจำกัดจำนวนครั้งที่ลองโค้ดผิด | W7 |
| `cp8-hooks` | hook กันไม่ให้ Claude แก้ไฟล์ test | W8 |

```bash
git fetch --tags
git switch -c my-try cp4-plan   # เริ่มทำต่อจากจุดที่ต้องการ
```
