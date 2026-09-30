# Plan: รายงานจุดน้ำท่วมจากประชาชน (tracer bullet + กติกาหลัก)

## Context

Spec `docs/specs/flood-reports.md` กำหนด RPT-REQ-001 ถึง 020 แต่ยังไม่มีโค้ดของฟีเจอร์นี้เลย (`src/` มีแค่ `app.ts`, `server.ts`, `districts.ts`, `stations.ts`, `time.ts`) คืนนี้ทำแค่เส้นทางที่บางที่สุดให้วิ่งครบทุกชั้น (HTTP → `handle` → logic → `ReportStore` → ไฟล์ → test) แล้วเติมกติกาหลักของการรับและแสดงรายงาน ส่วนผู้ดูแลระบบ หน้าเว็บ และ log อยู่ใต้ Later

- ที่มา: `docs/specs/flood-reports.md`
- วันที่เขียน: 2026-09-30

กติกาที่ใช้ทุกขั้น

- เขียน test ก่อน เห็นแดง แล้วค่อยเขียนโค้ด จบขั้นด้วย `npm test` และ `npm run lint` ผ่าน
- ชื่อ test ขึ้นต้นด้วยรหัส เช่น `it("RPT-REQ-001 AC1 ...")` test ใหม่ใช้ `createApp` กับ memory store ของตัวเอง และ `NOW = 2026-09-30T12:30:00Z`
- ไม่แก้ `tests/app.test.ts`, `tests/time.test.ts` และ `NOTICE` (RPT-REQ-018)
- คืนนี้ไม่เพิ่มคำสั่ง log ใดๆ ในเส้นทางรายงาน (logger ที่ฉีดเข้ามาอยู่ใน Later) จึงไม่มีข้อมูลส่วนบุคคลหลุดลง log
- ของที่มีอยู่แล้วและต้องใช้ซ้ำ: `toBangkokIso` (`src/time.ts`), `districts` (`src/districts.ts`), `NOTICE` (`src/app.ts`)

## ขั้นตอน

### Tracer bullet (ขั้น 1 ถึง 3)

**1. `POST /reports` รับรายงานที่ถูกต้องลง memory store**

- ไฟล์: สร้าง `src/reports.ts` (type `Report`, `REPORT_LABEL`, `SEVERITY_THRESHOLDS`, `severityOf`), `src/report-store.ts` (`ReportStore` มีแค่ `all` กับ `add`, `createMemoryReportStore`), `tests/reports-api.test.ts`, `tests/reports.test.ts` แก้ `src/app.ts` (`createApp({ store })`, `handle` เดิมผูกกับ memory store ว่าง, `Context` เพิ่ม `clientIp?`)
- test ก่อน: RPT-REQ-001 AC1 (201, `notice`, `label`, `severity: "medium"`, `observedAt` เวลากรุงเทพฯ), AC2 (store เก็บ UTC), AC4 (body ไม่ใช่ object ได้ 400 `fields: ["body"]`), RPT-REQ-012 AC1 ถึง AC4, RPT-REQ-018 AC2
- ของชั่วคราวในขั้นนี้: ตรวจแค่ `typeof` ของ 4 ฟิลด์, `reporterHash: null`, `landmarkKey` เท่ากับ `landmark`

**2. `GET /districts/:id` แสดงคีย์ `reports`**

- ไฟล์: แก้ `src/reports.ts` (`visibleItems(reports, districtId, now)` หนึ่งรายงานต่อหนึ่งรายการ `reporterCount: 1`), `src/app.ts`, `tests/reports-api.test.ts`
- test ก่อน: RPT-REQ-009 AC1, AC2, AC3, AC4, AC5, AC7

**3. file store และต่อเข้า `server.ts`**

- ไฟล์: แก้ `src/report-store.ts` (`createFileReportStore(path)` เขียน `<path>.tmp` แล้ว `renameSync`, รูปไฟล์ `{ version: 1, reports }`), `src/server.ts` (อ่าน `REPORTS_FILE`, เรียก `createApp`, ส่ง `clientIp` จาก socket), `.gitignore` (เพิ่ม `var/`) สร้าง `tests/report-store.test.ts`
- test ก่อน: RPT-REQ-015 AC1 (contract test ชุดเดียวรันทั้งสอง store), AC2, AC3, AC6 (อ่าน `src/app.ts` แล้วไม่พบ `node:fs`), AC7
- ตรวจด้วยมือ: `npm run dev` แล้ว `curl` ไปที่ `localhost:3000` เท่านั้น ส่งรายงาน restart แล้ว `GET /districts/sai-mai` ยังเห็นรายงาน

### กติกาหลัก (ขั้น 4 ถึง 8)

**4. ตรวจเขต ความลึก และเวลาที่เห็น**

