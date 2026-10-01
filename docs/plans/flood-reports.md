# Plan: รายงานจุดน้ำท่วมจากประชาชน (tracer bullet + กติกาหลัก)

## Context

Spec `docs/specs/flood-reports.md` กำหนด RPT-REQ-001 ถึง 020 แต่ยังไม่มีโค้ดของฟีเจอร์นี้เลย (`src/` มีแค่ `app.ts`, `server.ts`, `districts.ts`, `stations.ts`, `time.ts`) คืนนี้ทำแค่เส้นทางที่บางที่สุดให้วิ่งครบทุกชั้น (HTTP → `handle` → logic → `ReportStore` → ไฟล์ → test) แล้วเติมกติกาหลักของการรับและแสดงรายงาน ขั้น 9 เพิ่มช่องทางผู้ดูแลระบบ ขั้น 10 เพิ่ม log ส่วนหน้าเว็บอยู่ใต้ Later

- ที่มา: `docs/specs/flood-reports.md`
- วันที่เขียน: 2026-09-30

กติกาที่ใช้ทุกขั้น

- เขียน test ก่อน เห็นแดง แล้วค่อยเขียนโค้ด จบขั้นด้วย `npm test` และ `npm run lint` ผ่าน
- ชื่อ test ขึ้นต้นด้วยรหัส เช่น `it("RPT-REQ-001 AC1 ...")` test ใหม่ใช้ `createApp` กับ memory store ของตัวเอง และ `NOW = 2026-09-30T12:30:00Z`
- ไม่แก้ `tests/app.test.ts`, `tests/time.test.ts` และ `NOTICE` (RPT-REQ-018)
- ขั้น 1 ถึง 9 ไม่เพิ่มคำสั่ง log ใดๆ ในเส้นทางรายงาน จึงไม่มีข้อมูลส่วนบุคคลหลุดลง log ขั้น 10 เพิ่ม log ผ่าน logger ที่ฉีดเข้ามาเท่านั้น (ห้ามเรียก `console.*` ใน `src/app.ts` และ `src/reports.ts`)
- ของที่มีอยู่แล้วและต้องใช้ซ้ำ: `toBangkokIso` (`src/time.ts`), `districts` (`src/districts.ts`), `NOTICE` (`src/app.ts`)

## ขั้นตอน

### Tracer bullet (ขั้น 1 ถึง 3)

**1. [x] `POST /reports` รับรายงานที่ถูกต้องลง memory store**

- ไฟล์: สร้าง `src/reports.ts` (type `Report`, `REPORT_LABEL`, `SEVERITY_THRESHOLDS`, `severityOf`), `src/report-store.ts` (`ReportStore` มีแค่ `all` กับ `add`, `createMemoryReportStore`), `tests/reports-api.test.ts`, `tests/reports.test.ts` แก้ `src/app.ts` (`createApp({ store })`, `handle` เดิมผูกกับ memory store ว่าง, `Context` เพิ่ม `clientIp?`)
- test ก่อน: RPT-REQ-001 AC1 (201, `notice`, `label`, `severity: "medium"`, `observedAt` เวลากรุงเทพฯ), AC2 (store เก็บ UTC), AC4 (body ไม่ใช่ object ได้ 400 `fields: ["body"]`), RPT-REQ-012 AC1 ถึง AC4, RPT-REQ-018 AC2
- ของชั่วคราวในขั้นนี้: ตรวจแค่ `typeof` ของ 4 ฟิลด์, `reporterHash: null`, `landmarkKey` เท่ากับ `landmark`

**2. [x] `GET /districts/:id` แสดงคีย์ `reports`**

- ไฟล์: แก้ `src/reports.ts` (`visibleItems(reports, districtId, now)` หนึ่งรายงานต่อหนึ่งรายการ `reporterCount: 1`), `src/app.ts`, `tests/reports-api.test.ts`
- test ก่อน: RPT-REQ-009 AC1, AC2, AC3, AC4, AC5, AC7

**3. [x] file store และต่อเข้า `server.ts`**

