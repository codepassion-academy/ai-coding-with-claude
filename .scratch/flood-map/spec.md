# Spec: แผนที่รายงานน้ำท่วม (flood-map)

Status: ready-for-agent

- ต่อยอดจาก: `docs/specs/flood-reports.md` (API รายงาน), `docs/plans/flood-reports.md` ขั้น 9
- ADR: `docs/adr/0001-maplibre-pmtiles-basemap.md` (accepted, host ไฟล์ของแผนที่ทุกอย่างเอง), `docs/adr/0002-nfkc-for-landmarks.md`
- ศัพท์: `CONTEXT.md`

## Problem Statement

คนในพื้นที่อยากรู้ว่าตอนนี้ตรงไหนในกรุงเทพฯ มีน้ำท่วมและลึกแค่ไหน เพื่อเลี่ยงเส้นทางหรือเตรียมตัว และอยากแจ้งสิ่งที่ตัวเองเห็นให้คนอื่นรู้ API รายงานมีแล้ว แต่ข้อมูลที่เป็น JSON อ่านไม่ออกสำหรับคนทั่วไป หน้าแผนที่ที่ทำไว้ตอนนี้ใช้งานได้ แต่ยังมีปัญหา:

- ตัวแผนที่ ฟอนต์บนแผนที่ และไอคอนโหลดจาก CDN และโดเมนของบุคคลที่สาม ทำให้ IP ของผู้ชมรั่วไปข้างนอก และแผนที่อาจล่มตาม CDN ในช่วงน้ำท่วมที่คนเข้าเยอะ ซึ่งขัดกับ ADR 0001
- กึ่งกลางเขตที่ใช้วางหมุดฝังอยู่ในหน้าเว็บ แยกจากข้อมูลเขตของระบบ ถ้าเพิ่มเขตแล้วลืมแก้หน้าเว็บ หมุดจะหาย
- ตรรกะของหน้าเว็บไม่มี test เลย เช่น รวมรายงานจริงกับข้อมูลจำลอง เรียงลำดับ นับสรุป วางหมุด และแปลงรหัส error
- ผู้รายงานที่ใส่ "บ้าน" แล้วตามด้วยเบอร์โทรที่คั่นด้วยช่องว่าง จะมีเลข 7 หลักของเบอร์หลุดไปเก็บ
- ผู้สอนต้องมีภาพน้ำท่วมทั่วเมืองไว้สาธิต โดยไม่ปนกับรายงานจริง

## Solution

หน้าเว็บแผนที่ที่ `/` ของ server เดียวกับ API แสดงรายงานจากคนในพื้นที่เป็นหมุดบนแผนที่กรุงเทพฯ และมีรายการรายงาน สรุปจำนวนตามระดับความลึก สถานีวัด และปุ่มแจ้งรายงาน

- ไฟล์ทุกอย่างที่หน้าแผนที่ใช้มาจาก server ของเราเอง ไม่มี request ออกไปโดเมนอื่น
- หมุดของรายงานวางตามกึ่งกลางเขตที่ API ส่งมา และบอกชัดว่าเป็นตำแหน่งโดยประมาณ
- ข้อมูลจำลองเปิดได้เมื่อผู้ชมขอเอง ประกอบด้วยรายงานและพื้นที่น้ำท่วมทั่วเมือง ติดป้ายทุกชิ้น
- การปิดเบอร์โทรในจุดสังเกตทำก่อนการปิดเลขที่บ้าน เบอร์จึงไม่หลุดบางส่วนอีก

## User Stories

ผู้ชม (คนในพื้นที่)

