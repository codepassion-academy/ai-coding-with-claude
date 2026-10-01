---
status: accepted
---

# Deploy เป็น demo บน Cloudflare Workers (Free plan) เก็บรายงานใน Durable Object และ deploy อัตโนมัติจาก `main` ด้วย GitHub Actions

เดิม intent กำหนดให้รันในเครื่องเท่านั้นและเก็บรายงานใน memory ตอนนี้ต้องการ URL ที่ผู้เรียนเปิดดูได้และอัปเดตเองทุกครั้งที่ `main` เปลี่ยน จึง deploy ขึ้น Cloudflare Workers ในฐานะ **demo สำหรับสอน**: URL สาธารณะบน `*.workers.dev` ไม่ประชาสัมพันธ์ให้ประชาชน ยังเป็นข้อมูลสมมติและมี `NOTICE` ทุก response งบ 0 บาท (Free plan) ข้อเท็จจริงของ Cloudflare ที่ใช้ตัดสินอยู่ใน [`docs/research/cloudflare-workers-hosting.md`](../research/cloudflare-workers-hosting.md) (ตรวจเมื่อ 2026-10-01)

## Decisions

- **Runtime:** เพิ่ม `src/worker.ts` เป็น adapter `fetch` → `handle()` ไม่ใช้ `node:http` บน Worker `src/server.ts` คงไว้สำหรับ `npm run dev` ไฟล์หน้าเว็บใน `public/` เสิร์ฟด้วย Workers Static Assets (ยกเว้น `public/tiles/` ผ่าน `.assetsignore`) CSP ตั้งให้ตรงกับ `src/static.ts` path ที่ไม่ใช่ไฟล์ต้องตกถึง Worker เพื่อให้ 404 มี `NOTICE`
- **ที่เก็บรายงานและ rate limiter:** Durable Object ตัวเดียว (SQLite backend ซึ่งเป็นแบบเดียวที่ Free plan ใช้ได้) ทุก POST และ GET รายงานผ่าน object นี้ จึงเรียงทีละ request เหมือน `handle()` แบบ sync เดิม ยังลบของหมดอายุแบบ lazy ตาม RPT-REQ-012 แต่ข้อมูลอยู่รอดเมื่อ object ถูกปิด
- **Client key:** บน Worker อ่านจาก header `CF-Connecting-IP` เท่านั้น ห้ามอ่าน `X-Forwarded-For`/`Forwarded` normalize แบบเดิม (IPv4-mapped, IPv6 /64) แล้ว HMAC-SHA-256 ด้วย secret (`wrangler secret`) ก่อนส่งเข้า Durable Object IP ดิบจึงไม่ถูกเขียนลง SQLite ไม่มี header → bucket `"unknown"` (fail closed) ตอน dev ในเครื่องยังใช้ socket address
- **ไฟล์ tiles:** `public/tiles/bangkok.pmtiles` (44.5 MiB) อยู่ใน git แต่เกินเพดาน 25 MiB ต่อไฟล์ของ Static Assets จึงเก็บใน R2 และให้ Worker อ่านด้วย `get(key, { range })` แล้วตอบ `206` เองบน origin เดียวกัน ADR 0001 ข้อ "ไม่โหลดจากโดเมนอื่น" และ CSP จึงไม่เปลี่ยน
- **Auto-deploy:** GitHub Actions เมื่อ push เข้า `main`: `npm ci` → `npm run lint` → `npm test` ผ่านก่อนจึง `cloudflare/wrangler-action` deploy อัปโหลด tiles ขึ้น R2 เฉพาะ commit ที่ `public/tiles/**` เปลี่ยน secrets: `CLOUDFLARE_API_TOKEN` (สิทธิ์แก้ Workers + เขียน R2) และ `CLOUDFLARE_ACCOUNT_ID` ไม่ทำ preview deploy ต่อ branch หรือ PR เพราะจะใช้ Durable Object และ R2 ชุดเดียวกับ production
- **POST เปิดให้ทุกคน** ใช้ rate limit 5 รายงาน/ชม./client ตาม RPT-REQ-008

## Considered Options