- ไฟล์: แก้ `src/report-store.ts` (`createFileReportStore(path)` เขียน `<path>.tmp` แล้ว `renameSync`, รูปไฟล์ `{ version: 1, reports }`), `src/server.ts` (อ่าน `REPORTS_FILE`, เรียก `createApp`, ส่ง `clientIp` จาก socket), `.gitignore` (เพิ่ม `var/`) สร้าง `tests/report-store.test.ts`
- test ก่อน: RPT-REQ-015 AC1 (contract test ชุดเดียวรันทั้งสอง store), AC2, AC3, AC6 (อ่าน `src/app.ts` แล้วไม่พบ `node:fs`), AC7
- ตรวจด้วยมือ: `npm run dev` แล้ว `curl` ไปที่ `localhost:3000` เท่านั้น ส่งรายงาน restart แล้ว `GET /districts/sai-mai` ยังเห็นรายงาน

### กติกาหลัก (ขั้น 4 ถึง 8)

**4. [x] ตรวจเขต ความลึก และเวลาที่เห็น**

- ไฟล์: แก้ `src/time.ts` (`parseIsoInstant`), `src/reports.ts` (`validateReportInput` คืนชื่อฟิลด์ที่ผิดทั้งหมด), `src/app.ts`, `tests/reports.test.ts`, `tests/reports-api.test.ts`
- test ก่อน: RPT-REQ-002 AC1 ถึง AC4, RPT-REQ-003 AC1 ถึง AC4, RPT-REQ-004 AC1 ถึง AC6, RPT-REQ-001 AC3, RPT-REQ-005 AC6 และ AC7

**5. [x] จุดสังเกต และปิดเบอร์โทร**

- ไฟล์: แก้ `src/reports.ts` (normalize NFC ยุบช่องว่าง ตรวจความยาวเป็น code point, `maskPhoneNumbers`, `PHONE_MASK`), `src/app.ts`, `tests/reports.test.ts`, `tests/reports-api.test.ts`
- test ก่อน: RPT-REQ-005 AC1 ถึง AC5, RPT-REQ-006 AC1 ถึง AC4 และ AC6, AC5 เฉพาะส่วนไฟล์เก็บรายงาน (ส่วน log อยู่ในขั้น 10a)

**6. [x] แฮชผู้ส่ง และโควตา 5 รายงานต่อชั่วโมง**

- ไฟล์: สร้าง `src/reporter.ts` (`normalizeIp`, `hashReporter`), `tests/reporter.test.ts` แก้ `src/reports.ts` (`rateLimitStatus`), `src/app.ts` (`AppDeps.ipHashSecret`, `Response.headers`, ตรวจโควตาก่อนตรวจเนื้อหา), `src/server.ts` (อ่าน `IP_HASH_SECRET`, ส่ง header จาก `Response`), `tests/reports-api.test.ts`
- test ก่อน: RPT-REQ-008 AC1 ถึง AC4 และ AC6, RPT-REQ-007 AC1 ถึง AC6 และ AC8, RPT-REQ-001 AC5

**7. [x] อายุรายงาน 6 ชั่วโมง และ `minutesAgo`**

- ไฟล์: แก้ `src/reports.ts` (`REPORT_TTL_MS`, กรองใน `visibleItems`, เรียงใหม่ไปเก่า), `tests/reports.test.ts`
- test ก่อน: RPT-REQ-010 AC1 ถึง AC4, RPT-REQ-009 AC6

**8. [x] รวมรายงานซ้ำ** (สอง commit: 8a `landmarkKey`, 8b การรวม)

- ไฟล์: แก้ `src/reports.ts` (`landmarkKey`, `LANDMARK_PREFIXES`, `MERGE_WINDOW_MS`, จัดกลุ่มใน `visibleItems`, `reporterCount` นับแฮชไม่ซ้ำ), `src/app.ts` (เก็บ `landmarkKey` จริง), `tests/reports.test.ts`, `tests/reports-api.test.ts`
- test ก่อน: 8a RPT-REQ-011 AC5, AC6, AC8 จากนั้น 8b RPT-REQ-011 AC1 ถึง AC4, AC7, AC9, AC10

### ผู้ดูแลระบบ (ขั้น 9)