1. As a ผู้ชม, I want to open one web address and see a map of Bangkok with the latest รายงาน, so that I don't have to read JSON.
2. As a ผู้ชม, I want each รายงาน shown as a หมุด coloured by ระดับความลึก, so that I can tell at a glance where the water is deep.
3. As a ผู้ชม, I want a legend that explains the colours, so that I read the map the same way the app means it.
4. As a ผู้ชม, I want a summary of how many รายงาน are at ข้อเท้า, เข่า and เอว level, so that I know how bad things are before reading details.
5. As a ผู้ชม, I want a list of รายงาน newest first, so that I see the freshest information on top.
6. As a ผู้ชม, I want each list item to show the จุดสังเกต, ระดับความลึก, เขต, how long ago it was seen, and the number of การยืนยัน, so that I can judge how much to trust it.
7. As a ผู้ชม, I want every รายงาน labelled "ผู้ใช้รายงาน ยังไม่ยืนยัน", so that I never mistake it for an official warning.
8. As a ผู้ชม, I want the NOTICE that this is a teaching example with ข้อมูลสมมติ always visible, so that I don't act on it as real.
9. As a ผู้ชม, I want to filter by เขต, with a count per เขต, so that I only look at the area I care about.
10. As a ผู้ชม, I want picking a เขต to move the map there, so that I don't have to pan.
11. As a ผู้ชม, I want clicking a list item to highlight its หมุด and open its details, so that I can find it on the map.
12. As a ผู้ชม, I want clicking a หมุด to show the same details and highlight the list item, so that map and list stay in sync.
13. As a ผู้ชม, I want to be told that the หมุด position is approximate by เขต, so that I don't walk to a spot that is not where the water is.
14. As a ผู้ชม, I want สถานีวัด shown as a distinct หมุด with their latest ระดับน้ำ, so that I can compare measured water with what people report.
15. As a ผู้ชม, I want the page to refresh itself every minute, so that I don't have to reload.
16. As a ผู้ชม, I want the refresh to keep my selected รายงาน open, so that I'm not interrupted while reading.
17. As a ผู้ชม, I want the page to say when it last updated, so that I know how fresh it is.
18. As a ผู้ชม on a phone, I want the list as a sheet at the bottom with the map above, so that I can use it one-handed.
19. As a ผู้ชม, I want the page to follow my system light/dark theme, map included, so that it is comfortable to read at night.
20. As a ผู้ชม, I want Thai labels on the map and a Thai font that renders cleanly, so that street and place names are readable.
21. As a ผู้ชม, I want the page to still show หมุด and the list when the map background can't load, so that I still get the information.
22. As a ผู้ชม who uses a keyboard or screen reader, I want every หมุด, filter and control reachable and labelled, so that I can use the page without a mouse.
23. As a ผู้ชม who prefers reduced motion, I want animations off, so that the page doesn't make me uncomfortable.
24. As a ผู้ชม, I want no request from this page to go to any other site, so that my IP is not shared with third parties.

ผู้รายงาน

25. As a ผู้รายงาน, I want a clear "แจ้งจุดน้ำท่วม" button, so that I can report what I see quickly.
26. As a ผู้รายงาน, I want to pick the เขต, type a จุดสังเกต, choose ข้อเท้า/เข่า/เอว, and pick when I saw it, so that the รายงาน is useful to others.
27. As a ผู้รายงาน, I want the เขต preselected when I'm already filtering by one, so that I type less.
28. As a ผู้รายงาน, I want a character counter that counts the way the server does, so that I don't get rejected for length by surprise.
29. As a ผู้รายงาน, I want a warning not to type a house number or phone, so that I don't expose personal data.
30. As a ผู้รายงาน, I want "เห็นเมื่อ" choices that are always accepted, so that I never get a "too old" error from a choice the form offered.
31. As a ผู้รายงาน, I want a plain Thai message for every rejection (length, depth, time, rate limit with minutes to wait, store full, server error), so that I know what to fix.
32. As a ผู้รายงาน, I want to be told when my รายงาน merged with an existing one and how many การยืนยัน it now has, so that I know my report counted.
33. As a ผู้รายงาน, I want the map to jump to my รายงาน after sending, so that I can see it on the map.
34. As a ผู้รายงาน who types "บ้าน" followed by a spaced phone number, I want the whole phone number masked, so that no part of it is stored.

ผู้สอนและผู้เรียน

35. As a ผู้สอน, I want to turn on ข้อมูลจำลอง with a URL or a switch, so that I can show a city-wide flood scene in class.
36. As a ผู้สอน, I want ข้อมูลจำลอง to cover all เขต with realistic spots, ages and การยืนยัน, so that the scene looks believable.
37. As a ผู้สอน, I want พื้นที่น้ำท่วม drawn light to dark by depth, with the หมุด agreeing with the water under them, so that the picture is coherent.
38. As a ผู้ชม, I want every piece of ข้อมูลจำลอง labelled as such and ข้อมูลจำลอง off by default, so that I never confuse it with real รายงาน.
39. As a ผู้ดูแลระบบ, I want ข้อมูลจำลอง to never reach the API or use rate-limit quota, so that the store only holds real รายงาน.
40. As a ผู้เรียน, I want the page logic covered by tests I can read, so that I learn how to test UI logic without a browser.

