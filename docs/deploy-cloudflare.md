# Deploy น้ำท่วมไหม ขึ้น Cloudflare ตั้งแต่ศูนย์

คู่มือนี้พาตั้งแต่สมัครบัญชี Cloudflare จนได้ URL ของโปรเจกต์ที่ deploy เองทุกครั้งที่ `main` เปลี่ยน ทำใน dashboard ทั้งหมด ไม่ต้องใช้ CLI ไม่ต้องสร้าง API token ใช้เวลาประมาณ 20–30 นาที

> **เป็น demo สำหรับสอนเท่านั้น** ข้อมูลเป็นข้อมูลสมมติ ไม่ใช่ระบบเตือนภัย ไม่ประชาสัมพันธ์ URL ให้ประชาชน (ADR 0003)
> ทดสอบส่งรายงานไปที่ URL ของตัวเองเท่านั้น **ห้าม POST ไปที่ `flood-api.rooptanjai.com`**

ทำไมออกแบบแบบนี้ ดู [ADR 0003](adr/0003-cloudflare-hosting.md) ภาพรวมดู [แผนภาพ](diagrams/cloudflare-architecture.html)

ชื่อเมนูใน dashboard อ้างอิงหน้าจอของ Cloudflare ณ ตุลาคม 2026 ถ้าคำบนจอต่างไปเล็กน้อย ให้หาเมนูที่ความหมายเดียวกัน

## สิ่งที่จะได้

```
https://namthuam.<subdomain-ของคุณ>.workers.dev
```

| ส่วน | อยู่ที่ไหนบน Cloudflare |
| ---- | ---------------------- |
| โค้ด (`src/worker.ts`) | Worker ชื่อ `namthuam` |
| หน้าเว็บแผนที่ (`public/`) | Workers Static Assets (deploy ไปพร้อม Worker) |
| ไฟล์แผนที่ `bangkok.pmtiles` (44.5 MiB) | R2 bucket `namthuam-tiles` (ใหญ่เกิน 25 MiB ของ Static Assets) |
| รายงานและโควตา | Durable Object `ReportsObject` (สร้างเองตอน deploy) |
| การ deploy อัตโนมัติ | Workers Builds ต่อกับ GitHub |

ทุกอย่างอยู่ใน **Free plan** แต่การเปิดใช้ R2 ต้องผูกบัตรหรือ PayPal ไว้ (ไม่ถูกเก็บเงินถ้าไม่เกินโควตาฟรี)

## 0. เตรียมก่อนเริ่ม

- บัญชี GitHub
- repo ที่จะ deploy อยู่ในบัญชี GitHub ของคุณ
  - **ผู้เรียน:** fork `codepassion-academy/ai-coding-with-claude` เข้าบัญชีตัวเองก่อน (GitHub → Fork) แล้วใช้ fork นั้นในทุกขั้นข้างล่าง
- ไฟล์ `public/tiles/bangkok.pmtiles` ในเครื่อง ได้มาพร้อม `git clone` (อยู่ใน git แล้ว) เช็กว่าขนาดราว 44.5 MiB ไม่ใช่ไฟล์เล็กๆ ไม่กี่ร้อย byte

```bash
git clone https://github.com/<บัญชีของคุณ>/ai-coding-with-claude.git
ls -lh ai-coding-with-claude/public/tiles/bangkok.pmtiles   # ควรเห็นราว 44M
```

## 1. สมัครบัญชี Cloudflare

1. เปิด <https://dash.cloudflare.com/sign-up>
2. ใส่อีเมลและรหัสผ่าน → **Sign up**
3. เปิดอีเมลยืนยันจาก Cloudflare แล้วกดลิงก์ยืนยัน
4. ถ้าถามให้เพิ่มเว็บไซต์ (Add a domain) ให้ข้ามไป เราใช้ `workers.dev` ไม่ต้องมีโดเมน
5. ถ้าใช้ Brave ให้ปิด Shields สำหรับ `dash.cloudflare.com` (กดไอคอนสิงโตบนแถบที่อยู่) ไม่อย่างนั้นการล็อกอินบางขั้นจะพังด้วย error CSRF

## 2. ตั้ง subdomain ของ workers.dev

subdomain นี้กลายเป็นส่วนหนึ่งของ URL และตั้งได้ครั้งเดียวต่อบัญชี

1. เมนูซ้าย → **Compute (Workers)** → **Workers & Pages**
2. ครั้งแรกที่เข้า Cloudflare จะให้ตั้ง subdomain เช่น `savepong` ได้ `*.savepong.workers.dev`
   - ถ้าไม่ถาม ดูได้ที่หน้า Workers & Pages ด้านขวา (**Account details → Subdomain**) กด **Change** ถ้ายังไม่ได้ตั้ง
3. จดไว้: URL สุดท้ายจะเป็น `https://namthuam.<subdomain>.workers.dev`

## 3. เปิด R2 และสร้าง bucket สำหรับไฟล์แผนที่

**ต้องทำก่อนขั้น 4** ถ้ายังไม่มี bucket การ deploy ครั้งแรกจะล้ม