**9. [x] ช่องทาง `/admin/` ที่ต้องมี token แล้วซ่อน/ยกเลิกซ่อนรายงาน** (สอง commit: 9a ประตูตรวจ token พร้อม `GET /admin/reports`, 9b ซ่อนและยกเลิกซ่อน) ทำ 9a ก่อนเสมอ เพราะ route ที่แก้ข้อมูลต้องไม่เคยมีอยู่โดยไม่มีประตู

- 9a ไฟล์: สร้าง `src/admin.ts` (`checkAdminAuth`: เทียบ token ด้วย `timingSafeEqual` หลังแฮช SHA-256 ทั้งสองฝั่งให้ความยาวเท่ากัน, `createAuthFailureLimiter` นับความผิดต่อ IP ในหน่วยความจำ 10 ครั้งต่อ 15 นาที), `tests/admin.test.ts` แก้ `src/reports.ts` (`adminItems(reports, now)`: รับใน 24 ชั่วโมงล่าสุด เรียง `receivedAt` ใหม่ไปเก่า `reporterRef` เป็น 8 ตัวแรกของแฮช), `src/app.ts` (`Context.authorization?`, `AppDeps.adminToken?`, ทุก path ที่ขึ้นต้น `/admin/` ผ่านประตูก่อน ลำดับ 503, 429, 401 แล้วค่อยค้นรายงาน, `WWW-Authenticate: Bearer` ใน 401), `src/server.ts` (อ่าน `ADMIN_TOKEN`, ส่ง `authorization` จาก header, เตือนใน log ถ้าตั้งแต่สั้นกว่า 16 ตัวอักษรโดยไม่พิมพ์ค่า), `tests/admin-api.test.ts`
- 9a test ก่อน: RPT-REQ-014 AC1 ถึง AC5 และ AC8, RPT-REQ-013 AC6 และ AC7 (`GET /admin/reports` เป็น route แรกที่ใช้พิสูจน์ AC3 ว่า token ถูกได้ 200) token ใน test สร้างเองด้วย `randomBytes` ห้ามเขียนค่าตายตัว
- 9b ไฟล์: แก้ `src/report-store.ts` (`setHidden(id, hiddenAt)` ทั้งสอง store แทนที่ออบเจ็กต์ใหม่ ไม่แก้ของเดิม file store เขียนไฟล์แล้วค่อยเปลี่ยนสำเนา), `src/app.ts` (`POST /admin/reports/:id/hide` และ `/unhide` ส่ง `hiddenAt` ตามสถานะเดิมเพื่อให้ซ้ำแล้วไม่เปลี่ยน), `tests/report-store.test.ts` (เติม `setHidden` เข้า contract test เดิม), `tests/admin-api.test.ts`
- 9b test ก่อน: RPT-REQ-013 AC1 ถึง AC5 และ AC8, RPT-REQ-007 AC7, RPT-REQ-014 AC1 ส่วน "รายงานไม่ถูกซ่อน" `visibleItems` กรอง `hiddenAt` และ `rateLimitStatus` นับรายงานที่ซ่อนอยู่แล้ว (RPT-REQ-013 AC2 และ RPT-REQ-007 AC7 จึงน่าจะเขียวทันทีโดยไม่ต้องแก้โค้ด) ให้ยืนยันว่าเขียวเพราะพฤติกรรมจริงด้วยการลองทำให้แดงชั่วคราว (เช่นเอาเงื่อนไข `hiddenAt === null` ออก) แล้วคืนค่า
- ตรวจด้วยมือ: `ADMIN_TOKEN=<สุ่มเอง 16 ตัวขึ้นไป> npm run dev` แล้ว `curl` ไป `localhost:3000/admin/reports` ทั้งแบบไม่มี header (ต้อง 401) และแบบมี `Authorization: Bearer` ซ่อนรายงานของ `sai-mai` แล้ว `GET /districts/sai-mai` ต้องไม่เห็น restart แล้ว `hiddenAt` ยังอยู่ใน `var/reports.json`

### log (ขั้น 10)

