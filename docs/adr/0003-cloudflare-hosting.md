---
status: accepted
---

# Deploy เป็น demo บน Cloudflare Workers (Free plan) เก็บรายงานใน Durable Object และ deploy อัตโนมัติจาก `main` ด้วย Workers Builds

เดิม intent กำหนดให้รันในเครื่องเท่านั้นและเก็บรายงานใน memory ตอนนี้ต้องการ URL ที่ผู้เรียนเปิดดูได้และอัปเดตเองทุกครั้งที่ `main` เปลี่ยน จึง deploy ขึ้น Cloudflare Workers ในฐานะ **demo สำหรับสอน**: URL สาธารณะบน `*.workers.dev` ไม่ประชาสัมพันธ์ให้ประชาชน ยังเป็นข้อมูลสมมติและมี `NOTICE` ทุก response งบ 0 บาท (Free plan) ข้อเท็จจริงของ Cloudflare ที่ใช้ตัดสินอยู่ใน [`docs/research/cloudflare-workers-hosting.md`](../research/cloudflare-workers-hosting.md) (ตรวจเมื่อ 2026-10-01)

## Decisions

- **Runtime:** เพิ่ม `src/worker.ts` เป็น adapter `fetch` → `handle()` ไม่ใช้ `node:http` บน Worker `src/server.ts` คงไว้สำหรับ `npm run dev` ไฟล์หน้าเว็บใน `public/` เสิร์ฟด้วย Workers Static Assets (ยกเว้น `public/tiles/` ผ่าน `.assetsignore`) CSP ตั้งให้ตรงกับ `src/static.ts` path ที่ไม่ใช่ไฟล์ต้องตกถึง Worker เพื่อให้ 404 มี `NOTICE`
- **ที่เก็บรายงานและ rate limiter:** Durable Object ตัวเดียว (SQLite backend ซึ่งเป็นแบบเดียวที่ Free plan ใช้ได้) ทุก POST และ GET รายงานผ่าน object นี้ จึงเรียงทีละ request เหมือน `handle()` แบบ sync เดิม ยังลบของหมดอายุแบบ lazy ตาม RPT-REQ-012 แต่ข้อมูลอยู่รอดเมื่อ object ถูกปิด
- **Client key:** บน Worker อ่านจาก header `CF-Connecting-IP` เท่านั้น ห้ามอ่าน `X-Forwarded-For`/`Forwarded` normalize แบบเดิม (IPv4-mapped, IPv6 /64) แล้ว HMAC-SHA-256 ด้วย secret (`wrangler secret`) ก่อนส่งเข้า Durable Object IP ดิบจึงไม่ถูกเขียนลง SQLite ไม่มี header → bucket `"unknown"` (fail closed) ตอน dev ในเครื่องยังใช้ socket address
- **ไฟล์ tiles:** `public/tiles/bangkok.pmtiles` (44.5 MiB) อยู่ใน git แต่เกินเพดาน 25 MiB ต่อไฟล์ของ Static Assets จึงเก็บใน R2 และให้ Worker อ่านด้วย `get(key, { range })` แล้วตอบ `206` เองบน origin เดียวกัน ADR 0001 ข้อ "ไม่โหลดจากโดเมนอื่น" และ CSP จึงไม่เปลี่ยน
- **Auto-deploy:** Workers Builds (Git integration ของ Cloudflare) ต่อ repo จาก dashboard แล้ว build ทุกครั้งที่ push เข้า `main` build command `npm ci && npm run lint && npm test` deploy command `npx wrangler@4.145.0 deploy` ไม่มี API token หรือ secret ใน GitHub ไม่ทำ preview build ของ branch อื่น เพราะจะใช้ Durable Object และ R2 ชุดเดียวกับ production ไฟล์ tiles อัปโหลดขึ้น R2 ด้วยมือผ่าน dashboard เมื่อไฟล์เปลี่ยน (นานๆ ครั้ง)
- **POST เปิดให้ทุกคน** ใช้ rate limit 5 รายงาน/ชม./client ตาม RPT-REQ-008

## Considered Options

- **GitHub Actions + `wrangler-action`:** เห็นขั้นตอน test ใน repo และอัปโหลด tiles อัตโนมัติ แต่ต้องสร้าง API token เก็บเป็น GitHub secret และใช้ wizard ตั้งค่า ลองแล้ว (2026-10-01) การ login ของ wrangler ติด OAuth CSRF จึงเปลี่ยนมาใช้ Workers Builds ที่ตั้งค่าใน dashboard อย่างเดียว ไม่เลือก
- **Cloudflare Pages:** Pages Functions export Durable Object เองไม่ได้ (ต้องมี Worker แยก) และ Pages ตอบ 200 แทน 206 กับ range request ไม่เลือก
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
- **ปลอม `CF-Connecting-IP` ไม่ได้ (ทดสอบบน `namthuam.savepong.workers.dev` 2026-10-01):** request ที่ client ใส่ header นี้มาเองถูก Cloudflare ปฏิเสธที่ edge ด้วย `403` error code `1000` ก่อนถึง Worker ส่วน POST ปกติที่เปลี่ยน `X-Forwarded-For` ทุกครั้งได้ 201, 200 ×4 แล้ว 429 `Retry-After: 3600` ตาม RPT-REQ-008/009 ไม่ได้อยู่ใน docs ของ Cloudflare ถ้าวันหนึ่งพฤติกรรมเปลี่ยน ต้องทดสอบใหม่
- **HMAC secret:** หมุน secret แล้วโควตาเดิมทั้งหมดถูกรีเซ็ต ยอมรับได้
- **ยังไม่มี docs ยืนยันว่า build command ที่ fail จะหยุด deploy ใน Workers Builds:** ต้องลองครั้งเดียวด้วย test ที่ตั้งใจให้ fail ก่อนเชื่อ
- **ทดสอบหลัง deploy ยิง POST ไปที่ URL ของเราเองเท่านั้น** ห้ามแตะ `flood-api.rooptanjai.com`
