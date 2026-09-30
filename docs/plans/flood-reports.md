# Plan: คนในพื้นที่รายงานจุดน้ำท่วม

- Spec: [`docs/specs/flood-reports.md`](../specs/flood-reports.md)
- Intent: [`docs/intent/flood-reports.md`](../intent/flood-reports.md)
- แนวทาง: tracer bullet ทำเส้นทางบางสุดให้ผ่านครบทุกชั้นก่อน (API `handle()` → logic `src/reports.ts` → store ใน memory → test) แล้วค่อยเติมกติกาหลัก
- "DB" ในแผนนี้คือ `ReportStore` ใน memory ตาม spec Q7 / RPT-REQ-012 (ไม่มี persistence ไม่เขียนไฟล์)

## กติกาทุกขั้น

- [ ] เขียน test ก่อน ดูให้แดง แล้วค่อยเขียนโค้ด
- [ ] `npm test` และ `npm run lint` ผ่าน
- [ ] ไม่แก้ `tests/app.test.ts`, `tests/time.test.ts`, `package.json` (RPT-REQ-011 AC1, RPT-REQ-017 AC1/AC3)
- [ ] ไม่เพิ่ม dependency และไม่เรียก network ภายนอก โดยเฉพาะ `flood-api.rooptanjai.com`
- [ ] แต่ละ test สร้าง store / limiter ของตัวเองผ่าน `Context` (RPT-REQ-017 AC4)
- [ ] ทำบน branch `feat/flood-reports` ไม่ commit จนกว่า Save สั่ง

## ขั้นตอน

### 1. Tracer bullet: POST → เก็บ → GET เห็น

- [x] ไฟล์: ใหม่ `src/reports.ts`, ใหม่ `tests/reports-api.test.ts`, แก้ `src/app.ts` (`Context.reports?`, route `POST /districts/:id/reports`, `userReports` ใน `GET /districts/:id`)
- [x] Test: RPT-REQ-001 AC1–3, RPT-REQ-002 AC1–2, RPT-REQ-006 AC1, RPT-REQ-011 AC1–3

### 2. Validate body: รูปทรง, depth, seenAt, จุดสังเกต

- [x] ไฟล์: แก้ `src/reports.ts` (`validateReportInput`, `normalizeLandmark`, `parseIsoWithOffset`), แก้ `tests/reports-api.test.ts`, ใหม่ `tests/reports.test.ts`
- [x] Test: RPT-REQ-003 AC1–4, RPT-REQ-004 AC1–5, RPT-REQ-006 AC2, RPT-REQ-007 AC1–5

### 3. Masking เบอร์โทรและเลขที่บ้าน

- [x] ไฟล์: แก้ `src/reports.ts` (`maskPersonalData` เลขที่บ้านก่อน แล้วเบอร์โทร; เหลือแต่ `*`/ช่องว่าง → `landmark_invalid`), แก้ `tests/reports.test.ts`
- [x] Test ก่อน: RPT-REQ-005 AC1–9 รวม AC6 property test (สุ่มเบอร์ 9–13 หลัก), edge E4 (zero-width กลางเบอร์)

### 4. รวมรายงานซ้ำ (dedupe)

- [x] ไฟล์: แก้ `src/reports.ts` (key = `districtId + "\u0000" + landmark.toLowerCase()`, `confirmations` +1, ใหม่กว่าชนะ, `200 merged: true`), แก้ `tests/reports.test.ts`
- [x] Test ก่อน: RPT-REQ-010 AC1–6 (พิสูจน์ว่า key คำนวณหลัง mask)

### 5. Rate limiter แบบ unit (ยังไม่ต่อสาย)

- [x] ไฟล์: ใหม่ `src/rate-limit.ts` (`createRateLimiter` sliding-window log, `clientKeyFromAddress`), ใหม่ `tests/rate-limit.test.ts`
- [x] Test ก่อน: RPT-REQ-008 AC1–4 ระดับ limiter, RPT-REQ-009 AC1–2 (`::ffff:` normalize, IPv6 /64)

### 6. ต่อ rate limiter เข้า submit / handle / server

- [x] ไฟล์: แก้ `src/reports.ts` (`createReportStore(limiter?)`, ตรวจโควตาก่อน validate, `record` เฉพาะที่ยอมรับ), แก้ `src/app.ts` (`Context.clientKey?`, `Response.headers?`, `429` + `Retry-After`), แก้ `src/server.ts` (`clientKey` จาก `req.socket.remoteAddress` เท่านั้น, ส่ง `headers`), แก้ `tests/reports-api.test.ts`
- [x] Test ก่อน: RPT-REQ-008 AC5–6, RPT-REQ-009 AC3–5
  - หมายเหตุ: AC3 (`X-Forwarded-For`) test E2E อยู่ใน `tests/server.test.ts` (ขั้น 8) เพราะก่อนขั้น 8 `server.ts` listen ตอน import

### 7. อายุ การแสดงผล และลบรายงานหมดอายุ

- [x] ไฟล์: แก้ `src/reports.ts` (`DISPLAY_TTL_MS`, lazy purge, `ageMinutes`, `ageLabelTh`, เรียง `seenAt` ใหม่สุดก่อน tie ตาม id), แก้ `src/rate-limit.ts` (ตัด entry เก่า), แก้ `tests/reports-api.test.ts`
- [x] Test ก่อน: RPT-REQ-011 AC4–7, RPT-REQ-012 AC1–3