**10. [x] log เหตุการณ์ของรายงานผ่าน logger ที่ฉีดเข้ามา โดยไม่มีข้อมูลส่วนบุคคล** (สอง commit: 10a เหตุการณ์สาธารณะพร้อมต่อ `server.ts`, 10b เหตุการณ์ผู้ดูแลระบบ)

หลักของขั้นนี้คือ log ทุกบรรทัดสร้างจากที่เดียว มี allowlist ของชื่อฟิลด์ (`id`, `districtId`, `status`, `reason`, `fields`) test จึงตรวจได้ทั้งแบบ "ไม่มีสตริงต้องห้าม" และแบบ "ทุกบรรทัดมีแต่ฟิลด์ใน allowlist" แบบหลังจับ log ที่เพิ่มทีหลังโดยไม่ต้องรู้ล่วงหน้าว่าอะไรจะรั่ว

- 10a ไฟล์: สร้าง `src/report-log.ts` (type `LogFn`, `noopLog`, `LOG_FIELD_NAMES`, ฟังก์ชันสร้างบรรทัดต่อเหตุการณ์ให้ใส่ได้เฉพาะฟิลด์ที่อนุญาต), `tests/report-log.test.ts` แก้ `src/app.ts` (`AppDeps.log?`, เรียกหลัง `store.add` สำเร็จ และตอน 400 กับ 429 ของ `POST /reports`), `src/server.ts` (ส่ง `log` ที่พิมพ์ JSON หนึ่งบรรทัดต่อเหตุการณ์ลง stdout)
- 10a log ที่ปล่อย: `report.accepted` (`id`, `districtId`, `status: 201`), `report.rejected` กับ `reason: "validation"` (`status: 400`, `fields` เป็นชื่อฟิลด์ที่ไม่ผ่านเท่านั้น ไม่มี `districtId` เพราะอาจเป็นค่าที่ผู้ใช้ส่งมา) และ `reason: "rate_limit"` (`status: 429`) ไม่ log ตอน 500 เพราะไม่มี IP
- 10a test ก่อน: RPT-REQ-017 AC1 ถึง AC5, RPT-REQ-006 AC5 (ส่งรายงานเบอร์โทรจาก AC1 ของ RPT-REQ-006 แล้วเนื้อไฟล์ store ที่ใช้ `os.tmpdir()` และ log ทั้งหมดไม่มี `5678`) ใน test ใช้ logger สอดแนมที่เก็บทุกบรรทัด และค่าต้องห้ามที่สร้างเอง: ข้อความจุดสังเกต, เบอร์โทร, `203.0.113.10`, แฮชเต็มกับ 8 ตัวแรกของแฮช, ค่า `depthCm` แปลกๆ ที่ส่งมาตอนไม่ผ่านการตรวจ AC5 ตรวจ `src/server.ts` ด้วยการอ่านซอร์ส: ทุกบรรทัดที่เรียก `console.` ต้องไม่อ้าง `body`, `raw`, `authorization`, `headers`
- 10b ไฟล์: แก้ `src/app.ts`, `src/report-log.ts`, `tests/report-log.test.ts`
- 10b log ที่ปล่อย: `report.hidden` และ `report.unhidden` (`id`, `districtId`, `status: 200`) เฉพาะเมื่อสถานะเปลี่ยนจริง (ซ่อนซ้ำหรือยกเลิกซ้ำไม่ log), `admin.auth_failed` (`status: 401` เท่านั้น ไม่มี token ที่ส่งมา ไม่มี header ไม่มี IP ไม่มีแฮช)
- 10b test ก่อน: RPT-REQ-014 AC7 (ส่ง token ผิดที่สร้างเองและ token ถูก แล้วไม่พบทั้งสองใน log), RPT-REQ-017 AC1 ขยายให้คลุมเส้นทางผู้ดูแล, และ test ของตัวข้อกำหนด RPT-REQ-017 ที่ spec ไม่มี AC ให้ (ตั้งชื่อ `RPT-REQ-017 events`): hide, unhide และ auth_failed ได้บรรทัดละหนึ่งบรรทัดและ `id` ตรงกับ response ส่วนการซ่อนซ้ำไม่เพิ่มบรรทัด
- ตรวจด้วยมือ: `npm run dev` ตั้ง `ADMIN_TOKEN` สุ่มเอง แล้ว `curl` ไป `localhost` ส่งรายงานที่มีเบอร์โทรและผิดกฎหนึ่งรายการ ซ่อนหนึ่งครั้ง และส่ง token ผิดหนึ่งครั้ง ดู stdout ว่ามีบรรทัดครบทั้งสี่เหตุการณ์ และ `grep` ไม่พบเบอร์โทร `127.0.0.1` `::1` หรือ token