- **Workers Builds (Git integration ของ Cloudflare):** ไม่ต้องเก็บ secret ใน GitHub แต่ยังไม่มี docs ยืนยันว่า build command ที่ fail จะหยุด deploy และผู้เรียนมองไม่เห็นขั้นตอน test ใน repo ไม่เลือก
- **Cloudflare Pages:** Cloudflare แนะนำให้โปรเจกต์ใหม่ใช้ Workers ไม่เลือก
- **`node:http` ผ่าน `httpServerHandler` (nodejs_compat):** ใช้ `server.ts` เดิมได้ แต่ `req.socket.remoteAddress` ยังไม่ยืนยันว่ามีค่า และ `static.ts` อ่านไฟล์จากดิสก์ไม่ได้อยู่ดี ส่วน `handle()` ไม่ผูกกับ `node:http` อยู่แล้ว ไม่เลือก
- **`Map` ใน memory ตามเดิม:** แต่ละ isolate ไม่แชร์ memory และถูกปิดทิ้งได้ตลอด รายงานจะหายหรือแยกกัน และเลี่ยง rate limit ได้ง่าย ไม่เลือก
- **Durable Object ที่เก็บแค่ใน memory:** แก้โค้ดน้อยที่สุด แต่ object ที่ว่างถูกปิดภายในไม่กี่นาที รายงานจะหายแทบทุกครั้งที่ผู้เรียนเปิดดู ไม่เลือก
- **D1:** ต้องทำ migration และคุม dedupe/โควตาที่เขียนพร้อมกันเอง ไม่เลือก
- **KV:** eventually consistent และเขียนได้ 1,000 ครั้ง/วันบน Free ไม่เลือก
- **`ratelimit` binding:** นับแยกตาม location แบบคร่าวๆ ตั้งช่วงได้แค่ 10 หรือ 60 วินาที แทน 5/ชม. ของ spec ไม่ได้ ไม่เลือก
- **R2 ผ่าน custom domain หรือ r2.dev:** ไม่กินโควตา Worker แต่ต้องมีโดเมนแยก แก้ CSP และตั้ง CORS ส่วน r2.dev มี rate limit สำหรับ dev เท่านั้น ไม่เลือก

## Consequences

- **แก้ intent และ spec:** intent "ไม่ deploy" และ "ไม่มี DB ภายนอก" เปลี่ยนเป็น demo ตาม ADR นี้ RPT-REQ-009 (ที่มาของ client key) และ RPT-REQ-012 / E24 (ไม่มี persistence) มีหมายเหตุอ้าง ADR นี้ ส่วน Q8 ของ intent (PDPA, host และงบสำหรับเปิดให้ประชาชนใช้จริง) **ยังเปิดอยู่** ADR นี้ไม่ใช่การอนุญาตให้เปิดให้ประชาชน
- **ต้องอัปเดต ADR 0001 / CLAUDE.md / README:** ไฟล์ tiles อยู่ใน git แล้ว (ดู amendment ใน ADR 0001) แต่ CLAUDE.md และ README ยังบอกว่า gitignored
- **CPU 10 ms ต่อ request บน Free plan เป็นความเสี่ยงหลัก:** วัดใน Node ที่ store เต็ม 1000 รายงาน (2026-10-01): `GET /basin/reports` เดิม 7.5 ms เพราะ purge และ sort ทีละอำเภอ จึงแก้เป็นรอบเดียว เหลือ 0.75 ms, POST + บันทึก snapshot 0.55 ms, โหลด snapshot 0.8 ms snapshot เต็มขนาด 450 KB ต่ำกว่าเพดาน 2 MB ต่อแถว ถ้าเกินจริงบน Cloudflare ให้กลับมาทบทวนเรื่องงบ ไม่ขึ้น Paid เอง
- **ทุก request นับรวมใน 100k request/วันของ Worker รวมไฟล์หน้าเว็บ:** ใช้ `run_worker_first` เพื่อให้รายการไฟล์ตายตัวใน `src/static-files.ts` เป็นทางเดียวที่เข้าถึงไฟล์ได้ ข้อ "static assets ฟรีไม่จำกัด" ใน research จึงไม่ใช้กับ repo นี้
- **Workers Logs ปิดไว้ (`observability.enabled: false`):** log ของ Cloudflare บันทึกรายละเอียด request ซึ่งอาจมี IP ขัดกับ RPT-REQ-013
- **Tile range request ก็นับรวมใน 100k request/วันเช่นกัน:** แผนที่หนึ่งครั้งยิงหลายสิบ request พอสำหรับ demo ถ้าคนเข้ามากขึ้นให้พิจารณา R2 custom domain ใหม่
- **`CF-Connecting-IP` ถูก Cloudflare เขียนทับเสมอหรือไม่ ยังไม่มี docs ยืนยัน:** ต้องมี test ที่ยืนยันว่าส่ง header นี้ปลอมแล้วไม่เปลี่ยนโควตาบน URL ที่ deploy จริง
- **HMAC secret:** หมุน secret แล้วโควตาเดิมทั้งหมดถูกรีเซ็ต ยอมรับได้
- **ทดสอบหลัง deploy ยิง POST ไปที่ URL ของเราเองเท่านั้น** ห้ามแตะ `flood-api.rooptanjai.com`