### 8. `notice` ทุก response และ server ไม่รั่วเมื่อผิดพลาด

- [x] ไฟล์: แก้ `src/app.ts` (`notice` ใน 404 เดิมสองจุด คง `error` เดิม), แก้ `src/server.ts` (แยก `createAppServer(handler)`, listen เฉพาะเมื่อรันตรง, `try/catch` → `500 { notice, error: "internal" }`, `400 invalid JSON` ตายตัวมี `notice`), ใหม่ `tests/server.test.ts` (server จริงบน `127.0.0.1` port 0 ยิงเฉพาะ localhost)
- [x] Test ก่อน: RPT-REQ-016 AC1–4, RPT-REQ-015 AC1–2, RPT-REQ-013 AC3

## ความเสี่ยงและเรื่องที่ยังไม่แน่ใจ

- [ ] **NFKC แยก "ำ" เป็น "ํ" + "า"** (RPT-REQ-004): "น้ำ" นับเป็น 4 code point ข้อความที่เก็บไม่ตรง byte กับที่พิมพ์ (หน้าจอเกือบเหมือนเดิม) ตอนนี้ทำตาม spec และตรึงด้วย test ถ้าอยากคงไว้ให้เปลี่ยนเป็น NFC + แปลงช่องว่างแปลก ต้องแก้ spec — **รอ Save ตัดสิน**
- [ ] Spec ยังเป็น Draft ค่า 10/50/100 cm, 3 ชม., 6 ชม. รอผู้เชี่ยวชาญ (Q1/Q2) เก็บเป็นค่าคงที่ที่เดียว
- [ ] Masking regex (ขั้น 3): พลาดแล้วเบอร์หลุดเก็บ ระวังลำดับ (เลขที่บ้านก่อนเบอร์), เลขไทย, ตัวคั่นหลายตัว, ReDoS; `+` ของ `+66` ยังเหลือได้ แค่ห้ามเหลือตัวเลข ≥ 9 หลัก
- [ ] ข้อจำกัดที่ยอมรับแล้ว: `45/12 ซอย…` และ `no. 45` ไม่ถูกปิด (E29, spec §7) ต้องมี test ตรึง และ UI ต้องเตือนภายหลัง
- [ ] State ร่วมข้าม test: ไม่ส่ง `Context.reports` จะใช้ store กลางของโมดูล
- [ ] ไม่ส่ง `clientKey` จะใช้ bucket `unknown` ร่วมกัน test ต้องส่ง key ของตัวเอง
- [ ] `__proto__` จาก `JSON.parse` เป็น own property ตรวจด้วย `Object.keys` (ทำแล้วในขั้น 2)
- [ ] Test server (ขั้น 8): import แล้วต้องไม่ listen port 3000 เอง และ `fetch` ใน test ยิงได้เฉพาะ localhost

## Later (ไม่ทำรอบนี้)

- [ ] `src/read-body.ts` + `413 payload_too_large` ไม่ parse และมี `notice` (RPT-REQ-014 AC1–2, `tests/read-body.test.ts`)
- [ ] `MAX_ACTIVE_REPORTS` → `503 store_full`, merge ยังได้, 503 ไม่กินโควตา (RPT-REQ-014 AC3–4)
- [ ] Spy `console.*` / `process.stdout|stderr.write` หา IP / ข้อความ / เบอร์ (RPT-REQ-013 AC1), `Object.keys(report)` ตรง spec §3.1 (RPT-REQ-013 AC2)
- [ ] Stub `fetch` และ `node:http(s).request` ว่าไม่ถูกเรียก (RPT-REQ-017 AC2), ไม่มีการเขียนไฟล์ (RPT-REQ-012 AC4)
- [ ] `README.md` เพิ่มตัวอย่าง `curl -X POST` เฉพาะ `localhost`
- [ ] คำเตือน UI "อย่าใส่เลขที่บ้านหรือเบอร์โทร" และ escape จุดสังเกตตอนแสดง (spec §7) — งานของ plan UI
- [ ] ตัวชี้วัดที่ต้องใช้ผู้ใช้จริง (spec §8), Q8–Q10 (deploy / PDPA / moderation)
- [ ] ปิดช่องเลขที่บ้านไม่มีคำนำ, อีเมล, LINE ID (นอกขอบเขตตาม spec §5)

## Verification

- [x] ทุกขั้น: `npm test`, `npm run lint` ผ่าน และ `git diff --stat` ไม่แตะไฟล์ที่ห้ามแก้
- [x] จบขั้น 8: `npm run dev` แล้วลองกับ `localhost:3000` เท่านั้น (รันจริงด้วย `PORT=3997 tsx watch` เพราะ 3000 มี process อื่นอยู่)
  - [x] `curl -X POST localhost:3000/districts/lat-phrao/reports -d '{"landmark":"ปากซอยลาดพร้าว 71","depth":"knee","seenAt":"<now ISO with Z>"}'` แล้ว `curl localhost:3000/districts/lat-phrao` เห็น `userReports`
  - [x] ส่งซ้ำเห็น `merged: true`
  - [x] ส่งครบ 6 ครั้งเห็น `429` + header `Retry-After`
  - [x] ใส่เบอร์ในจุดสังเกตเห็น `***`
