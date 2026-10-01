"use strict"

// Page logic for the map page, with no DOM and no map: merge, sort, count, place, and wording.
// A plain script that sets one global, like demo.js, so tests can load it in a VM.
;(() => {
  const ERRORS = {
    invalid_body: "ส่งข้อมูลไม่ครบ ลองใหม่อีกครั้ง",
    unknown_field: "ส่งข้อมูลไม่ถูกรูปแบบ ลองใหม่อีกครั้ง",
    landmark_invalid: "จุดสังเกตต้องยาว 2–80 ตัวอักษร อยู่ในบรรทัดเดียว และต้องมีอย่างอื่นนอกจากเบอร์โทรหรือเลขที่บ้าน",
    depth_invalid: "เลือกระดับน้ำ: ข้อเท้า เข่า หรือเอว",
    seen_at_invalid: "เวลาที่เห็นไม่ถูกต้อง",
    seen_at_future: "เวลาที่เห็นอยู่ในอนาคต ลองเช็กนาฬิกาในเครื่อง แล้วเลือก \"15 นาทีก่อน\"",
    seen_at_too_old: "รับเฉพาะสิ่งที่เห็นภายใน 3 ชั่วโมง",
    store_full: "ตอนนี้ระบบรับจุดใหม่ไม่ได้ชั่วคราว ถ้าเป็นจุดที่มีคนรายงานแล้ว ส่งชื่อเดิมเพื่อยืนยันได้",
    payload_too_large: "ข้อความยาวเกินไป",
    "unknown district": "ไม่พบเขตนี้",
    "not found": "ไม่พบสิ่งที่ขอ ลองโหลดหน้าใหม่",
    "invalid JSON": "ส่งข้อมูลไม่ถูกรูปแบบ ลองใหม่อีกครั้ง",
    internal: "ระบบขัดข้อง ลองใหม่อีกครั้ง"
  }
  const FALLBACK_ERROR = "ส่งไม่สำเร็จ ลองใหม่อีกครั้ง"
  // Where a หมุด goes when its เขต has no กึ่งกลางเขต (should not happen; keeps the page drawing).
  const FALLBACK_CENTRE = [100.6, 13.78]

  /** Thai message for an API error code. `rate_limited` says how many minutes to wait, rounded up. */
  function errorMessage(code, retryAfterSec) {
    if (code === "rate_limited") return `ส่งได้ 5 ครั้งต่อชั่วโมง ลองใหม่อีกประมาณ ${Math.ceil(Number(retryAfterSec) / 60)} นาที`
    return Object.hasOwn(ERRORS, code) ? ERRORS[code] : FALLBACK_ERROR
  }

  /** Same wording as the API's ageLabel (RPT-REQ-011), for ข้อมูลจำลอง. */
  const ageLabel = (m) => (m < 1 ? "เห็นเมื่อสักครู่" : m < 60 ? `เห็นเมื่อ ${m} นาทีก่อน` : `เห็นเมื่อ ${Math.floor(m / 60)} ชั่วโมงก่อน`)

  /** Bangkok time as `YYYY-MM-DDTHH:MM:SS+07:00`, the format the API uses for เวลาที่เห็น. */
  const bangkokIso = (ms) => new Date(ms + 7 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "+07:00")

  /** Newest เวลาที่เห็น first, ties by id. seenAt always carries +07:00, so it sorts as text. */
  const newestFirst = (a, b) => (a.seenAt < b.seenAt ? 1 : a.seenAt > b.seenAt ? -1 : a.id < b.id ? -1 : 1)

  /** Real รายงาน plus ข้อมูลจำลอง when it is on, newest first. */
  const mergeReports = (real, demo, demoOn) => [...real, ...(demoOn ? demo : [])].sort(newestFirst)

  const inFilter = (filter) => (item) => filter === "all" || item.districtId === filter

  /** How many รายงาน per ระดับความลึก, for the current เขต filter. */
  function countByDepth(reports, filter) {
    const counts = { ankle: 0, knee: 0, waist: 0 }
    for (const r of reports.filter(inFilter(filter))) if (Object.hasOwn(counts, r.depthLevel)) counts[r.depthLevel] += 1
    return counts
  }

  /** How many รายงาน per เขต, for the filter chips. */
  function countByDistrict(reports) {
    const counts = {}
    for (const r of reports) counts[r.districtId] = (counts[r.districtId] ?? 0) + 1
    return counts
  }

  const hash = (text) => [...text].reduce((h, c) => (Math.imul(h, 31) + c.codePointAt(0)) >>> 0, 7)

  /** A stable spot near the กึ่งกลางเขต for a เขต + จุดสังเกต, so a merged รายงาน keeps one หมุด. */
  function place(centres, districtId, key) {
    const [lon, lat] = centres[districtId] ?? FALLBACK_CENTRE
    const h = hash(districtId + key)
    const angle = ((h % 360) * Math.PI) / 180
    const radius = 0.004 + ((h >>> 9) % 80) / 10000
    return [lon + Math.cos(angle) * radius, lat + Math.sin(angle) * radius]
  }

  /** Where an item's หมุด goes: a demo item's own coordinate, a station at its กึ่งกลางเขต, a รายงาน near it. */
  const positionOf = (item, centres) =>
    item.lngLat ?? (item.kind === "station" ? centres[item.districtId] ?? FALLBACK_CENTRE : place(centres, item.districtId, item.landmark.toLowerCase()))

  /** Which tab the URL asks for: น้ำเหนืออยู่ไหน at exactly `#/north`, น้ำท่วมไหม otherwise. */
  const tabFromHash = (hash) => (hash === "#/north" ? "north" : "flood")

  /**
   * What a เขื่อน popup says. A real dam is a reference point: its name and a link to RID, never a release
   * figure (north-water safety rule 4). Release numbers only ever come from the สถานการณ์จำลอง.
   */
  const damPopup = (dam) => ({
    title: `เขื่อน${dam.nameTh}`,
    note: "จุดอ้างอิง ดูปริมาณน้ำและการระบายน้ำจริงที่กรมชลประทาน",
    link: { href: dam.rid, text: "กรมชลประทาน" }
  })

  window.NAMTUAM_LOGIC = { errorMessage, ageLabel, bangkokIso, mergeReports, inFilter, countByDepth, countByDistrict, place, positionOf, tabFromHash, damPopup }
})()
