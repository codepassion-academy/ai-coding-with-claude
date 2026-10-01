# น้ำท่วมไหม: repo ตัวอย่างของคอร์ส AI Coding with Claude

> **ตัวอย่างเพื่อการเรียนเท่านั้น ไม่ใช่ประกาศเตือนภัยทางการ**
> ข้อมูลระดับน้ำใน repo นี้เป็นข้อมูลสมมติ อย่าใช้ตัดสินใจเรื่องความปลอดภัย
> ติดตามสถานการณ์น้ำจริงจากประกาศของกรุงเทพมหานครและหน่วยงานรัฐ

แอปเล็กๆ ที่ใช้ในคอร์ส [AI Coding with Claude](https://academy.codepassion.co/courses/ai-coding-with-claude/) ของ CodePassion Academy
ตอนนี้แอปแสดงรายชื่อเขตและระดับน้ำล่าสุดของสถานีวัดในเขตนั้น (จากข้อมูลที่บันทึกไว้)
ในคลาสเราจะเพิ่มฟีเจอร์**ให้คนในพื้นที่รายงานจุดน้ำท่วม** ตั้งแต่ขั้นวางแผนจนถึงตั้งด่านตรวจอัตโนมัติ
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

ลองเรียก

```bash
curl localhost:3000/districts
curl localhost:3000/districts/lat-phrao
```

## มีอะไรใน repo

| ไฟล์ | หน้าที่ |
| ---- | ------- |
| `src/districts.ts` | เขตในกรุงเทพฯ ที่ใช้ในคลาส (12 จาก 50 เขต) |
| `src/stations.ts` | สถานีวัดระดับน้ำ อ่านจาก `data/stations.json` |
| `data/stations.json` | ระดับน้ำสมมติที่บันทึกไว้ ไม่ใช่ค่าจริง |
| `src/time.ts` | แสดงเวลาเป็นเวลากรุงเทพฯ |
| `src/app.ts` | routing ของ API แยกจาก `node:http` เพื่อให้ test ง่าย |
| `src/server.ts` | HTTP server |
| `tests/` | test ด้วย vitest |

กติกาที่ใช้ทั้ง repo

- ความลึกและระดับน้ำเป็น**จำนวนเต็มหน่วยเซนติเมตร**
- เวลา**เก็บเป็น UTC** และแสดงเป็นเวลากรุงเทพฯ (UTC+7)

## Branch

- `main` จุดเริ่มต้นของคลาส ยังไม่มีการรายงานน้ำท่วม
- `class-demo` ผลลัพธ์ที่ทำในคลาสครบทุกขั้น มี tag ตามจุดตรวจ ใช้เทียบกับงานของตัวเอง หรือข้ามไปเมื่อตามไม่ทัน
- `example/coupon` โจทย์เดิม (ระบบคูปองส่วนลด) เก็บไว้เป็นตัวอย่าง มี tag `coupon-cp1-intent` ถึง `coupon-cp8-hooks`

| Tag | ได้อะไรเพิ่ม | Workshop |
| --- | ------------ | -------- |
| `cp1-intent` | `docs/intent/flood-reports.md` | W1 |
| `cp2-spec` | Skill `security-baseline` และ `docs/specs/flood-reports.md` | W2 |
| `cp3-claude-md` | `CLAUDE.md` | W3 |
| `cp4-plan` | `docs/plans/flood-reports.md` | W4 |
| `cp5-loop` | รับรายงานผ่าน API และคำนวณระดับความรุนแรง | W5 |
| `cp6-tdd` | ตรวจข้อมูล รวมรายงานซ้ำ และรายงานหมดอายุ | W6 |
| `cp7-review` | `REVIEW.md` จำกัดจำนวนรายงาน และปิดเบอร์โทรที่หลุดลง log | W7 |
| `cp8-hooks` | hook กันไม่ให้ Claude แก้ไฟล์ test และกันการส่งข้อมูลไปที่ระบบรายงานน้ำท่วมจริง | W8 |

```bash
git fetch --tags
git switch -c my-try cp4-plan   # เริ่มทำต่อจากจุดที่ต้องการ
```

## Demo ออนไลน์ (อ่านอย่างเดียว)

`src/worker.ts` ห่อแอปที่เสร็จแล้วให้รันบน Cloudflare Workers เป็น demo สาธารณะ ข้อมูลเป็นรายงานสมมติที่สร้างใหม่ทุก request และ**ไม่รับการเขียน** (POST ได้ 405) เพื่อไม่ให้ endpoint สาธารณะเก็บเบอร์โทรหรือโดนสแปม ถ้าอยากลองส่งรายงาน ให้รัน `npm run dev` ในเครื่อง

ผู้สอน deploy ด้วย

```bash
npx wrangler login
npx wrangler deploy
```

demo นี้ไม่ส่งข้อมูลไปที่ระบบรายงานน้ำท่วมจริงใดๆ
