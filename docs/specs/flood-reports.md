# Spec: คนในพื้นที่รายงานจุดน้ำท่วม

- Intent: [`docs/intent/flood-reports.md`](../intent/flood-reports.md)
- Status: **Draft รอ Save รีวิว** (การตัดสินใจเชิงนโยบายทั้งหมดใน §1 ยืนยันแล้ว, ค่าที่ผมกำหนดเองอยู่ใน §6)
- ออกแบบภายใต้ Skill `security-baseline` (ดู §7 ตารางไล่ข้อ)

## 1. การตัดสินใจที่ Save ยืนยันแล้ว

| Q | คำตอบ | ผลต่อ spec |
| - | ----- | ---------- |
| Q1 | ความลึกเป็น enum `ankle`/`knee`/`waist` = **10 / 50 / 100 cm** ค่าชั่วคราว ไม่มีช่องกรอก cm เอง | RPT-REQ-006 ค่าอยู่ในตาราง `DEPTH_CM` ที่เดียว ยังรอผู้เชี่ยวชาญด้านน้ำยืนยันตัวเลข |
| Q2 | เห็นย้อนหลังได้ไม่เกิน **3 ชม.** แสดงไม่เกิน **6 ชม.** | RPT-REQ-007, RPT-REQ-011 |
| Q3 | เกณฑ์ 30 วินาที / 10% / 2 ชม. / 5% ใช้ตามเดิม แบ่งเป็น testable กับ วัดทีหลัง | §8 |
| Q4 | รวมรายงานซ้ำด้วย **เขต + ข้อความที่ normalize แล้วเหมือนกัน** | RPT-REQ-010 |
| Q5 | **5 รายงาน / ชม. / IP**, จุดสังเกตสูงสุด **80 ตัวอักษร** | RPT-REQ-004, RPT-REQ-008 |
| Q6 | เบอร์โทรในจุดสังเกต **ปิดเป็น `***` ก่อนเก็บ** (ไม่ปฏิเสธรายงาน) | RPT-REQ-005 |
| Q7 | เก็บใน **memory** ลบเมื่อหมดอายุ | RPT-REQ-012 |
| A1 | รายงานซ้ำที่ความลึกต่างกัน **ใหม่กว่าชนะ** (`seenAt` มากกว่า) | RPT-REQ-010 |
| A2 | request ที่ถูกปฏิเสธ 4xx **ไม่กินโควตา** นับเฉพาะที่ยอมรับ | RPT-REQ-008 |
| A6 | แนบ `NOTICE` ในทุก response รวม **404 เดิม** ใน `handle()` ด้วย | RPT-REQ-016 |
| ที่อยู่ละเอียด | ปิดรูปแบบ `บ้านเลขที่/เลขที่/บ้าน` + เลขที่บ้าน เป็น `***` แนวเดียวกับเบอร์โทร | RPT-REQ-005 |

> Q6 เลือกปิดเบอร์ ไม่ปฏิเสธ ซึ่งเสี่ยงกว่า เพราะ regex พลาดแล้วเบอร์จะหลุดเก็บ spec จึงกำหนดให้ masking ทำก่อนทุกขั้น (เก็บ, dedupe, log, response) และให้ตรวจแบบ aggressive (ยอม false positive ดีกว่าปล่อยเบอร์หลุด) ดู edge case E1–E4 และ E27–E29

## 2. Requirements

ค่าคงที่ทั้งหมด import ได้จาก `src/reports.ts` ตั้งชื่อตามนี้เพื่อให้ test อ้างได้ (`RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` นิยามใน `src/rate-limit.ts` แล้ว re-export จาก `src/reports.ts` เพื่อกัน import วนระหว่างสองไฟล์)

| ค่าคงที่ | ค่า |
| -------- | --- |
| `MAX_BACKDATE_MS` | 3 × 60 × 60 × 1000 |
| `DISPLAY_TTL_MS` | 6 × 60 × 60 × 1000 |
| `LANDMARK_MIN` / `LANDMARK_MAX` | 2 / 80 (นับ Unicode code point) |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | 5 / 3,600,000 |
| `MAX_BODY_BYTES` | 2048 |
| `MAX_ACTIVE_REPORTS` | 1000 |

### RPT-REQ-001 ส่งรายงานโดยไม่ต้องล็อกอิน

`POST /districts/:id/reports` รับ JSON `{ landmark, depth, seenAt }` ไม่ต้องมี auth สำเร็จตอบ `201` (รายงานใหม่) หรือ `200` (รวมกับรายงานเดิม ดู REQ-010)

- AC1: request ที่ถูกต้องโดยไม่มี header ใดๆ นอกจาก body ได้ `201` และ `body.report.id` เป็น UUID
- AC2: `body.notice === NOTICE`, `body.merged === false`
- AC3: รายงานที่ส่งแล้วปรากฏใน `GET /districts/:id` → `userReports` (REQ-011)

### RPT-REQ-002 เขตมาจาก path และต้องอยู่ใน 12 เขตที่ระบบรู้จัก