## ความเสี่ยง

- **ขั้น 1 ถึง 5 ยังไม่มีโควตา และขั้น 1 ถึง 3 แทบไม่ตรวจ input** ห้ามเปิดเซิร์ฟเวอร์ให้เครื่องอื่นเข้าถึงจนกว่าจบขั้น 6 ทดสอบกับ `localhost` หรือเรียก `handle` เท่านั้น ห้ามยิง `flood-api.rooptanjai.com`
- **`renameSync` บน Windows ในโฟลเดอร์ OneDrive** repo อยู่ใต้ OneDrive ซึ่งอาจล็อก `var/reports.json` ระหว่าง sync แล้วทำให้ rename ได้ `EPERM` test ใช้ `os.tmpdir()` จึงไม่โดน ถ้าเจอตอนรันจริงให้ตั้ง `REPORTS_FILE` ออกนอก OneDrive
- **`Date` ของ V8 ไม่ปฏิเสธ `2026-02-30`** มันเลื่อนเป็นเดือนมีนาคม `parseIsoInstant` จึงต้องใช้ regex บังคับรูปแบบและ offset แล้วเทียบวัน เดือน ปีกลับ (RPT-REQ-004 AC6)
- **regex เบอร์โทร** ต้องรองรับเลขไทย ตัวคั่นหนึ่งตัว และ `+` นำหน้า โดยไม่โดน `"สายไหม 15 แยก 3"` เลขสั้นสองชุดที่คั่นด้วยช่องว่างเดียวและรวมกันถึง 9 หลัก (เช่น `101 1234567`) จะถูกปิดไปด้วย ซึ่งตรงตาม spec
- **ข้อมูลที่เขียนก่อนขั้น 8** มี `landmarkKey` เท่ากับ `landmark` และก่อนขั้น 6 มี `reporterHash: null` ให้ลบ `var/reports.json` หลังจบขั้น 8
- **ขั้น 6 และ 8 ใหญ่ที่สุด** ถ้า diff เกินจะรีวิวใน 5 นาที ให้แยก `src/reporter.ts` เป็น commit ของตัวเอง เหมือนที่แยก 8a กับ 8b
- **`ReportStore` มีแค่ `all` กับ `add` จนถึงขั้น 8** `setHidden` เข้าในขั้น 9b ส่วน `purgeReporterHashes` เพิ่มทีหลัง contract test ต้องเติม method ได้โดยไม่รื้อ
- **ขั้น 9 เปิดช่องทางที่แก้ข้อมูลได้** token ผ่าน HTTP ธรรมดาไม่มีการเข้ารหัส ห้ามเปิดเซิร์ฟเวอร์ให้เครื่องอื่นเข้าถึงจนกว่าจะอยู่หลัง TLS ทดสอบกับ `localhost` เท่านั้น และอย่าวาง token จริงใน shell history ที่แชร์ รวมถึงหน้าจอที่ใช้สอน
- **ขั้น 9 ยังไม่มี log** RPT-REQ-014 AC7 (log ไม่มี token) และเหตุการณ์ `report.hidden`, `report.unhidden`, `admin.auth_failed` อยู่ในขั้น 10b ดังนั้นจนกว่าจะจบขั้น 10 การซ่อนรายงานไม่มีร่องรอยนอกจาก `hiddenAt` ใน store
- **ขั้น 10 เป็นจุดที่ข้อมูลส่วนบุคคลรั่วได้ง่ายที่สุด** เพราะคนชอบเติม log ทีหลังโดยใส่ทั้งก้อน (เช่น `{ ...report }`) allowlist ใน `src/report-log.ts` กับ test ที่ตรวจว่าทุกบรรทัดมีแต่ฟิลด์ใน allowlist มีไว้กันตรงนี้ อย่าแก้ allowlist เพื่อให้ test ผ่าน
- **log ที่ `server.ts` ตรวจด้วยการอ่านซอร์ส** (RPT-REQ-017 AC5) จับไม่ได้ถ้า log ทางอ้อม เช่นส่ง `req` ให้ฟังก์ชันอื่นแล้วฟังก์ชันนั้น log ตรวจแบบนี้เหมือน RPT-REQ-015 AC6 ที่ยังไม่ได้ตัดสินว่าจะไล่ import ต่อหรือไม่
- **RPT-REQ-014 AC6 ตรวจด้วย test ไม่ได้ตรงๆ** test ไม่รู้ token จริงของผู้ดูแล จึงตรวจได้แค่ว่าใน `src/` ชื่อ `ADMIN_TOKEN` ปรากฏเฉพาะใน `src/server.ts` ในรูป `process.env.ADMIN_TOKEN` และไม่มีสตริงยาวตายตัวผูกกับมัน ส่วนที่เหลือเป็นการตรวจด้วยตาก่อน commit
- **`DELETE /admin/...` (RPT-REQ-013 AC8)** ประตูตอบ 401 ก่อนทุก path ใต้ `/admin/` (RPT-REQ-014 AC8) จึงต้องส่ง token ที่ถูกใน test ของ AC8 จึงจะได้ 404