1. เมนูซ้าย → **Storage & Databases** → **R2 Object Storage**
2. ครั้งแรกจะให้เปิดใช้ R2 → ทำตามหน้าจอ เพิ่มบัตรหรือ PayPal ยืนยัน
   - โควตาฟรีต่อเดือน: เก็บ 10 GB, อ่าน 10 ล้านครั้ง, เขียน 1 ล้านครั้ง, egress ฟรี
3. **Create bucket**
   - Bucket name: `namthuam-tiles` (ต้องตรงตัว เพราะ `wrangler.jsonc` ใช้ชื่อนี้)
   - Location: Automatic
   - Default storage class: Standard
   - → **Create bucket**
4. เปิด bucket `namthuam-tiles` → **Upload** (หรือ Objects → Upload)
5. ลากไฟล์ `public/tiles/bangkok.pmtiles` จากเครื่องใส่ → รอจนอัปโหลดเสร็จ
6. ตรวจว่ารายการไฟล์มี **`bangkok.pmtiles`** อยู่ที่ราก bucket (ไม่อยู่ในโฟลเดอร์ย่อย) ขนาดราว 44.5 MB

ไม่ต้องเปิด public access ของ bucket Worker อ่านไฟล์ผ่าน binding เอง

## 4. ต่อ GitHub และ deploy ครั้งแรก (Workers Builds)

1. **Workers & Pages** → **Create application** (หรือ **Create**)
2. แท็บ **Workers** → **Import a repository**
3. **Connect GitHub** → หน้า GitHub จะให้ติดตั้ง app **Cloudflare Workers and Pages**
   - เลือกบัญชีของคุณ
   - Repository access: **Only select repositories** → เลือก `ai-coding-with-claude` → **Install & Authorize**
4. กลับมาที่ Cloudflare → เลือก repo `ai-coding-with-claude`
5. ตั้งค่าโปรเจกต์

   | ช่อง | ค่า |
   | ---- | --- |
   | Project name | `namthuam` (ต้องตรงกับ `"name"` ใน `wrangler.jsonc`) |
   | Production branch | `main` |
   | Build command | `npm ci && npm run lint && npm test` |
   | Deploy command | `npx wrangler@4.145.0 deploy` |
   | Root directory / Path | `/` (ค่าเริ่มต้น) |
   | Builds for non-production branches | **ปิด** (ถ้ามีช่องนี้) |

   ไม่ต้องตั้ง API token หรือ environment variable ในหน้านี้
6. **Create and deploy** (หรือ **Deploy**)
7. ดู build log ที่ขึ้นมา ลำดับที่ควรเห็น
   - `npm ci` ติดตั้ง package
   - `tsc --noEmit` ผ่าน
   - vitest: `Tests  ... passed`
   - wrangler: อ่าน assets ราว 45 ไฟล์, binding `env.REPORTS` (Durable Object), `env.TILES` (R2), `env.ASSETS`
   - `Deployed namthuam` พร้อม URL `https://namthuam.<subdomain>.workers.dev`
8. จด URL ไว้ ตอนนี้เปิดหน้าเว็บได้แล้ว แต่ **ส่งรายงานยังไม่ได้** จนกว่าจะทำขั้น 5

## 5. ตั้ง secret `CLIENT_KEY_SECRET`

Worker ใช้ค่านี้แปลง IP ของผู้ส่งรายงานเป็น HMAC ก่อนเก็บ ระบบจึงไม่เก็บ IP จริง (RPT-REQ-009) ถ้าไม่มีค่านี้ GET ใช้ได้ แต่ POST รายงานได้ `500`

1. สร้างค่าสุ่มในเครื่องตัวเอง (คัดลอกเข้า clipboard โดยไม่แสดงบนจอ)

   ```bash
   openssl rand -hex 32 | pbcopy      # macOS
   # Linux: openssl rand -hex 32 | xclip -selection clipboard
   ```

   อย่าวางค่านี้ในแชต ไฟล์ หรือ commit ใดๆ
2. **Workers & Pages** → คลิก `namthuam` → แท็บ **Settings** → **Variables and Secrets** → **+ Add**
3. กรอก
   - Type: **Secret** (ไม่ใช่ Text เพราะ Text จะโชว์ค่าใน dashboard)
   - Variable name: `CLIENT_KEY_SECRET`
   - Value: วางค่าที่คัดลอก
4. **Deploy** (หรือ **Save and deploy**)

ตั้งครั้งเดียวพอ การ deploy รอบถัดไปจาก Workers Builds ไม่ลบ secret ถ้าเปลี่ยนค่าใหม่ โควตารายงานของทุกคนจะถูกรีเซ็ต

## 6. ทดสอบ URL

แทน `<URL>` ด้วย URL ของคุณ

```bash
URL=https://namthuam.<subdomain>.workers.dev

curl -s $URL/districts | head -c 120; echo                  # JSON ขึ้นต้นด้วย {"notice":...
curl -s -o /dev/null -w "%{http_code}\n" $URL/                 # 200
curl -s -D - -o /dev/null -H "Range: bytes=0-15" $URL/tiles/bangkok.pmtiles | grep -iE "^HTTP|content-range"
                                                               # 206 และ content-range: bytes 0-15/46650158
curl -s -o /dev/null -w "%{http_code}\n" $URL/package.json     # 404 (ไฟล์นอกรายการเปิดไม่ได้)
```