> north-water 01 (academy#60): `:id` เป็น P-code ของ COD-AB เช่น `TH1038` slug เดิม 12 ตัว (`lat-phrao` …) ยังใช้ได้เป็น alias หนึ่งรุ่น response และที่เก็บรายงานใช้ P-code เสมอ regex ของ route เป็น `[A-Za-z0-9-]+` แล้วตรวจกับรายการ (`resolveDistrictId`)

- AC1: `POST /districts/atlantis/reports` ได้ `404` `{ notice, error: "unknown district" }` และไม่มีอะไรถูกเก็บ
- AC2: ทุก slug ใน `districts` ส่งได้ (รวม `sai-mai` ที่ไม่มีสถานีวัด)
- AC3: `body` ไม่มี field `district`/`districtId` การส่งมาถือเป็น field แปลก (REQ-003)

### RPT-REQ-003 Validate รูปทรง body ที่ boundary

Body ต้องเป็น object ธรรมดา มี field `landmark`, `depth`, `seenAt` ครบและเป็น string ทั้งหมด **ไม่รับ field อื่น**

- AC1: body เป็น `undefined`, `null`, array, string, number → `400` `error: "invalid_body"`
- AC2: ขาด field ใด field หนึ่ง หรือชนิดไม่ใช่ string → `400` พร้อม `field` ชื่อ field นั้น
- AC3: มี field เกิน เช่น `phone`, `name`, `ip`, `lat`, `__proto__` → `400` `error: "unknown_field"` และไม่เก็บอะไร
- AC4: response ผิดพลาดทุกแบบมีแค่ `notice`, `error` (รหัส) และ `field` (ถ้ามี) **ห้าม echo ค่าที่ผู้ใช้ส่งมา**

### RPT-REQ-004 Validate จุดสังเกต

ทำตามลำดับ: (1) NFKC (2) ปฏิเสธถ้ามี control char (`\p{Cc}`) (3) ลบ format char (`\p{Cf}` เช่น zero-width) (4) trim และยุบช่องว่างซ้ำเป็นช่องเดียว (5) ตรวจความยาว `LANDMARK_MIN`–`LANDMARK_MAX` code point **ก่อน masking** (6) masking (REQ-005)

- AC1: 80 code point ผ่าน, 81 ได้ `400` `landmark_invalid`, 1 ตัวหลัง trim ได้ `400`
- AC2: มี `\n`, `\t`, `\u0000` → `400`
- AC3: `"ซอย​ลาดพร้าว"` ถูกเก็บเป็น `"ซอยลาดพร้าว"`
- AC4: ช่องว่างล้วน → `400`
- AC5: นับตัวอักษรไทยที่มีสระ/วรรณยุกต์ตาม code point (ไม่ใช่ grapheme) ผลนับต้องเสถียรและมี test ล็อกไว้

### RPT-REQ-005 ปิดเบอร์โทรและเลขที่บ้านก่อนทำอย่างอื่น

หลัง REQ-004 ข้อ (1)–(4) ให้ทำ 2 กฎ (ลำดับ: เบอร์โทรก่อน แล้วเลขที่บ้าน เพื่อไม่ให้ `บ้าน` + เบอร์ที่คั่นด้วยช่องว่างทำให้เบอร์หลุดบางส่วน ดู E30) แต่ละกฎแทนที่ช่วงที่จับได้ด้วย `***`

1. **เบอร์โทร**: ตัวเลข **9 ตัวขึ้นไป** ติดกัน นับทั้ง ASCII `0-9` และเลขไทย `๐-๙` ตัวเลขอาจคั่นด้วยช่องว่าง `-` `.` `(` `)` กี่ตัวก็ได้
2. **เลขที่บ้าน**: คำนำ `บ้านเลขที่` | `เลขที่` | `บ้าน` (ตามด้วยช่องว่างได้) แล้วตามด้วยเลขที่บ้าน คือตัวเลข (ASCII หรือไทย) ต่อกันด้วย `/` หรือ `-` ได้ เช่น `45`, `45/12`, `๔๕-๑๒` ทั้งก้อนคำนำ+เลขถูกแทนด้วย `***`

หลัง masking ถ้าไม่เหลืออักษรอื่นนอกจาก `*` และช่องว่าง → `400` `landmark_invalid`

Masking ต้องเกิดก่อนการคำนวณ dedupe key, ก่อนเก็บ, ก่อนสร้าง response และก่อน log ใดๆ ข้อความดิบต้องไม่ออกจาก function validate

- AC1: `"ตรงข้าม 081-234-5678"` → เก็บ/ตอบ `"ตรงข้าม ***"`
- AC2: `"โทร 0812345678"`, `"โทร ๐๘๑๒๓๔๕๖๗๘"`, `"โทร +66 81 234 5678"` → ไม่มีตัวเลข 9 หลักเหลือในผลลัพธ์
- AC3: `"ซอยลาดพร้าว 71"` และ `"ซอย 12/3 ถนน 45"` ไม่ถูกแก้
- AC4: ตัวเลขพอดี 8 หลักไม่ถูกปิด, 9 หลักถูกปิด
- AC5: `"081-234-5678"` อย่างเดียว → `400`
- AC6: property test เล็กๆ: สุ่มเบอร์ 9–13 หลักฝังในข้อความ ผลลัพธ์ต้องไม่มี substring ตัวเลข ≥ 9 หลักติดกัน
- AC7: `"บ้านเลขที่ 45/12 ซอยลาดพร้าว 71"` → `"*** ซอยลาดพร้าว 71"`, `"เลขที่ ๔๕"` → `400` (ไม่เหลืออะไรหลังปิด), `"บ้าน 45/12 หน้าปากซอย"` → `"*** หน้าปากซอย"`
- AC8: `"บ้านสีฟ้าปากซอย"`, `"เลขที่ก่อนถึงสะพาน"` (ไม่มีเลขตามหลังคำนำ) และ `"ซอยลาดพร้าว 71"` ไม่ถูกแก้
- AC9: ข้อจำกัดที่รู้ (ตรึงด้วย test เพื่อให้เห็นว่าเป็นการตัดสินใจ ไม่ใช่บั๊ก): `"45/12 ซอยลาดพร้าว"` ที่ไม่มีคำนำ **ไม่ถูกปิด** (ดู §7)

### RPT-REQ-006 ความลึกเป็น enum และเก็บเป็น cm จำนวนเต็ม

`depth` ต้องเป็น `"ankle"` | `"knee"` | `"waist"` (ตัวพิมพ์เล็กตรงตัว) แปลงตาม `DEPTH_CM = { ankle: 10, knee: 50, waist: 100 }` ตอนบันทึก report เก็บทั้ง `depthLevel` และ `depthCm`

- AC1: ทั้ง 3 ค่าให้ `depthCm` 10/50/100 และ `Number.isInteger` เป็นจริง
- AC2: `"KNEE"`, `"knee "`, `"chest"`, `50`, `"50"`, `null` → `400` `depth_invalid`
- AC3: ไม่มี code path ที่รับตัวเลข cm จาก client

### RPT-REQ-007 เวลาที่เห็น

`seenAt` เป็น ISO 8601 ที่มี `Z` หรือ offset `±HH:MM` ชัดเจน (regex เข้ม, วันที่ต้องมีจริง) ต้อง `now − MAX_BACKDATE_MS ≤ seenAt ≤ now` (เท่ากับขอบผ่านทั้งสองด้าน) เก็บเป็น `Date` (UTC) และตอบเป็น Bangkok ISO ผ่าน `toBangkokIso`

- AC1: `seenAt = now` ผ่าน, `now + 1ms` → `400` `seen_at_future`
- AC2: `now − 3h` ผ่าน, `now − 3h − 1ms` → `400` `seen_at_too_old`
- AC3: `"2026-09-30T19:00:00+07:00"` กับ `"2026-09-30T12:00:00Z"` เก็บเป็นเวลาเดียวกัน
- AC4: ไม่มี offset (`"2026-09-30T12:00:00"`), รูปแบบอื่น (`"30/09/2026"`, epoch), วันไม่มีจริง (`2026-02-30`) → `400` `seen_at_invalid`
- AC5: `body.report.seenAt` ลงท้าย `+07:00`

### RPT-REQ-008 Rate limit ต่อ client

รายงานที่ **ได้รับการยอมรับ** (201 หรือ 200 จากการรวม) นับเป็นโควตาของ client key ได้ไม่เกิน `RATE_LIMIT_MAX` ต่อหน้าต่างเลื่อน `RATE_LIMIT_WINDOW_MS` เกินแล้วตอบ `429` `{ error: "rate_limited", retryAfterSec }` พร้อม header `Retry-After` (วินาที, จำนวนเต็ม ≥ 1) ตรวจโควตา **ก่อน** validate body รายงานที่ถูกปฏิเสธด้วย 4xx ไม่กินโควตา (การตัดสินใจ A2)

- AC1: 5 รายงานแรกจาก key เดียวกันผ่าน, ที่ 6 ได้ `429`
- AC2: key อื่นไม่โดนผลกระทบ
- AC3: `retryAfterSec = ceil((เวลารายงานเก่าสุดในหน้าต่าง + window − now) / 1000)`
- AC4: เมื่อรายงานเก่าสุดพ้นหน้าต่างพอดี (`now = t0 + window`) ส่งได้อีก
- AC5: รายงานที่ถูกรวม (REQ-010) นับโควตา ส่งข้อความเดิมซ้ำไม่เลี่ยงโควตา
- AC6: `400` ไม่ลดโควตา

### RPT-REQ-009 การระบุ client และการไม่เก็บ IP

Client key มาจาก `req.socket.remoteAddress` เท่านั้น **ไม่อ่าน** `X-Forwarded-For`/`Forwarded` (ปลอมได้) `::ffff:a.b.c.d` normalize เป็น `a.b.c.d`, IPv6 ใช้ prefix /64 เป็น key ค่านี้ส่งผ่าน `Context.clientKey` เข้า `handle()` และถูกใช้ใน rate limiter ใน memory เท่านั้น ห้ามปรากฏใน report, response, log, error, หรือไฟล์ใดๆ ถ้าไม่มี `clientKey` (เช่นใน test เดิม) ให้ใช้ bucket ร่วมชื่อ `"unknown"` (fail closed) ไม่ข้ามการจำกัด

- AC1: `clientKeyFromAddress("::ffff:203.0.113.7") === "203.0.113.7"`
- AC2: ที่อยู่ IPv6 สองอันใน /64 เดียวกันได้ key เดียวกัน
- AC3: ส่ง header `X-Forwarded-For` ต่างกันไม่เปลี่ยนโควตา
- AC4: `JSON.stringify` ของ report ที่เก็บและ response ไม่มี clientKey
- AC5: `handle("POST", …, ctx ไม่มี clientKey)` ยังถูกจำกัดโควตาใน bucket `unknown`

### RPT-REQ-010 รวมรายงานซ้ำ

dedupe key = `districtId` + `"\u0000"` + (จุดสังเกตหลัง REQ-004/005 แปลง lowercase) ค้นเฉพาะรายงานที่ยังไม่หมดอายุ ถ้าเจอ → ไม่สร้างใหม่ เพิ่ม `confirmations` ขึ้น 1 และถ้า `seenAt` ใหม่ **ใหม่กว่า** ของเดิม ให้อัปเดต `seenAt`, `depthLevel`, `depthCm` เป็นของรายงานใหม่ (การตัดสินใจ A1: ใหม่กว่าชนะ) ตอบ `200` `merged: true`

- AC1: ส่งซ้ำ 2 ครั้ง → `userReports` มี 1 รายการ `confirmations: 2`
- AC2: `"ปากซอย  ลาดพร้าว 71"`, `"ปากซอย ลาดพร้าว 71 "`, `"ปากซอย​ ลาดพร้าว 71"` รวมกับ `"ปากซอย ลาดพร้าว 71"`
- AC3: ตัวพิมพ์ใหญ่/เล็กอังกฤษถือว่าเหมือนกัน
- AC4: เขตต่างกัน ข้อความเดียวกัน ไม่รวม
- AC5: รายงานใหม่เก่ากว่า → `confirmations` เพิ่มแต่ `seenAt`/depth ไม่เปลี่ยน
- AC6: เบอร์ต่างกันแต่ข้อความอื่นเหมือนกัน (`"หน้าร้าน 0811111111"` กับ `"หน้าร้าน 0822222222"`) รวมกัน เพราะหลัง mask เป็น `"หน้าร้าน ***"` เหมือนกัน

### RPT-REQ-011 การแสดงผลแยกจากสถานีวัดและติดป้ายเสมอ

`GET /districts/:id` เพิ่ม key `userReports` (array) **โดยไม่แก้ key เดิม** (`notice`, `district`, `stations`) แสดงรายงานที่ `now − seenAt < DISPLAY_TTL_MS` เรียง `seenAt` ใหม่สุดก่อน (เท่ากันเรียงตาม id) เขตที่ไม่มีรายงานได้ `[]` ไม่ใช่ `null` แต่ละรายการ:

```json
{
  "id": "uuid",
  "source": "user-report",
  "verified": false,
  "label": "ผู้ใช้รายงาน ยังไม่ยืนยัน",
  "landmark": "หน้าปากซอยลาดพร้าว 71",
  "depthLevel": "knee",
  "depthCm": 50,
  "seenAt": "2026-09-30T19:00:00+07:00",
  "ageMinutes": 40,
  "ageLabel": "เห็นเมื่อ 40 นาทีก่อน",
  "confirmations": 1
}
```

`ageMinutes = floor((now − seenAt)/60000)` `ageLabel`: < 1 นาที → `"เห็นเมื่อสักครู่"`, 1–59 → `"เห็นเมื่อ N นาทีก่อน"`, ≥ 60 → `"เห็นเมื่อ H ชั่วโมงก่อน"` (H = floor ชั่วโมง)

- AC1: test เดิมใน `tests/app.test.ts` ผ่านโดยไม่แก้ไฟล์
- AC2: `stations[*]` ไม่มีข้อมูลจากรายงานปน และ `userReports[*]` ไม่มี `levelCm`
- AC3: ทุกรายการมี `source`, `verified === false`, `label` ตรงตัว
- AC4: อายุ 5h59m59s แสดง, 6h00m00s ไม่แสดง
- AC5: `ageLabel` ครบสามช่วง (0 วินาที, 40 นาที, 125 นาที → `"เห็นเมื่อ 2 ชั่วโมงก่อน"`)
- AC6: เรียงลำดับตามที่กำหนด
- AC7: response ของ `userReports` ไม่มีข้อมูลของผู้รายงาน (ไม่มี field นอกรายการข้างบน)

### RPT-REQ-012 ลบรายงานที่หมดอายุ

รายงานที่ `now − seenAt ≥ DISPLAY_TTL_MS` ถูก **ลบออกจาก memory** ทุกครั้งที่มี `POST` หรือ `GET` เขตใดก็ตาม (lazy purge ไม่มี timer) และ rate limiter ตัดรายการเก่ากว่าหน้าต่างทิ้งในจังหวะเดียวกัน ไม่มี persistence ลงไฟล์

- AC1: หลังเวลาผ่าน 6 ชม. `GET` แล้ว `store.size() === 0`
- AC2: ส่งข้อความเดียวกันหลังรายงานเดิมหมดอายุ → `201` รายงานใหม่ (ไม่ merge กับซาก)
- AC3: rate limiter map ไม่มี key ที่ไม่มีรายการในหน้าต่าง
- AC4: ไม่มีการเรียก `fs.*` เขียนไฟล์ (spy)

### RPT-REQ-013 ไม่เก็บและไม่ log ข้อมูลส่วนบุคคล

Record ที่เก็บมี field เท่ากับ `Report` ใน §3.1 เท่านั้น ไม่มี IP, user-agent, ชื่อ, เบอร์, พิกัด log ใน feature นี้เขียนได้เฉพาะ `id` ของรายงาน, `districtId` และรหัสผลลัพธ์ (`created`, `merged`, `rate_limited`, …) **ห้าม log body, จุดสังเกต, client key, error message ดิบ**

- AC1: spy `console.log/info/warn/error` และ `process.stdout/stderr.write` ตลอด flow (สำเร็จ, 400 ทุกชนิด, 429, 500) แล้วค้นหา IP ที่ใช้ทดสอบ, ข้อความจุดสังเกต, และเบอร์ที่พิมพ์เข้าไป ต้องไม่พบ
- AC2: `Object.keys(report)` เท่ากับชุด field ใน §3.1
- AC3: เมื่อ `JSON.parse` ล้มเหลว response เป็น `{ notice, error: "invalid JSON" }` ตายตัว ไม่มี message ของ parser

### RPT-REQ-014 จำกัดขนาดและทรัพยากร

- body เกิน `MAX_BODY_BYTES` → หยุดอ่านและตอบ `413` `payload_too_large` โดยไม่ parse (ทำใน `src/read-body.ts`)
- รายงานที่ยัง active ทั้งระบบถึง `MAX_ACTIVE_REPORTS` และรายงานใหม่ต้องสร้างรายการเพิ่ม → `503` `store_full` (การ merge ยังทำได้)
- AC1: stream 2049 byte ได้ `413` และไม่ถูก parse
- AC2: stream 2048 byte ผ่านด่านนี้
- AC3: เติมครบ 1000 แล้วส่งข้อความใหม่ได้ `503`, ส่งข้อความซ้ำได้ `200`
- AC4: `503` ไม่กินโควตา rate limit

### RPT-REQ-015 Error ตายตัว ไม่รั่ว

ความผิดพลาดที่ไม่คาดคิดใน `handle()` ต้องถูกจับที่ `server.ts` ตอบ `500` `{ error: "internal" }` โดยไม่มี stack/ข้อความ และไม่ล้ม process

- AC1: จำลอง store โยน exception → `500` `{ error: "internal" }` และ server ยังตอบ request ถัดไป
- AC2: body ของ 500 ไม่มีข้อความจาก exception

### RPT-REQ-016 ป้าย notice ในทุก response

ทุก response ของ API ทั้ง endpoint ใหม่และเดิม ทั้งสำเร็จและ error มี `notice: NOTICE` รวม `404` เดิมใน `handle()` (`unknown district` ของ GET, `not found`) และ error ที่สร้างใน `server.ts` (`400 invalid JSON`, `413`, `500`) รายงานทุกชิ้นที่แสดงมี `label` ตาม REQ-011 เพราะ NOTICE เดิมบอกว่าข้อมูลเป็นข้อมูลสมมติ ไม่ได้บอกว่าเป็นข้อมูลที่ผู้ใช้รายงาน

- AC1: `201`, `200`, `400`, `404`, `413`, `429`, `503` ของ `POST /districts/:id/reports` มี `notice`
- AC2: `400 invalid JSON`, `413`, `500` ที่สร้างใน `server.ts` มี `notice`
- AC3: `GET /districts/atlantis` และ `GET /nope` ตอบ `404` พร้อม `notice` และ `error` เดิม (`"unknown district"`, `"not found"`)
- AC4: test เดิมใน `tests/app.test.ts` ยังผ่านโดยไม่แก้ไฟล์ (ตรวจแค่ `status` ของ 404 และใช้ `toMatchObject` จึงเข้ากันได้)

### RPT-REQ-017 โครงสร้างโค้ดและข้อห้าม

- Logic อยู่ใน `src/reports.ts` และ `src/rate-limit.ts` ไม่ import `node:http` `handle()` ยังเป็น function บริสุทธิ์ที่ inject ได้ (`Context` เพิ่ม field ที่ optional)
- ไม่เพิ่ม dependency ใหม่ ใช้ `node:crypto` (`randomUUID`) ที่มากับ Node
- feature ไม่เรียก network ออกภายนอกเลย โดยเฉพาะ `flood-api.rooptanjai.com`
- AC1: `package.json` `dependencies`/`devDependencies` ไม่เปลี่ยน
- AC2: test stub `globalThis.fetch` และ `node:http(s).request` แล้วยืนยันว่าไม่ถูกเรียกตลอด flow
- AC3: `npm test` และ `npm run lint` ผ่าน โดยไฟล์ test เดิมไม่ถูกแก้
- AC4: test แต่ละไฟล์สร้าง store และ limiter ใหม่ผ่าน `Context` ไม่พึ่ง state ร่วมข้าม test

## 3. Design

### 3.1 Data model (`src/reports.ts`)

```ts
export type DepthLevel = "ankle" | "knee" | "waist"
export const DEPTH_CM: Record<DepthLevel, number> = { ankle: 10, knee: 50, waist: 100 }

/** ที่เก็บใน memory ไม่มี IP, UA, ชื่อ, เบอร์, พิกัด */
export type Report = {
  id: string            // crypto.randomUUID()
  districtId: string    // P-code ใน districts เช่น TH1038 (north-water 01)
  kind: "flooded" | "arriving"  // north-water 04; เป็นส่วนหนึ่งของ dedupe key คู่กับ districtId และ landmarkKey
  landmark: string      // ผ่าน normalize + mask แล้ว ใช้แสดงผล
  landmarkKey: string   // landmark.toLowerCase() ใช้ dedupe
  depthLevel: DepthLevel
  depthCm: number       // จำนวนเต็ม หน่วย cm
  seenAt: Date          // UTC
  confirmations: number // จำนวนเต็ม ≥ 1
}

export type ReportStore = {
  submit(input: unknown, districtId: string, clientKey: string, now: Date): SubmitResult
  activeIn(districtId: string, now: Date): Report[]
  size(): number
}

export type SubmitResult =
  | { ok: true; merged: boolean; report: Report }
  | { ok: false; status: 400 | 429 | 503; error: string; field?: string; retryAfterSec?: number }

export function createReportStore(limiter?: RateLimiter): ReportStore
export function toPublicReport(r: Report, now: Date): PublicReport
export function ageLabelTh(ageMinutes: number): string
```

ลำดับใน `submit()`: purge หมดอายุ → ตรวจโควตา (REQ-008) → validate shape/landmark/depth/seenAt (REQ-003–007) → ค้น dedupe (REQ-010) → ถ้าต้องสร้างใหม่และเต็ม → `503` (REQ-014) → เขียนและบันทึกโควตา

### 3.2 Rate limiter (`src/rate-limit.ts`)

```ts
export type RateLimiter = {
  check(key: string, now: Date): { allowed: true } | { allowed: false; retryAfterSec: number }
  record(key: string, now: Date): void
  prune(now: Date): void   // ตัด entry ที่พ้นหน้าต่างและ key ที่ว่างทิ้ง เรียกจาก purge ของ store (REQ-012 AC3)
  size(): number   // จำนวน key ที่มีรายการในหน้าต่าง
}
export function createRateLimiter(max = RATE_LIMIT_MAX, windowMs = RATE_LIMIT_WINDOW_MS): RateLimiter
export function clientKeyFromAddress(addr: string | undefined): string
```

Sliding-window log ต่อ key เก็บแค่ timestamp (ตัวเลข) ไม่มีข้อมูลอื่น ใน memory เท่านั้น

### 3.3 API ที่เพิ่มหรือเปลี่ยน

| Method + path | สถานะ | Request | Response |
| ------------- | ----- | ------- | -------- |
| `POST /districts/:id/reports` | **ใหม่** | `{ landmark, depth, seenAt }` | `201`/`200` `{ notice, merged, report: PublicReport }` |
| `GET /districts/:id` | **เปลี่ยน (เพิ่ม key)** | – | `{ notice, district, stations, userReports: PublicReport[] }`; `404` ตอนนี้ `{ notice, error }` |
| route อื่นที่ไม่ตรง | **เปลี่ยน** | – | `404` `{ notice, error: "not found" }` |
| `POST /districts/:id/reports` (north-water 04) | **เปลี่ยน** | เพิ่ม `kind` (ไม่บังคับ) `"flooded"` \| `"arriving"` ไม่ส่งถือเป็น `"flooded"` | `report.kind`; `:id` รับอำเภอ/เขตใดก็ได้ในลุ่มน้ำเจ้าพระยา (P-code) ค่าอื่นได้ `400` `kind_invalid` |
| `GET /basin` (north-water 04) | **ใหม่** | – | `{ notice, provinces: [{ id, nameTh, nameEn, districts: [{ id, nameTh, nameEn, centre }] }] }` 12 จังหวัดในลุ่มน้ำ |
| `GET /basin/reports` (north-water 04) | **ใหม่** | – | `{ notice, reports: (PublicReport & { districtId })[] }` ทุกรายงานที่ยังไม่หมดอายุในลุ่มน้ำ ไม่มีพิกัด |
| `GET /districts` | **เปลี่ยน (เพิ่ม field)** (flood-map) | – | แต่ละเขตมี `centre: [lon, lat]` (กึ่งกลางเขต) ต่อท้าย field เดิม `GET /districts/:id` → `district` ก็มี `centre` เช่นกัน เป็นพิกัดของเขต ไม่ใช่ของผู้รายงาน (REQ-013) |

รหัสความผิดพลาดของ `POST`

| Status | `error` | เมื่อ |
| ------ | ------- | ----- |
| 400 | `invalid_body` | body ไม่ใช่ object |
| 400 | `unknown_field` | มี field นอก 3 ตัว |
| 400 | `landmark_invalid` | ชนิด/ความยาว/อักขระ/ว่างหลัง mask ผิด (`field: "landmark"`) |
| 400 | `depth_invalid` | (`field: "depth"`) |
| 400 | `seen_at_invalid` / `seen_at_future` / `seen_at_too_old` | (`field: "seenAt"`) |
| 404 | `unknown district` | ข้อความเดิมของระบบ (ตอนนี้แนบ `notice` ด้วย) |
| 413 | `payload_too_large` | body > 2048 byte |
| 429 | `rate_limited` | เกินโควตา มี `retryAfterSec` และ header `Retry-After` |
| 503 | `store_full` | รายงาน active ครบ 1000 |
| 500 | `internal` | exception ไม่คาดคิด |

การเปลี่ยนใน `src/app.ts`

- `Context = { now: Date; clientKey?: string; reports?: ReportStore }` (field ใหม่ optional เพื่อให้ `handle(…, { now })` ใน test เดิมทำงานต่อได้; `reports` ไม่ส่ง = ใช้ store กลางของโมดูล)
- `Response = { status; body; headers?: Record<string, string> }` ใช้ส่ง `Retry-After`
- route `POST /districts/:id/reports` ด้วย regex ตระกูลเดียวกับเดิม `^\/districts\/([a-z-]+)\/reports$`

### 3.4 ไฟล์ที่ต้องแก้

| ไฟล์ | สถานะ | งาน |
| ---- | ----- | --- |
| `src/reports.ts` | ใหม่ | ชนิด, ค่าคงที่, validate, normalize, mask, dedupe, store, `toPublicReport`, `ageLabelTh` |
| `src/rate-limit.ts` | ใหม่ | limiter, `clientKeyFromAddress` |
| `src/read-body.ts` | ใหม่ | อ่าน body เป็น stream พร้อม cap `MAX_BODY_BYTES` ทดสอบได้ด้วย `Readable` |
| `src/app.ts` | แก้ | `Context`/`Response` เพิ่ม field, route ใหม่, `userReports` ใน `GET /districts/:id`, แนบ `notice` ใน `404` เดิมทั้งสองจุด |
| `src/server.ts` | แก้ | ใช้ `read-body`, ส่ง `clientKey` จาก `req.socket.remoteAddress`, ส่ง `headers`, try/catch → `500`, `notice` ใน 413/500, ไม่เพิ่ม log |
| `tests/reports.test.ts` | ใหม่ | REQ-004–007, 010, 012 (unit ต่อ store) |
| `tests/rate-limit.test.ts` | ใหม่ | REQ-008, 009 |
| `tests/reports-api.test.ts` | ใหม่ | REQ-001–003, 011, 013–017 ผ่าน `handle()` และ spy log/network (รวม 404 เดิมมี `notice`) |
| `tests/read-body.test.ts` | ใหม่ | REQ-014 |
| `README.md` | แก้เล็ก | ตัวอย่าง `curl -X POST` เฉพาะ `localhost` |
| `tests/app.test.ts`, `tests/time.test.ts` | **ห้ามแก้** | ต้องผ่านตามเดิม |

## 4. Edge cases

| # | กรณี | พฤติกรรมที่ต้องเป็น | REQ |
| - | ---- | -------------------- | --- |
| E1 | เบอร์คั่นแปลก: `081 234 5678`, `081.234.5678`, `(081)2345678`, `+66 81 234 5678`, เลขไทย | ถูกปิดเป็น `***` ทั้งช่วง | 005 |
| E2 | ตัวเลขยาว 8 หลัก, เลขซอย `71`, `12/3` | ไม่ถูกปิด (ขอบล่างของ false positive) ส่วน 9 หลักขึ้นไปที่ไม่ใช่เบอร์ เช่น เลขบัตรประชาชน 13 หลัก ถูกปิดด้วย ซึ่งยอมรับได้ | 005 |
| E3 | จุดสังเกตเป็นเบอร์ล้วน | `400 landmark_invalid` ไม่เก็บ | 005 |
| E4 | เบอร์แทรก zero-width (`081​2345678`) เพื่อหนี regex | ลบ format char ก่อน mask จึงถูกปิด | 004, 005 |
| E5 | `seenAt` ขอบ: `now`, `now+1ms`, `now−3h`, `now−3h−1ms` | ผ่าน / `seen_at_future` / ผ่าน / `seen_at_too_old` | 007 |
| E6 | `seenAt` ไม่มี offset, รูปแบบอื่น, `2026-02-30`, `+07:00` กับ `Z` เวลาเดียวกัน | invalid / invalid / invalid / เก็บเท่ากัน | 007 |
| E7 | นาฬิกามือถือเดินเร็ว ทำให้ `seenAt` ล้ำอนาคตเล็กน้อย | ปฏิเสธตามกติกา `seen_at_future` (ไม่มี tolerance ตาม intent: "ห้ามเป็นเวลาในอนาคต") | 007 |
| E8 | รายงานอายุพอดี 6 ชม. | ไม่แสดง และถูกลบ | 011, 012 |
| E9 | ข้อความซ้ำต่างช่องว่าง/ตัวพิมพ์/zero-width | รวมเป็นรายการเดียว | 010 |
| E10 | ข้อความเดียวกันแต่ต่างเขต | ไม่รวม | 010 |
| E11 | รายงานซ้ำที่ depth ต่างกันและใหม่กว่า | อัปเดตเป็นค่าใหม่ `confirmations`+1 ถ้าเก่ากว่าแค่ `confirmations`+1 | 010 |
| E12 | ส่งซ้ำหลังรายงานเดิมหมดอายุ | สร้างใหม่ ไม่ merge | 012 |
| E13 | ครั้งที่ 6 ในหนึ่งชั่วโมง / ครบ 1 ชม. พอดี | `429` พร้อม `Retry-After` / ส่งได้อีก | 008 |
| E14 | ส่งข้อความเดิมซ้ำเพื่อดัน `confirmations` | นับโควตา ถูก `429` ที่ครั้งที่ 6 | 008, 010 |
| E15 | ปลอม `X-Forwarded-For` เพื่อเปลี่ยน IP | ไม่มีผล ใช้ socket address | 009 |
| E16 | IPv6 ที่เปลี่ยน suffix ทุกครั้ง, `::ffff:` IPv4 | key เดียวกันใน /64, normalize IPv4 | 009 |
| E17 | ไม่มี `clientKey` ใน context | ใช้ bucket `unknown` ยังจำกัดโควตา | 009 |
| E18 | body เป็น `null`/array/string/number, JSON เสีย, body ใหญ่กว่า 2048 byte | `invalid_body` / `invalid JSON` / `413` | 003, 014 |
| E19 | body มี `__proto__`, `phone`, `ip`, `district` | `unknown_field` ไม่มีอะไรถูกเก็บ | 003 |
| E20 | จุดสังเกต 79/80/81 code point, สระ/วรรณยุกต์ไทย, emoji, `\n`, `<script>` | 80 ผ่าน 81 ไม่ผ่านนับตาม code point, control ถูกปฏิเสธ, `<script>` เก็บเป็นข้อความธรรมดา (ผู้แสดงผลต้อง escape ดู §7) | 004 |
| E21 | `depth` เป็น `"KNEE"`, `50`, `"50"`, `null` | `depth_invalid` | 006 |
| E22 | สลับ slug เป็นตัวพิมพ์ใหญ่, มี `/` ท้าย, ขาด `:id` | `404` (regex เดิม `[a-z-]+`) | 002 |
| E23 | รายงาน active ครบ 1000 | รายงานใหม่ `503` ส่งซ้ำของเดิม `200` | 014 |
| E24 | server restart | รายงานหายทั้งหมด ยอมรับตามการตัดสินใจ Q7 | 012 |
| E25 | exception ไม่คาดคิดใน store | `500 internal` ไม่รั่วข้อความ และ server ไม่ตาย | 015 |
| E26 | ส่ง 2 request พร้อมกันจากคนละ connection | `handle()` sync ทำงานทีละตัว โควตาและ dedupe ไม่แข่งกัน (ถ้าเปลี่ยนเป็น async ในอนาคตต้องทำให้ atomic) | 008, 010 |
| E27 | `บ้านเลขที่ 45/12 ซอย…`, `เลขที่ ๔๕`, `บ้าน 45-12` | ปิดคำนำ+เลขที่เป็น `***` ที่เหลือเก็บตามปกติ | 005 |
| E28 | `บ้านสีฟ้า`, `เลขที่ก่อนสะพาน` (คำนำไม่มีเลขตาม) | ไม่ถูกแก้ | 005 |
| E29 | `45/12 ซอยลาดพร้าว` (ไม่มีคำนำ), `no. 45` (อังกฤษ) | **ไม่ถูกปิด** เป็นข้อจำกัดที่ยอมรับ ต้องบันทึกใน §7 และให้ UI เตือนผู้ใช้ | 005 |
| E30 | `บ้าน 081 234 5678`, `บ้าน 081.234.5678` (คำนำบ้าน + เบอร์คั่น) | ปิดเบอร์ก่อน ได้ `บ้าน ***` ไม่เหลือตัวเลขของเบอร์ | 005 |

## 5. Out of scope (รอบนี้ไม่ทำ)

- ระบบล็อกอิน บัญชีผู้ใช้ หรือการอ้างตัวตนผู้รายงาน (จึง **ไม่มีทางแก้/ลบรายงานของตัวเอง** รายงานผิดรอหมดอายุ)
- พิกัด GPS และรูปภาพ (หน้าแผนที่แยกเป็น spec `flood-map` ใน `.scratch/flood-map/spec.md` หมุดวางตามกึ่งกลางเขต ยังไม่เก็บพิกัดของผู้รายงาน)
- ตัวเลข cm อิสระจาก client และการยืนยันตาราง 10/50/100 กับผู้เชี่ยวชาญ (Q1 ยังเปิดอยู่ในเชิงข้อมูล)
- รายการจุดสังเกตที่กำหนดไว้ต่อเขต และการรวมด้วยความคล้ายของข้อความ (fuzzy)
- การตรวจสอบ/ยืนยันรายงาน, moderation, หน้าจอเจ้าหน้าที่เขตหรือกู้ภัย (Q10)
- กรองข้อมูลส่วนบุคคลอื่นนอกจากที่ REQ-005 ครอบคลุม (เบอร์โทร และเลขที่บ้านที่มีคำนำ `บ้านเลขที่/เลขที่/บ้าน`) เช่น อีเมล LINE ID ชื่อ เลขที่บ้านไม่มีคำนำ (`45/12`) หรือเขียนภาษาอังกฤษ (`no. 45`) เบอร์ที่เขียนเป็นคำ (`ศูนย์แปดหนึ่ง…`) และกรองคำหยาบ/ลิงก์
- CAPTCHA, ตรวจอุปกรณ์ (device fingerprint) เพราะขัดกับการไม่เก็บข้อมูลระบุตัว
- การเก็บถาวรลงไฟล์หรือ DB, การ deploy, การเปิดให้ประชาชนใช้ และการตรวจ PDPA/host/งบ (Q8, Q9)
- หน้าเว็บ/ฟอร์ม UI (รอบนี้เป็น API อย่างเดียว)
- เพิ่มดูรายงานทั้งหมดแบบแยก (`GET /districts/:id/reports`) และรายการรวมทุกเขต
- ข้อความภาษาอังกฤษ
- การวัดตัวชี้วัดเชิงผู้ใช้จริง (§8 กลุ่มวัดทีหลัง)
- ทุกการเรียก `flood-api.rooptanjai.com` (ทั้ง POST, DELETE และ GET)

## 6. ค่าที่ผมกำหนดเอง (เหตุผลสั้นๆ)

ไม่ใช่คำถามเชิงนโยบาย เป็นค่าทางวิศวกรรมหรืออ่านตรงจาก intent แก้ได้ที่ค่าคงที่เดียว

| ค่า | ที่กำหนด | เหตุผล |
| --- | --------- | ------ |
| Tolerance นาฬิกาของ `seenAt` | 0 | intent เขียนชัดว่า "ห้ามเป็นเวลาในอนาคต" ฝั่ง client ต้องเผื่อเอง |
| `LANDMARK_MIN` | 2 code point | กัน `.` / `-` / ตัวอักษรเดียวที่ไม่บอกอะไร |
| `MAX_ACTIVE_REPORTS` | 1000 | กัน memory โตไม่จำกัด (รายงานละไม่ถึง 1 KB จึงราว 1 MB) |
| สถานะเมื่อรวมรายงาน | `200` + `merged: true` (ใหม่ = `201`) | ให้ client แยก "สร้างใหม่" กับ "รวมกับของเดิม" จาก status |
| ชุดอักขระของจุดสังเกต | ห้ามแค่ control char (`<>` ไม่ห้าม) | allowlist จะปฏิเสธชื่อสถานที่จริงที่มีเครื่องหมายแปลกๆ ความเสี่ยง XSS จัดการที่ผู้แสดงผล ดู §7 |

## 7. Security baseline: ไล่ข้อ

| ข้อกำหนด | ทำอย่างไรใน spec นี้ |
| --------- | -------------------- |
| Validate ทุก input ที่ boundary | REQ-003–007 ทั้งรูปทรง ชนิด enum เวลา และความยาว, reject field แปลก, cap body (REQ-014), อยู่ใน handler ไม่ไว้ใจ client |
| ตัวเลขวัดเป็นจำนวนเต็มพร้อมหน่วย | `depthCm` จำนวนเต็ม cm จากตารางฝั่งเซิร์ฟเวอร์ ไม่รับตัวเลขจาก client (REQ-006) ส่วน `ageMinutes`/`confirmations`/`retryAfterSec` ก็เป็นจำนวนเต็ม |
| ทุกอย่างที่สาธารณะส่งได้ ต้อง rate-limit ต่อ IP | REQ-008 5/ชม./IP, key จาก socket ไม่เชื่อ header (REQ-009), เพดานทรัพยากร (REQ-014) |
| ห้าม log หรือคืนข้อมูลส่วนบุคคล (รวมที่อยู่ละเอียด) log เป็น ID | REQ-005 (mask เบอร์โทรและเลขที่บ้านที่มีคำนำ), REQ-013 (log เฉพาะ id/รหัส), REQ-003 AC4 และ REQ-015 (ไม่ echo input), REQ-009 (IP ไม่ออกนอก limiter) |
| ที่แสดงสาธารณะต้องบอกว่าเป็นข้อมูลที่ผู้ใช้รายงาน ไม่ใช่ประกาศทางการ | REQ-011 (`source`/`verified`/`label`) และ REQ-016 (`notice`) |

ความเสี่ยงที่เหลือเรื่องที่อยู่ละเอียด: REQ-005 ปิดเฉพาะเลขที่บ้านที่มีคำนำ `บ้านเลขที่/เลขที่/บ้าน` เท่านั้น จุดสังเกตอิสระอย่าง `"45/12 ซอยลาดพร้าว"` หรือ `"no. 45"` ยังหลุดเก็บและแสดงสาธารณะ ซึ่ง **ไม่ผ่าน baseline ข้อ 'ห้ามคืนที่อยู่ละเอียด' เต็มร้อย** Save รับทราบและเลือกแนวทางนี้ ปิดช่องเพิ่มได้ในภายหลัง (เช่น ปฏิเสธเลขบ้านไม่มีคำนำ) และ UI ควรเตือนผู้ใช้ "อย่าใส่เลขที่บ้านหรือเบอร์โทร"

ข้อควรระวังที่ spec นี้ไม่ได้ปิดเอง: จุดสังเกตเป็นข้อความอิสระที่ตัวเองเป็นช่องทางแทรก HTML/สคริปต์ได้ API ตอบ JSON เท่านั้น ผู้ทำหน้า UI ในอนาคต **ต้องแสดงเป็นข้อความธรรมดา (escape)** เสมอ ควรบันทึกเรื่องนี้ไว้ใน plan ของ UI

## 8. ตัวชี้วัดจาก intent

| ตัวชี้วัด | เกณฑ์ | ตรวจได้ด้วย test รอบนี้หรือไม่ |
| --------- | ------ | -------------------------------- |
| ไม่มีเบอร์/IP หลุดใน log | 0 | **ได้** REQ-013 AC1, REQ-005 AC6 |
| ส่ง 6 ครั้งจาก IP เดียว โดนหยุดครั้งที่ 6 | 5/ชม. | **ได้** REQ-008 |
| รายงานซ้ำไม่ทำให้รายการเพิ่ม | 1 รายการ | **ได้** REQ-010 |
| อายุที่แสดงไม่เกิน 6 ชม. | 100% | **ได้** REQ-011 AC4 |
| ส่งสำเร็จใน 30 วินาทีหลังเปิดฟอร์ม, ส่งไม่ผ่านเพราะข้อมูลผิด < 10% | – | ไม่ได้ ต้องมี UI และผู้ใช้จริง วัดทีหลัง |
| เขตที่มีสถานีวัดได้รายงาน ≥ 1 ในช่วงฝนหนัก | – | ไม่ได้ ต้องมีผู้ใช้จริง |
| มัธยฐานอายุรายงาน ≤ 2 ชม. | – | ไม่ได้ ต้องมีผู้ใช้จริง |
| สแปมหลุดหน้าแสดงผล < 5% | – | ไม่ได้ ต้องมีข้อมูลสแปมจริง รอบนี้ตรวจได้แค่กลไกกัน (REQ-008, 010) |

## 9. คำถามที่ยังเปิดอยู่ (ไม่ใช่ของ spec นี้)

Q1 (ยืนยันตัวเลข cm กับผู้เชี่ยวชาญ), Q2 (ยืนยัน 3/6 ชม. กับผู้เชี่ยวชาญ), Q8, Q9, Q10 ยังเป็นของ Save/ผู้เกี่ยวข้องภายนอก การยืนยัน Q1 และ Q2 จะแก้แค่ค่าคงที่ `DEPTH_CM`, `MAX_BACKDATE_MS`, `DISPLAY_TTL_MS` และค่าที่อ้างใน AC