## เรื่องที่ยังไม่แน่ใจ

- Spec ยังมีสถานะ "ร่าง รอรีวิว" ถ้ารีวิวแล้วค่าในตาราง 1.2 เปลี่ยน (คำนำหน้า รูปแบบเบอร์โทร ข้อความป้าย) ต้องแก้ที่ค่าคงที่ใน `src/reports.ts` และ test ที่อ้างค่าพวกนั้น
- RPT-REQ-007 AC8 ทำให้ `handle` ตัวเดิม (context มีแค่ `now`) ตอบ 500 กับ `POST /reports` เสมอ ตรงตาม spec แต่ต้องแน่ใจว่า `server.ts` ส่ง `clientIp` ทุกคำขอ รวมถึงกรณี `req.socket.remoteAddress` เป็น `undefined`
- ถ้าไม่ตั้ง `IP_HASH_SECRET` secret จะสุ่มใหม่ทุกครั้งที่ restart โควตาจึงรีเซ็ต และ `tsx watch` restart บ่อยตอนพัฒนา ควรมี `.env` ตัวอย่างหรือไม่ยังไม่ได้ตัดสิน
- RPT-REQ-015 AC6 ตรวจด้วยการอ่านซอร์ส `src/app.ts` ใน test ซึ่งไม่จับ import ทางอ้อม จะตรวจแค่นี้หรือไล่ import ต่อยังไม่ได้ตัดสิน
- ขั้น 10: spec ให้ `AppDeps.log` เป็นฟิลด์บังคับ ร่างนี้ทำเป็น `log?` ที่ไม่ใส่ก็คือไม่ log (เหมือน `handle` ตัวเดิม) เพื่อไม่ต้องแก้ `createApp({...})` ในทุก test ข้อเสียคือถ้าลืมส่ง `log` ใน `server.ts` ระบบจะเงียบไปเลย จึงมีการตรวจ `server.ts` ด้วยมือในขั้นนี้ ถ้าอยากให้บังคับตาม spec ต้องแก้ `setup()` ในทุกไฟล์ test ที่เรียก `createApp`
- ขั้น 10: spec บอกว่าบรรทัด log "มีเฉพาะ" ชื่อเหตุการณ์ `id` `districtId` status และชื่อฟิลด์ ร่างนี้จึงไม่ใส่เวลา ถ้าเปิดดู log ย้อนหลังจะรู้ไม่ได้ว่าเกิดเมื่อไร ทางเลือกคือให้ `server.ts` เติมเวลาเองตอนพิมพ์ (ไม่ผ่าน `handle`) ซึ่งเวลาไม่ใช่ข้อมูลส่วนบุคคลแต่ต้องแก้ spec ให้ตรง
- ขั้น 10: ร่างนี้ log `admin.auth_failed` เฉพาะ 401 คำขอที่ถูก 429 เพราะผิดเกิน 10 ครั้งจะไม่มีร่องรอยเลย ทั้งที่เป็นช่วงที่น่าจะมีคนกำลังเดา token สุ่ม spec ไม่มีเหตุการณ์สำหรับกรณีนี้ ต้องตัดสินว่าจะเพิ่มหรือไม่
- ขั้น 9: spec ไม่บอกว่า route ผู้ดูแลที่ไม่มี `ctx.clientIp` ต้องตอบอะไร (จำกัดความผิดต่อ IP ไม่ได้) ร่างนี้เลือกตอบ 500 `client address unavailable` เหมือน `POST /reports` ต้องยืนยันก่อนเขียน test
- ขั้น 9: spec ไม่ระบุ header `Retry-After` กับ `retryAfterSeconds` ของ 429 ฝั่งผู้ดูแล ร่างนี้ทำเหมือน `POST /reports` และไม่บอกว่าตัวนับรีเซ็ตเมื่อยืนยันตัวสำเร็จ (ใช้หน้าต่างเลื่อน 15 นาทีนับเฉพาะครั้งที่ผิด) และ `Bearer` ถือเป็นตัวพิมพ์ใหญ่ตามตัวอย่างใน spec เท่านั้น
- ขั้น 9: `hiddenAt` ใน `GET /admin/reports` ร่างนี้แสดงเป็นเวลากรุงเทพฯ เหมือน `observedAt` และ `receivedAt` (spec แสดงตัวอย่างแค่ค่า `null`) ส่วนใน store เป็น UTC ตาม RPT-REQ-013 AC1
- Node ให้ที่อยู่ socket เป็น `::ffff:127.0.0.1` ได้บนเครื่อง dual-stack `normalizeIp` ในขั้น 6 ครอบคลุมกรณีนี้ (RPT-REQ-008 AC4) แต่ยังไม่ได้ลองบน Windows เครื่องนี้