- ไฟล์: แก้ `src/time.ts` (`parseIsoInstant`), `src/reports.ts` (`validateReportInput` คืนชื่อฟิลด์ที่ผิดทั้งหมด), `src/app.ts`, `tests/reports.test.ts`, `tests/reports-api.test.ts`
- test ก่อน: RPT-REQ-002 AC1 ถึง AC4, RPT-REQ-003 AC1 ถึง AC4, RPT-REQ-004 AC1 ถึง AC6, RPT-REQ-001 AC3, RPT-REQ-005 AC6 และ AC7

**5. จุดสังเกต และปิดเบอร์โทร**

- ไฟล์: แก้ `src/reports.ts` (normalize NFC ยุบช่องว่าง ตรวจความยาวเป็น code point, `maskPhoneNumbers`, `PHONE_MASK`), `src/app.ts`, `tests/reports.test.ts`, `tests/reports-api.test.ts`
- test ก่อน: RPT-REQ-005 AC1 ถึง AC5, RPT-REQ-006 AC1 ถึง AC4 และ AC6, AC5 เฉพาะส่วนไฟล์เก็บรายงาน (ส่วน log ไป Later)

**6. แฮชผู้ส่ง และโควตา 5 รายงานต่อชั่วโมง**

- ไฟล์: สร้าง `src/reporter.ts` (`normalizeIp`, `hashReporter`), `tests/reporter.test.ts` แก้ `src/reports.ts` (`rateLimitStatus`), `src/app.ts` (`AppDeps.ipHashSecret`, `Response.headers`, ตรวจโควตาก่อนตรวจเนื้อหา), `src/server.ts` (อ่าน `IP_HASH_SECRET`, ส่ง header จาก `Response`), `tests/reports-api.test.ts`
- test ก่อน: RPT-REQ-008 AC1 ถึง AC4 และ AC6, RPT-REQ-007 AC1 ถึง AC6 และ AC8, RPT-REQ-001 AC5

**7. อายุรายงาน 6 ชั่วโมง และ `minutesAgo`**

- ไฟล์: แก้ `src/reports.ts` (`REPORT_TTL_MS`, กรองใน `visibleItems`, เรียงใหม่ไปเก่า), `tests/reports.test.ts`
- test ก่อน: RPT-REQ-010 AC1 ถึง AC4, RPT-REQ-009 AC6

**8. รวมรายงานซ้ำ** (สอง commit: 8a `landmarkKey`, 8b การรวม)

- ไฟล์: แก้ `src/reports.ts` (`landmarkKey`, `LANDMARK_PREFIXES`, `MERGE_WINDOW_MS`, จัดกลุ่มใน `visibleItems`, `reporterCount` นับแฮชไม่ซ้ำ), `src/app.ts` (เก็บ `landmarkKey` จริง), `tests/reports.test.ts`, `tests/reports-api.test.ts`
- test ก่อน: 8a RPT-REQ-011 AC5, AC6, AC8 จากนั้น 8b RPT-REQ-011 AC1 ถึง AC4, AC7, AC9, AC10

## ความเสี่ยง

- **ขั้น 1 ถึง 5 ยังไม่มีโควตา และขั้น 1 ถึง 3 แทบไม่ตรวจ input** ห้ามเปิดเซิร์ฟเวอร์ให้เครื่องอื่นเข้าถึงจนกว่าจบขั้น 6 ทดสอบกับ `localhost` หรือเรียก `handle` เท่านั้น ห้ามยิง `flood-api.rooptanjai.com`
- **`renameSync` บน Windows ในโฟลเดอร์ OneDrive** repo อยู่ใต้ OneDrive ซึ่งอาจล็อก `var/reports.json` ระหว่าง sync แล้วทำให้ rename ได้ `EPERM` test ใช้ `os.tmpdir()` จึงไม่โดน ถ้าเจอตอนรันจริงให้ตั้ง `REPORTS_FILE` ออกนอก OneDrive
- **`Date` ของ V8 ไม่ปฏิเสธ `2026-02-30`** มันเลื่อนเป็นเดือนมีนาคม `parseIsoInstant` จึงต้องใช้ regex บังคับรูปแบบและ offset แล้วเทียบวัน เดือน ปีกลับ (RPT-REQ-004 AC6)
- **regex เบอร์โทร** ต้องรองรับเลขไทย ตัวคั่นหนึ่งตัว และ `+` นำหน้า โดยไม่โดน `"สายไหม 15 แยก 3"` เลขสั้นสองชุดที่คั่นด้วยช่องว่างเดียวและรวมกันถึง 9 หลัก (เช่น `101 1234567`) จะถูกปิดไปด้วย ซึ่งตรงตาม spec
- **ข้อมูลที่เขียนก่อนขั้น 8** มี `landmarkKey` เท่ากับ `landmark` และก่อนขั้น 6 มี `reporterHash: null` ให้ลบ `var/reports.json` หลังจบขั้น 8
- **ขั้น 6 และ 8 ใหญ่ที่สุด** ถ้า diff เกินจะรีวิวใน 5 นาที ให้แยก `src/reporter.ts` เป็น commit ของตัวเอง เหมือนที่แยก 8a กับ 8b
- **`ReportStore` คืนนี้มีแค่ `all` กับ `add`** `setHidden` และ `purgeReporterHashes` เพิ่มทีหลัง contract test ต้องเขียนให้เติม method ได้โดยไม่รื้อ

