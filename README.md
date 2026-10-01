# น้ำท่วมไหม: repo ตัวอย่างของคอร์ส AI Coding with Claude

> **ตัวอย่างเพื่อการเรียนเท่านั้น ไม่ใช่ประกาศเตือนภัยทางการ**
> ข้อมูลระดับน้ำใน repo นี้เป็นข้อมูลสมมติ อย่าใช้ตัดสินใจเรื่องความปลอดภัย
> ติดตามสถานการณ์น้ำจริงจากประกาศของกรุงเทพมหานครและหน่วยงานรัฐ

แอปเล็กๆ ที่ใช้ในคอร์ส [AI Coding with Claude](https://academy.codepassion.co/courses/ai-coding-with-claude/) ของ CodePassion Academy
แอปแสดงรายชื่อเขตและระดับน้ำล่าสุดของสถานีวัดในเขตนั้น (จากข้อมูลที่บันทึกไว้)
ในคลาสเราเพิ่มฟีเจอร์**ให้คนในพื้นที่รายงานจุดน้ำท่วม** ตั้งแต่ขั้นวางแผนจนถึงตั้งด่านตรวจอัตโนมัติ
และมีหน้าเว็บแผนที่ที่ `http://localhost:3000` สำหรับดูและแจ้งรายงาน (ดูหัวข้อ "หน้าเว็บแผนที่")
ขั้นตอนทั้งหมดอยู่ใน [Workshop Guide](https://academy.codepassion.co/courses/ai-coding-with-claude/workshop-guide)

> **ห้ามส่งรายงานทดสอบไปที่ระบบจริง** เช่นแผนที่ ROOP TAN JAI Flood Watch (`flood-api.rooptanjai.com`)
> คนใช้แผนที่นั้นตัดสินใจจริงในช่วงน้ำท่วม อ่านข้อมูล (GET) ได้ แต่ห้ามส่งหรือลบรายงาน

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

ลองเรียก (ยิงเฉพาะ `localhost` เท่านั้น)

```bash
curl localhost:3000/districts
curl localhost:3000/districts/lat-phrao

# ส่งรายงานทดสอบ seenAt ต้องเป็นเวลาในช่วง 3 ชั่วโมงที่ผ่านมา มี Z หรือ +07:00
curl -X POST localhost:3000/districts/lat-phrao/reports \
  -H 'content-type: application/json' \
  -d "{\"landmark\":\"ปากซอยลาดพร้าว 71\",\"depth\":\"knee\",\"seenAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
```

ส่งข้อความเดิมซ้ำจะได้ `200` และ `merged: true`, ส่งเกิน 5 ครั้งใน 1 ชั่วโมงจะได้ `429` พร้อม `Retry-After`,
ใส่เบอร์โทรในจุดสังเกตจะถูกเก็บเป็น `***`

## หน้าเว็บแผนที่

เปิด <http://localhost:3000> หลัง `npm run dev` จะเห็นแผนที่ หมุดจุดที่มีคนรายงาน สถานีวัด รายการจุด และปุ่ม **แจ้งจุดน้ำท่วม**

- ตัวแผนที่ใช้ MapLibre GL JS กับไฟล์ PMTiles ที่ host เอง (ดู [ADR 0001](docs/adr/0001-maplibre-pmtiles-basemap.md))
  ไฟล์ทุกอย่างของแผนที่ (MapLibre, pmtiles, basemaps, glyphs, sprites) อยู่ใน `public/vendor/` และเสิร์ฟจาก server นี้ หน้าเว็บไม่ดึงอะไรจากเว็บอื่น
- **ตำแหน่งหมุดเป็นค่าประมาณจากเขต** API ไม่เก็บพิกัดของผู้รายงาน (spec §5, RPT-REQ-013)
- ไฟล์แผนที่พื้นหลังไม่อยู่ใน git ถ้ายังไม่มี หน้าเว็บยังแสดงหมุดบนพื้นเรียบได้ อยากได้ถนนและชื่อสถานที่ให้สร้างไฟล์เอง:

```bash
# ติดตั้ง pmtiles CLI: https://docs.protomaps.com/pmtiles/cli
# ดูชื่อไฟล์ build ล่าสุดที่ https://maps.protomaps.com/builds/ แล้วแทน YYYYMMDD
pmtiles extract https://build.protomaps.com/YYYYMMDD.pmtiles public/tiles/bangkok.pmtiles \
  --bbox=100.30,13.50,100.95,14.05 --maxzoom=15
```

แท็บ **น้ำเหนืออยู่ไหน** (`/#/north`) ใช้ไฟล์ทั้งประเทศอีกไฟล์ ตัดที่ maxzoom 10 จึงเล็ก ถ้าไม่มีไฟล์นี้ แท็บยังแสดงเส้นแบ่งจังหวัดและอำเภอบนพื้นเรียบได้

```bash
pmtiles extract https://build.protomaps.com/YYYYMMDD.pmtiles public/tiles/thailand.pmtiles \
  --bbox=97.30,5.60,105.70,20.50 --maxzoom=10
```

เส้นแบ่งจังหวัดและอำเภอของลุ่มน้ำเจ้าพระยา (`public/data/basin-*.geojson`) และรายชื่ออำเภอ (`data/districts-th.json`) สร้างจาก [HDX COD-AB Thailand](https://data.humdata.org/dataset/cod-ab-tha) (กรมแผนที่ทหาร / OCHA, CC BY-IGO) ไฟล์ต้นทางใหญ่ราว 440 MB จึงไม่อยู่ใน git ถ้าจะสร้างใหม่ ให้ดาวน์โหลด `tha_admin_boundaries.geojson.zip` แตกไฟล์ แล้วรัน

```bash
node scripts/build-districts.mjs <โฟลเดอร์ที่มี tha_admin1.geojson และ tha_admin2.geojson>
```

คำสั่งนี้ดึงเฉพาะส่วนกรุงเทพฯ ผ่าน range request ไม่ได้โหลดทั้งโลก ข้อมูลแผนที่ © OpenStreetMap contributors

ไฟล์ใน `public/vendor/` ปักเวอร์ชันไว้ใน `scripts/vendor-map.sh` และตรวจกับ `public/vendor/SHA256SUMS` ทุกครั้ง (test ก็ตรวจไฟล์บนดิสก์กับ SHA256SUMS โดยไม่ต่อเน็ต)

```bash
scripts/vendor-map.sh            # ดึงใหม่ ตรวจกับ SHA256SUMS ถ้าไม่ตรงจะไม่ติดตั้งอะไรเลย
UPDATE=1 scripts/vendor-map.sh   # ใช้เฉพาะตอนเปลี่ยนเวอร์ชันที่ปักไว้ จะเขียน SHA256SUMS ใหม่ ตรวจ diff ก่อน commit
```

glyphs มีเฉพาะ Noto Sans Regular/Medium ช่วงละติน ไทย และเครื่องหมายวรรคตอน ชื่อสถานที่ภาษาอื่นจึงไม่แสดง (ยอมรับแล้วใน spec)

## มีอะไรใน repo

| ไฟล์ | หน้าที่ |
| ---- | ------- |
| `src/districts.ts` | เขตในกรุงเทพฯ ที่ใช้ในคลาส (12 จาก 50 เขต) |
| `src/stations.ts` | สถานีวัดระดับน้ำ อ่านจาก `data/stations.json` |
| `data/stations.json` | ระดับน้ำสมมติที่บันทึกไว้ ไม่ใช่ค่าจริง |
| `src/time.ts` | แสดงเวลาเป็นเวลากรุงเทพฯ |
| `src/app.ts` | routing ของ API แยกจาก `node:http` เพื่อให้ test ง่าย |
| `src/reports.ts` | รายงานจากคนในพื้นที่: ตรวจข้อมูล ปิดเบอร์โทร รวมรายงานซ้ำ หมดอายุ |
| `src/rate-limit.ts` | จำกัด 5 รายงานต่อชั่วโมงต่อ client |
| `src/read-body.ts` | อ่าน body ไม่เกิน 2048 byte |
| `src/static.ts` | เสิร์ฟหน้าเว็บแผนที่ ไฟล์ tiles และไฟล์แผนที่ใน `public/vendor/` (รายการตายตัว) |
| `scripts/build-districts.mjs` | สร้างรายชื่อและเส้นแบ่งจังหวัด/อำเภอในลุ่มน้ำเจ้าพระยาจาก HDX COD-AB |
| `data/districts-th.json` | จังหวัดและอำเภอในลุ่มน้ำ พร้อม P-code ชื่อไทย และกึ่งกลาง |
| `scripts/vendor-map.sh` | ดึงไฟล์แผนที่ที่ปักเวอร์ชันไว้ ตรวจกับ `public/vendor/SHA256SUMS` |
| `src/server.ts` | HTTP server |
| `public/` | หน้าเว็บแผนที่ (`index.html`, `app.js`, `app.css`), ข้อมูลจำลอง `demo.js` (เปิดด้วย `/?demo`) |
| `public/fonts/` | Noto Sans Thai แบบ variable (SIL OFL 1.1, ดู `OFL.txt`) host เองไม่ดึงจาก Google Fonts |
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