## Later

- ล้างแฮชหลัง 24 ชั่วโมง: RPT-REQ-008 AC5 (`purgeReporterHashes` และตัวตั้งเวลาใน `server.ts`), AC7 (`TRUST_PROXY`)
- ความทนทานของ file store: RPT-REQ-015 AC4 (ไฟล์เสีย), AC5 (เขียนไม่ได้ ย้อนสำเนาในหน่วยความจำ ตอบ 500)
- หน้าเว็บ: RPT-REQ-016 (`public/report.html`, `public/report.js`, CSP), RPT-REQ-012 AC5
- ขอบระบบ HTTP: RPT-REQ-019 (จำกัด body 10 KB, 413, method อื่นของ `/reports` ตอบ 404)
- ตรวจรวม: RPT-REQ-018 AC3 (เทียบ body ของ `GET /districts` ทั้งก้อน), RPT-REQ-020 (ค้น `rooptanjai`, `fetch`)
- เอกสาร: `README.md` (ตารางไฟล์ ตัวแปร env ตัวอย่าง `curl` ไป `localhost`), แก้ CLAUDE.md ที่ยังเขียนว่าแผน "not written yet"

## Verification

- ทุกขั้น: `npm test` และ `npm run lint` ผ่าน โดย `tests/app.test.ts` และ `tests/time.test.ts` ไม่ถูกแก้ (`git diff --stat main -- tests/app.test.ts tests/time.test.ts` ว่าง)
- รันทีละไฟล์ระหว่างทำ: `npx vitest run tests/reports-api.test.ts`
- จบขั้น 3 และขั้น 8: `npm run dev` แล้ว `curl -X POST localhost:3000/reports` ด้วยรายงานที่ถูกต้อง ตามด้วย `curl localhost:3000/districts/sai-mai` ต้องเห็น `reports.items` พร้อมป้าย และ `var/reports.json` ไม่มี IP ดิบ
- จบขั้น 6: ส่งครั้งที่ 6 ได้ 429 พร้อม header `Retry-After`