## เรื่องที่ยังไม่แน่ใจ

- Spec ยังมีสถานะ "ร่าง รอรีวิว" ถ้ารีวิวแล้วค่าในตาราง 1.2 เปลี่ยน (คำนำหน้า รูปแบบเบอร์โทร ข้อความป้าย) ต้องแก้ที่ค่าคงที่ใน `src/reports.ts` และ test ที่อ้างค่าพวกนั้น
- RPT-REQ-007 AC8 ทำให้ `handle` ตัวเดิม (context มีแค่ `now`) ตอบ 500 กับ `POST /reports` เสมอ ตรงตาม spec แต่ต้องแน่ใจว่า `server.ts` ส่ง `clientIp` ทุกคำขอ รวมถึงกรณี `req.socket.remoteAddress` เป็น `undefined`
- ถ้าไม่ตั้ง `IP_HASH_SECRET` secret จะสุ่มใหม่ทุกครั้งที่ restart โควตาจึงรีเซ็ต และ `tsx watch` restart บ่อยตอนพัฒนา ควรมี `.env` ตัวอย่างหรือไม่ยังไม่ได้ตัดสิน
- RPT-REQ-015 AC6 ตรวจด้วยการอ่านซอร์ส `src/app.ts` ใน test ซึ่งไม่จับ import ทางอ้อม จะตรวจแค่นี้หรือไล่ import ต่อยังไม่ได้ตัดสิน
- Node ให้ที่อยู่ socket เป็น `::ffff:127.0.0.1` ได้บนเครื่อง dual-stack `normalizeIp` ในขั้น 6 ครอบคลุมกรณีนี้ (RPT-REQ-008 AC4) แต่ยังไม่ได้ลองบน Windows เครื่องนี้

## Later

- ผู้ดูแลระบบ: RPT-REQ-013 (ซ่อน ยกเลิกซ่อน `GET /admin/reports`, `setHidden`), RPT-REQ-014 (`src/admin.ts`, bearer token, `timingSafeEqual`, ตัวนับยืนยันตัวผิด), RPT-REQ-007 AC7
- ล้างแฮชหลัง 24 ชั่วโมง: RPT-REQ-008 AC5 (`purgeReporterHashes` และตัวตั้งเวลาใน `server.ts`), AC7 (`TRUST_PROXY`)
- ความทนทานของ file store: RPT-REQ-015 AC4 (ไฟล์เสีย), AC5 (เขียนไม่ได้ ย้อนสำเนาในหน่วยความจำ ตอบ 500)
- log: RPT-REQ-017 (`AppDeps.log`, เหตุการณ์ `report.accepted` และอื่นๆ), RPT-REQ-006 AC5 ส่วน log
- หน้าเว็บ: RPT-REQ-016 (`public/report.html`, `public/report.js`, CSP), RPT-REQ-012 AC5
- ขอบระบบ HTTP: RPT-REQ-019 (จำกัด body 10 KB, 413, method อื่นของ `/reports` ตอบ 404)
- ตรวจรวม: RPT-REQ-018 AC3 (เทียบ body ของ `GET /districts` ทั้งก้อน), RPT-REQ-020 (ค้น `rooptanjai`, `fetch`)
- เอกสาร: `README.md` (ตารางไฟล์ ตัวแปร env ตัวอย่าง `curl` ไป `localhost`), แก้ CLAUDE.md ที่ยังเขียนว่าแผน "not written yet"

## Verification

- ทุกขั้น: `npm test` และ `npm run lint` ผ่าน โดย `tests/app.test.ts` และ `tests/time.test.ts` ไม่ถูกแก้ (`git diff --stat main -- tests/app.test.ts tests/time.test.ts` ว่าง)
- รันทีละไฟล์ระหว่างทำ: `npx vitest run tests/reports-api.test.ts`
- จบขั้น 3 และขั้น 8: `npm run dev` แล้ว `curl -X POST localhost:3000/reports` ด้วยรายงานที่ถูกต้อง ตามด้วย `curl localhost:3000/districts/sai-mai` ต้องเห็น `reports.items` พร้อมป้าย และ `var/reports.json` ไม่มี IP ดิบ
- จบขั้น 6: ส่งครั้งที่ 6 ได้ 429 พร้อม header `Retry-After`
