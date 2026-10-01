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
    kind_invalid: "เลือกว่าน้ำท่วมแล้ว หรือน้ำกำลังมา",
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
  const damPopup = (dam, release) => ({
    title: `เขื่อน${dam.nameTh}`,
    note: release
      ? `${releaseText(release.m3s)} (ข้อมูลจำลอง ไม่ใช่ตัวเลขจริง)`
      : "จุดอ้างอิง ดูปริมาณน้ำและการระบายน้ำจริงที่กรมชลประทาน",
    link: { href: dam.rid, text: "กรมชลประทาน" }
  })

  const thousands = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  /** A made-up release from the สถานการณ์จำลอง, e.g. "ระบาย 3,200 ลบ.ม./วินาที". */
  const releaseText = (m3s) => `ระบาย ${thousands(m3s)} ลบ.ม./วินาที`

  // Geometry for the สถานการณ์จำลอง (north-water 03, 05). Distances in km on a sphere; good enough at basin scale.
  const EARTH_KM = 6371.0088
  const rad = (d) => (d * Math.PI) / 180
  function haversineKm([lon1, lat1], [lon2, lat2]) {
    const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2
    return 2 * EARTH_KM * Math.asin(Math.sqrt(h))
  }

  /** Length of a GeoJSON LineString in km. */
  function lineLengthKm(line) {
    let km = 0
    for (let i = 1; i < line.coordinates.length; i++) km += haversineKm(line.coordinates[i - 1], line.coordinates[i])
    return km
  }

  /**
   * Nearest point on the line to `point`: how far along the line it is (km from the first vertex), how far off
   * the line the point is, and the point on the line. Projects each segment in a local equirectangular frame.
   */
  function snapToLine(line, point) {
    const c = line.coordinates
    let best = { km: 0, offKm: Infinity, point: c[0] }
    let along = 0
    for (let i = 1; i < c.length; i++) {
      const [a, b] = [c[i - 1], c[i]]
      const k = Math.cos(rad((a[1] + b[1]) / 2))
      const [ax, ay, bx, by, px, py] = [a[0] * k, a[1], b[0] * k, b[1], point[0] * k, point[1]]
      const len2 = (bx - ax) ** 2 + (by - ay) ** 2
      const f = len2 ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len2)) : 0
      const on = [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])]
      const offKm = haversineKm(point, on)
      if (offKm < best.offKm) best = { km: along + haversineKm(a, on), offKm, point: on }
      along += haversineKm(a, b)
    }
    return best
  }

  /** The part of the line from its start to `km` along it, as coordinates (for the reached stretch of water). */
  function lineUpToKm(line, km) {
    const c = line.coordinates
    const out = [c[0]]
    let along = 0
    for (let i = 1; i < c.length; i++) {
      const seg = haversineKm(c[i - 1], c[i])
      if (along + seg >= km) {
        const f = seg ? (km - along) / seg : 0
        out.push([c[i - 1][0] + f * (c[i][0] - c[i - 1][0]), c[i - 1][1] + f * (c[i][1] - c[i - 1][1])])
        return out
      }
      out.push(c[i])
      along += seg
    }
    return out
  }

  /** A circle of `radiusKm` around `centre` as a closed GeoJSON ring. */
  function circleRing([lon, lat], radiusKm, points = 48) {
    const dLat = radiusKm / 110.574
    const dLon = radiusKm / (111.32 * Math.cos(rad(lat)))
    const ring = []
    for (let i = 0; i <= points; i++) {
      const a = (2 * Math.PI * (i % points)) / points
      ring.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)])
    }
    return ring
  }

  /**
   * The สถานการณ์จำลอง at T+`t` hours: each dam's latest release step, how far the water front has travelled,
   * and the flood areas it has reached. T is clamped to 0..maxT. There is no clock time anywhere (safety rule 2).
   */
  function scenarioStep(scenario, t) {
    const at = Math.max(0, Math.min(scenario.maxT, Number(t) || 0))
    const releases = scenario.releases.map(({ dam, steps }) => {
      const step = steps.filter((s) => s.fromT <= at).at(-1) ?? steps[0]
      return { dam, m3s: step.m3s }
    })
    return {
      t: at,
      frontKm: Math.min(scenario.speedKmh * at, lineLengthKm(scenario.flowLine)),
      releases,
      areas: scenario.floodAreas.filter((a) => a.fromT <= at)
    }
  }

  /** Hours after the release, e.g. "T+18 ชม.". Never a date or a clock time. */
  const formatT = (t) => `T+${t} ชม.`

  /**
   * Points that tile the view with the scenario label, drawn as a symbol layer so the "ข้อมูลจำลอง" mark is
   * part of the map canvas and every screenshot carries it (safety rule 3). Empty when the scenario is off.
   */
  function bannerFeatures([[west, south], [east, north]], label, on) {
    if (!on) return []
    const features = []
    const [cols, rows] = [3, 4]
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const coordinates = [west + ((i + 0.5) * (east - west)) / cols, south + ((j + 0.5) * (north - south)) / rows]
        features.push({ type: "Feature", properties: { text: label }, geometry: { type: "Point", coordinates } })
      }
    }
    return features
  }

  const DEPTH_TH = { ankle: "ข้อเท้า", knee: "เข่า", waist: "เอว" }
  const DEPTH_ORDER = { ankle: 1, knee: 2, waist: 3 }

  /**
   * When the scenario's water would reach `place` [lon, lat], and how deep (north-water 05). Snaps the place to
   * the flow line, measures along the line from its start, divides by the scenario speed, and takes the deepest
   * flood area covering the snapped point by then. Pure, and only ever called with the สถานการณ์จำลอง:
   * the place never leaves the browser (safety rule 6).
   */
  function eta(place, scenario) {
    const { km, offKm, point } = snapToLine(scenario.flowLine, place)
    // Whole hours, rounded up; max(0, …) so the source is T+0, not T+-0.
    const arrivalT = Math.max(0, Math.ceil(km / scenario.speedKmh - 1e-9))
    let depthLevel = null
    for (const area of scenario.floodAreas) {
      if (area.fromT > arrivalT || haversineKm(point, area.centre) > area.radiusKm) continue
      if (!depthLevel || DEPTH_ORDER[area.depthLevel] > DEPTH_ORDER[depthLevel]) depthLevel = area.depthLevel
    }
    return { distanceKm: km, speedKmh: scenario.speedKmh, arrivalT, depthLevel, offKm, beyondScenario: arrivalT > scenario.maxT }
  }

  /** The ETA with its formula and inputs, never just the answer: "ระยะทาง X กม. ÷ Y กม./ชม. ≈ T+Z ชม., ระดับ…". */
  function etaText(e) {
    let text = `ระยะทาง ${e.distanceKm.toFixed(1)} กม. ÷ ${e.speedKmh} กม./ชม. ≈ ${formatT(e.arrivalT)}`
    text += e.depthLevel ? `, ระดับ${DEPTH_TH[e.depthLevel]}` : ", ไม่อยู่ในพื้นที่น้ำท่วมของสถานการณ์จำลองนี้"
    if (e.offKm >= 0.5) text += ` · ห่างจากเส้นทางน้ำ ${e.offKm.toFixed(1)} กม.`
    if (e.beyondScenario) text += " · เลยช่วงเวลาของสถานการณ์จำลอง"
    return text
  }

  /** Places to try without tapping the map. Rough town centres; the ETA only ever uses them in the browser. */
  const ETA_PRESETS = [
    { name: "ดอนเมือง", at: [100.6068, 13.9126] },
    { name: "นนทบุรี", at: [100.496, 13.861] },
    { name: "ปทุมธานี", at: [100.53, 14.02] },
    { name: "อยุธยา", at: [100.577, 14.353] },
    { name: "อ่างทอง", at: [100.455, 14.589] },
    { name: "สิงห์บุรี", at: [100.401, 14.891] },
    { name: "ชัยนาท", at: [100.125, 15.186] },
    { name: "นครสวรรค์", at: [100.126, 15.7] }
  ]

  window.NAMTUAM_LOGIC = {
    eta,
    etaText,
    ETA_PRESETS,
    errorMessage,
    ageLabel,
    bangkokIso,
    mergeReports,
    inFilter,
    countByDepth,
    countByDistrict,
    place,
    positionOf,
    tabFromHash,
    damPopup,
    releaseText,
    haversineKm,
    lineLengthKm,
    snapToLine,
    lineUpToKm,
    circleRing,
    scenarioStep,
    formatT,
    bannerFeatures
  }
})()