ส่งรายงานทดสอบหนึ่งครั้ง (ไปที่ URL ของคุณเท่านั้น) ใช้ข้อความที่บอกชัดว่าเป็นการทดสอบ รายงานจะหายเองใน 6 ชั่วโมง

```bash
curl -s -X POST $URL/districts/lat-phrao/reports \
  -H 'content-type: application/json' \
  -d "{\"landmark\":\"ทดสอบระบบ (ไม่ใช่น้ำท่วมจริง)\",\"depth\":\"ankle\",\"seenAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
# ได้ 201 พร้อม "merged":false
```

เปิด `<URL>` ในเบราว์เซอร์ ควรเห็นแผนที่กรุงเทพฯ มีถนนและชื่อสถานที่ และหมุดรายงานทดสอบในลาดพร้าว

## 7. หลังจากนี้: deploy อัตโนมัติ

ทุกครั้งที่ push หรือ merge PR เข้า `main`

```
push main → Workers Builds: npm ci → lint → test → wrangler deploy → URL เดิมอัปเดต
```

ดูสถานะได้ที่ `namthuam` → แท็บ **Deployments** (หรือ **Builds**) และที่ commit บน GitHub (มีเครื่องหมายสถานะจาก Cloudflare)

เมื่อไฟล์ `public/tiles/bangkok.pmtiles` เปลี่ยน **ต้องอัปโหลดใหม่เองที่ R2** (ขั้น 3 ข้อ 4–6) Workers Builds ไม่อัปโหลดให้

ควรลองครั้งหนึ่งว่า test ที่ fail หยุดการ deploy จริง (docs ของ Cloudflare ยังไม่ยืนยัน): ทำ branch ที่ test ตั้งใจ fail แล้ว merge ดูว่า build ล้มและ URL ไม่เปลี่ยน แล้ว revert

## แก้ปัญหา

| อาการ | สาเหตุ | แก้ |
| ----- | ------ | --- |
| build ล้มตอน deploy ว่าหา R2 bucket ไม่เจอ | ยังไม่ได้สร้าง `namthuam-tiles` หรือสะกดผิด | ทำขั้น 3 แล้ว **Retry build** |
| เตือนว่าชื่อ Worker ไม่ตรงกับ `wrangler.jsonc` | ตั้ง Project name อื่น | ตั้งเป็น `namthuam` หรือแก้ `"name"` ใน `wrangler.jsonc` ให้ตรง |
| build ล้มที่ `npm test` หรือ `tsc` | โค้ดใน `main` มี test พัง | แก้ในเครื่องให้ `npm test && npm run lint` ผ่านก่อน push |
| หน้าเว็บขึ้นแต่แผนที่ไม่มีถนน | ไม่มี `bangkok.pmtiles` ใน R2 หรืออยู่ในโฟลเดอร์ย่อย | อัปโหลดใหม่ที่ราก bucket ตรวจด้วย curl ในขั้น 6 ต้องได้ 206 |
| POST ได้ `500` `{"error":"internal"}` | ยังไม่ได้ตั้ง `CLIENT_KEY_SECRET` | ทำขั้น 5 |
| POST ได้ `429` | ส่งเกิน 5 รายงานต่อชั่วโมงจาก IP เดียว (ตั้งใจไว้ RPT-REQ-008) | รอตาม `Retry-After` |
| ได้ `403` และ `error code: 1000` | ส่ง header `CF-Connecting-IP` มาเอง Cloudflare ปฏิเสธที่ edge | ไม่ต้องแก้ ปลอม IP ไม่ได้ ตามที่ตั้งใจ |
| ล็อกอินหรือเชื่อม GitHub แล้วขึ้น error CSRF | เบราว์เซอร์บล็อก cookie ของ Cloudflare | ปิด Brave Shields สำหรับ `dash.cloudflare.com` หรือใช้ Safari/Chrome |

## เพดานของ Free plan ที่ควรรู้

- 100,000 request ต่อวันต่อบัญชี ทุก request นับ รวมไฟล์หน้าเว็บและ tile (Worker เห็นทุก request เพื่อคุมรายการไฟล์)
- CPU 10 ms ต่อ request ดูค่าจริงได้ที่ `namthuam` → **Metrics** → CPU time
- Durable Object: 100,000 request และเขียน 100,000 แถวต่อวัน
- เกินเพดานแล้ว request ล้มจนรีเซ็ตเวลา 07:00 น. (00:00 UTC) ไม่มีค่าใช้จ่ายเพิ่มเอง

ตัวเลขและที่มาอยู่ใน [research notes](research/cloudflare-workers-hosting.md)

## ลองบนเครื่องด้วย workerd จริง (ไม่ต้องลง package)

```bash
npx wrangler@4.145.0 r2 object put namthuam-tiles/bangkok.pmtiles --file public/tiles/bangkok.pmtiles --local
npx wrangler@4.145.0 dev --var CLIENT_KEY_SECRET:dev-only
```