นักพัฒนาและผู้ดูแล repo

41. As a นักพัฒนา, I want กึ่งกลางเขต to come from the district data via the API, so that adding a เขต puts its หมุด on the map without touching the page.
42. As a นักพัฒนา, I want one command that fetches the pinned versions of every map file and checks their hashes, so that updating is repeatable and safe.
43. As a นักพัฒนา, I want a test that fails if a vendored map file does not match its pinned hash, so that a tampered or half-downloaded file is caught.
44. As a นักพัฒนา, I want a test that fails if the page references any outside URL or the CSP allows any outside host, so that the self-host rule can't regress.
45. As a นักพัฒนา, I want the map tiles file documented but kept out of git, so that the repo stays small.
46. As a นักพัฒนา, I want the flood-reports spec to match the code (constants location, the limiter's prune), so that the spec stays trustworthy.

## Implementation Decisions

Map assets self-hosted (ADR 0001, Q3/Q9/Q10)

- MapLibre GL JS and CSS, the pmtiles reader and the Protomaps basemaps style builder are vendored into the site and served by the server's fixed list of static files. The versions stay as now: MapLibre 5.24.0 (UMD build), pmtiles 4.5.0, basemaps 5.7.2.
- Basemap glyphs are vendored only for Noto Sans Regular and Medium, and only for Thai, Latin and general punctuation ranges. Place names in other scripts do not render. That is accepted. The italic face stays swapped for Regular because it has no Thai.
- Basemap sprites are vendored for the light and dark flavours.
- The style points glyphs and sprite at our own origin.
- The CSP drops unpkg and protomaps.github.io. Scripts, styles, fonts and connections are `'self'` only. Blob workers stay allowed because MapLibre needs them.
- A shell script fetches the pinned versions and glyph ranges, checks each file against a committed hash manifest, and writes them into the vendored folder. It does not touch the package manifest (flood-reports RPT-REQ-017 AC1).
- The static file list stays an explicit list of exact paths, with no folder lookup. Vendored files are added to it, and glyph range files may be listed per range.

District centre in the API (Q11)

- Each เขต gains a กึ่งกลางเขต `[lon, lat]`. `GET /districts` returns it as an extra field on each district, and `GET /districts/:id` returns it on its district object. Existing fields and their order are unchanged, so the existing app tests keep passing without edits.
- A กึ่งกลางเขต is a coordinate of the เขต, not of a ผู้รายงาน. No coordinates are accepted from or stored for รายงาน (flood-reports spec §5, RPT-REQ-013, Q2).

Page logic module (Q13)

- The page is split into a DOM-free logic module and the DOM/map code that calls it. The logic module attaches to a single global, the same way the demo data does, so tests can load it in a VM.
- The logic module owns:
  - merging real รายงาน with ข้อมูลจำลอง when enabled
  - sorting newest เวลาที่เห็น first, with ties broken by id
  - counting รายงาน per ระดับความลึก, for the current เขต filter
  - counting รายงาน per เขต, for the filter chips
  - placing a หมุด. A report placed from its กึ่งกลางเขต gets a stable offset derived from the district and landmark, so a merged รายงาน keeps one spot. A demo item uses its own coordinate.
  - mapping API error codes (including `rate_limited` with its `retryAfterSec`) to the Thai messages
  - formatting the Thai age label the same way the API does, for ข้อมูลจำลอง
- The DOM code keeps rendering only: the panel, the list, หมุด, popup, legend, the form, the toast, and the MapLibre layers. It renders all user text with `textContent`, never markup.

What the map shows (Q12)

- Real รายงาน appear as หมุด plus the summary and the list. พื้นที่น้ำท่วม are drawn only from ข้อมูลจำลอง. No shading of a whole เขต from real รายงาน.

ข้อมูลจำลอง (Q4, Q14)

- ข้อมูลจำลอง stays a permanent opt-in, turned on with `?demo` or the switch, and off by default in every environment.
- It never calls the API.
- Every item carries the "ข้อมูลจำลอง ไม่ใช่รายงานจริง" label.
- ข้อมูลจำลอง is distinct from ข้อมูลสมมติ (see `CONTEXT.md`).
- The current scene stays: 44 รายงาน across all 12 เขต and 15 พื้นที่น้ำท่วม. Each พื้นที่น้ำท่วม is a stack of nested bands in cm.

Look and feel (already built, kept)

- The map fills the page with a frosted panel, which becomes a bottom sheet on phones.
- Water colours are five theme tokens shared by the map layer, the legend and the หมุด. The map re-styles when the system theme changes.
- Noto Sans Thai is self-hosted.

Changes to flood-reports (Q6, Q7)

- RPT-REQ-005 order becomes: mask phone numbers first, then house numbers. "บ้าน 081 234 5678" becomes "บ้าน ***". House numbers with a prefix (e.g. "บ้าน 45/12") are still masked, because they are under 9 digits.
- The flood-reports spec text is updated in two places (already done in the docs, since the code already works this way):
  - §2: the rate-limit constants live with the limiter and are re-exported where the other constants live.
  - §3.2: the limiter interface includes `prune(now)`.
- The RPT-REQ-005 text and its E-case notes change to "phone first" together with the code, not before.

## Testing Decisions

- **What counts as a good test here:** it checks behaviour a user or client can observe through a public seam. Examples: HTTP status, headers and body; API JSON; what the logic module returns for given inputs. It must not reach into internals or restate the implementation. Expected values come from the spec or from worked examples, not from recomputing them the way the code does.
- **Seams, as agreed:**
  1. **The API router (`handle()`):** every district in `GET /districts` has a กึ่งกลางเขต inside Bangkok's bounds. `GET /districts/:id` includes it. The existing app tests pass unmodified. Prior art: the flood-reports API tests.
  2. **The HTTP server (`createAppServer()` on 127.0.0.1, port 0):**
     - every vendored file is served with the right content type
     - the page references no `http(s)://` URL outside the site
     - the CSP has no outside host
     - the fixed static list still rejects path tricks
     - vendored files on disk match the committed hash manifest (read from disk, no network)

     Prior art: the web and server tests.
  3. **The page logic module, loaded in a VM:**
     - merge on/off
     - sort order with ties
     - summary counts respecting the เขต filter
     - per-เขต counts
     - stable placement for the same เขต + จุดสังเกต, and different placement for different ones
     - placement always within the เขต's neighbourhood
     - demo items use their own coordinate
     - every API error code has a Thai message, and `rate_limited` shows minutes

     Prior art: the demo data tests that load it in a VM.
  4. **The masking function:** "บ้าน 081 234 5678" and "บ้าน 081.234.5678" leave no digits of the phone. House-number cases from RPT-REQ-005 AC7/AC8 still hold. The known-limitation test pinning "*** 234 5678" is replaced. The random-phone property test still passes. Prior art: the masking tests.
- **Not tested automatically:** DOM rendering, MapLibre drawing and the look. A person opens the page (with and without `?demo`, light and dark, phone width) as manual QA. No new test dependencies (flood-reports RPT-REQ-017).
- **Tests never call the network,** including the vendor script.

## Out of Scope

- Accepting or storing coordinates for รายงาน, a map-picker for location, or rounding coordinates. This waits for a PDPA decision (Q9 in the flood-reports spec).
- Shading whole เขต or deriving พื้นที่น้ำท่วม from real รายงาน.
- Boundaries (polygons) of เขต.
- Glyph ranges beyond Thai, Latin and punctuation.
- Offline support, service workers, push notifications.
- Hosting the tiles file somewhere other than the app server (object storage, CDN). The tiles file stays local and out of git.
- Changing the NFKC normalisation (kept, ADR 0002).
- A browser-based test harness (jsdom, happy-dom, Playwright).
- Deploying the app.

## Further Notes

- The map page, the redesign, the self-hosted font and ข้อมูลจำลอง already exist on `feat/flood-reports`. This spec keeps them and adds the self-hosting, the district centre, the logic module with tests, and the masking order fix.
- Rendering in a real browser has not been verified from this machine: headless Brave is blocked by the sandbox. Manual QA is the check.
- The tiles extract used locally is Protomaps build 20260930, bbox 100.30,13.50,100.95,14.05, maxzoom 15, about 47 MB. The README shows how to regenerate it.
- Never send test รายงาน to the live ROOP TAN JAI Flood Watch map. Everything in this spec runs against localhost only.
