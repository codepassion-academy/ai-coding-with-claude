"use strict"

// Map page for the flood-report API. Talks only to this server (same origin).
// Every piece of text that came from a user goes into the page with textContent, never as markup.
;(() => {
  const DEPTH_TH = { ankle: "ข้อเท้า", knee: "เข่า", waist: "เอว" }
  const REFRESH_MS = 60 * 1000
  const TILES_URL = "/tiles/bangkok.pmtiles"
  // Rough district centres [lon, lat]. The API stores no coordinates (spec §5, RPT-REQ-013),
  // so pins sit near these points. Approximate on purpose.
  const CENTRES = {
    "don-mueang": [100.595, 13.915], "sai-mai": [100.66, 13.905], "bang-khen": [100.625, 13.865],
    "lat-phrao": [100.61, 13.815], "chatuchak": [100.56, 13.83], "din-daeng": [100.553, 13.775],
    "huai-khwang": [100.585, 13.765], "bang-kapi": [100.645, 13.772], "pathum-wan": [100.53, 13.742],
    "khlong-toei": [100.565, 13.71], "bang-na": [100.615, 13.668], "lat-krabang": [100.755, 13.74]
  }
  const BOUNDS = [[100.3, 13.5], [100.95, 14.05]]

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
    "invalid JSON": "ส่งข้อมูลไม่ถูกรูปแบบ ลองใหม่อีกครั้ง",
    internal: "ระบบขัดข้อง ลองใหม่อีกครั้ง"
  }

  const state = { districts: [], stations: [], reports: [], filter: "all", selected: null }
  const pins = new Map()
  let map = null
  let popup = null
  let onPopupClose = null

  const $ = (id) => document.getElementById(id)
  const el = (tag, className, text) => {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text != null) node.textContent = text
    return node
  }

  // Same spot every time for the same landmark, so merged reports keep one pin.
  const hash = (text) => [...text].reduce((h, c) => (Math.imul(h, 31) + c.codePointAt(0)) >>> 0, 7)
  function place(districtId, key) {
    const [lon, lat] = CENTRES[districtId] ?? [100.6, 13.78]
    const h = hash(districtId + key)
    const angle = ((h % 360) * Math.PI) / 180
    const radius = 0.004 + ((h >>> 9) % 80) / 10000
    return [lon + Math.cos(angle) * radius, lat + Math.sin(angle) * radius]
  }
  const positionOf = (item) => (item.kind === "station" ? CENTRES[item.districtId] : place(item.districtId, item.landmark.toLowerCase()))

  async function api(path, init) {
    const res = await fetch(path, init)
    let body = null
    try {
      body = await res.json()
    } catch {
      body = null
    }
    return { status: res.status, body, headers: res.headers }
  }

  async function load() {
    const list = await api("/districts")
    if (list.status !== 200) throw new Error("districts")
    if (list.body.notice) $("notice").textContent = list.body.notice
    state.districts = list.body.districts
    const details = await Promise.all(state.districts.map((d) => api(`/districts/${d.id}`)))
    const stations = []
    const reports = []
    details.forEach((res, i) => {
      const d = state.districts[i]
      if (res.status !== 200) return
      for (const s of res.body.stations) if (s.latest) stations.push({ ...s, kind: "station", key: "st:" + s.id, districtId: d.id, districtName: d.nameTh })
      for (const r of res.body.userReports) reports.push({ ...r, kind: "report", key: r.id, districtId: d.id, districtName: d.nameTh })
    })
    // All seenAt values carry +07:00, so they sort as text.
    reports.sort((a, b) => (a.seenAt < b.seenAt ? 1 : a.seenAt > b.seenAt ? -1 : a.id < b.id ? -1 : 1))
    state.stations = stations
    state.reports = reports
    if (state.selected && !findItem(state.selected)) {
      state.selected = null
      closePopup()
    }
    render()
  }

  const findItem = (key) => [...state.reports, ...state.stations].find((x) => x.key === key)
  const inFilter = (item) => state.filter === "all" || item.districtId === state.filter

  const confirmText = (n) => (n > 1 ? `ยืนยัน ${n} คน` : "รายงาน 1 คน")

  function depthChip(level, cm) {
    return el("span", "depth " + level, `${DEPTH_TH[level]} ~${cm} cm`)
  }

  function renderFilters() {
    const counts = new Map()
    for (const r of state.reports) counts.set(r.districtId, (counts.get(r.districtId) ?? 0) + 1)
    const options = [["all", "ทุกเขต", state.reports.length], ...state.districts.map((d) => [d.id, d.nameTh, counts.get(d.id) ?? 0])]
    $("filters").replaceChildren(
      ...options.map(([id, name, n]) => {
        const b = el("button", "chip", n ? `${name} ${n}` : name)
        b.type = "button"
        b.setAttribute("aria-pressed", String(state.filter === id))
        b.addEventListener("click", () => {
          state.filter = id
          render()
          if (id !== "all" && map && CENTRES[id]) map.flyTo({ center: CENTRES[id], zoom: 12.5 })
        })
        return b
      })
    )
  }

  function renderList() {
    const visible = state.reports.filter(inFilter)
    $("count").textContent = `${visible.length} จุด`
    if (!visible.length) {
      $("incidents").replaceChildren(el("li", "empty", "ยังไม่มีใครรายงานในช่วง 6 ชั่วโมงที่ผ่านมา ถ้าเห็นน้ำท่วม กด \"แจ้งจุดน้ำท่วม\" ด้านบน"))
      return
    }
    $("incidents").replaceChildren(
      ...visible.map((r) => {
        const li = el("li")
        const b = el("button", "incident")
        b.type = "button"
        b.setAttribute("aria-current", String(state.selected === r.key))
        const top = el("div", "top")
        top.append(el("span", "landmark", r.landmark), depthChip(r.depthLevel, r.depthCm))
        const meta = el("div", "meta")
        meta.append(
          el("span", null, `เขต${r.districtName}`),
          el("span", null, r.ageLabel),
          el("span", null, confirmText(r.confirmations))
        )
        b.append(top, meta, el("span", "unverified", r.label))
        b.addEventListener("click", () => select(r.key, true))
        li.append(b)
        return li
      })
    )
  }

  function renderPins() {
    if (!map) return
    for (const { marker } of pins.values()) marker.remove()
    pins.clear()
    const items = [...state.stations.filter(inFilter), ...[...state.reports].reverse().filter(inFilter)]
    for (const item of items) {
      const b = el("button", "pin")
      b.type = "button"
      if (item.kind === "station") {
        b.classList.add("pin-station")
        b.setAttribute("aria-label", `สถานีวัด ${item.nameTh} ${item.latest.levelCm} เซนติเมตร`)
      } else {
        b.classList.add("pin-report", item.depthLevel)
        if (item.confirmations > 1) b.append(el("span", null, String(Math.min(item.confirmations, 99))))
        b.setAttribute("aria-label", `${item.landmark} น้ำระดับ${DEPTH_TH[item.depthLevel]} ${item.ageLabel} ยืนยัน ${item.confirmations} คน`)
      }
      if (state.selected === item.key) b.classList.add("selected")
      b.addEventListener("click", (e) => {
        e.stopPropagation()
        select(item.key, false)
      })
      // The drop is a rotated square; its tip sits about 5px below the element box.
      const placement = item.kind === "station" ? { anchor: "center" } : { anchor: "bottom", offset: [0, -5] }
      const marker = new maplibregl.Marker({ element: b, ...placement })
        .setLngLat(positionOf(item))
        .addTo(map)
      pins.set(item.key, { marker, el: b })
    }
  }

  function popupContent(item) {
    const box = el("div", "popup")
    if (item.kind === "station") {
      box.append(
        el("span", "kind", `สถานีวัดระดับน้ำ · เขต${item.districtName}`),
        el("span", "landmark", item.nameTh),
        el("span", "meta", `${item.latest.levelCm} cm · วัดเมื่อ ${item.latest.at.slice(11, 16)} น.`)
      )
      return box
    }
    const meta = el("div", "meta")
    meta.append(el("span", null, item.ageLabel), el("span", null, confirmText(item.confirmations)))
    box.append(
      el("span", "kind", `รายงานจากคนในพื้นที่ · เขต${item.districtName}`),
      el("span", "landmark", item.landmark),
      depthChip(item.depthLevel, item.depthCm),
      meta,
      el("span", "unverified", `${item.label} · ตำแหน่งโดยประมาณ`)
    )
    return box
  }

  /** Close the popup without its close handler, so re-selecting the same pin keeps it selected. */
  function closePopup() {
    if (!popup) return
    popup.off("close", onPopupClose)
    popup.remove()
    popup = null
  }

  function select(key, fly) {
    const item = findItem(key)
    state.selected = item ? key : null
    renderList()
    for (const [k, { el: pinEl }] of pins) pinEl.classList.toggle("selected", k === state.selected)
    if (!item || !map) return
    const at = positionOf(item)
    closePopup()
    popup = new maplibregl.Popup({ offset: item.kind === "station" ? 12 : 34, maxWidth: "260px" }).setLngLat(at).setDOMContent(popupContent(item)).addTo(map)
    // Closed by the user (x button or a click on the map): clear the selection.
    onPopupClose = () => {
      popup = null
      state.selected = null
      renderList()
      pins.get(key)?.el.classList.remove("selected")
    }
    popup.on("close", onPopupClose)
    if (fly) map.flyTo({ center: at, zoom: Math.max(map.getZoom(), 13) })
  }

  function render() {
    renderFilters()
    renderList()
    renderPins()
  }

  function showStatus(text) {
    $("map-status").textContent = text
    $("map-status").hidden = !text
  }

  const dark = () => !window.matchMedia("(prefers-color-scheme: light)").matches
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

  function blankStyle() {
    return { version: 8, sources: {}, layers: [{ id: "land", type: "background", paint: { "background-color": cssVar("--land") } }] }
  }

  function basemapStyle() {
    const flavor = dark() ? "dark" : "light"
    // Thai labels. The italic face has no Thai glyphs, so water names use the regular face.
    const layers = basemaps.layers("protomaps", basemaps.namedFlavor(flavor), { lang: "th" }).map((layer) => {
      const font = layer.layout && layer.layout["text-font"]
      if (Array.isArray(font)) layer.layout["text-font"] = font.map((f) => (f === "Noto Sans Italic" ? "Noto Sans Regular" : f))
      return layer
    })
    return {
      version: 8,
      glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
      sprite: `https://protomaps.github.io/basemaps-assets/sprites/v4/${flavor}`,
      sources: {
        protomaps: {
          type: "vector",
          url: `pmtiles://${location.origin}${TILES_URL}`,
          attribution: "<a href=\"https://openstreetmap.org/copyright\">© OpenStreetMap</a> · <a href=\"https://protomaps.com\">Protomaps</a>"
        }
      },
      layers
    }
  }

  async function initMap() {
    if (!window.maplibregl || !window.pmtiles || !window.basemaps) {
      showStatus("โหลดตัวแผนที่ไม่ได้ ยังดูรายการจุดทางขวาได้")
      return
    }
    const protocol = new pmtiles.Protocol()
    maplibregl.addProtocol("pmtiles", protocol.tile)
    map = new maplibregl.Map({
      container: "map",
      style: blankStyle(),
      center: [100.6, 13.78],
      zoom: 10.3,
      maxBounds: BOUNDS,
      attributionControl: { compact: true }
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right")
    // The tiles file is not in git. Without it the map still shows pins on a plain background.
    try {
      const probe = await fetch(TILES_URL, { headers: { range: "bytes=0-126" } })
      if (probe.status === 206 || probe.status === 200) map.setStyle(basemapStyle())
      else showStatus("ยังไม่มีไฟล์แผนที่พื้นหลัง (ดู README หัวข้อแผนที่) หมุดยังดูได้ตามปกติ")
    } catch {
      showStatus("โหลดแผนที่พื้นหลังไม่ได้ หมุดยังดูได้ตามปกติ")
    }
  }

  // Report form
  const dialog = $("report-dialog")
  const form = $("report-form")
  const landmark = $("f-landmark")

  function openForm() {
    const select = $("f-district")
    const current = state.filter !== "all" ? state.filter : ""
    const placeholder = el("option", null, "เลือกเขต")
    placeholder.value = ""
    select.replaceChildren(
      placeholder,
      ...state.districts.map((d) => {
        const o = el("option", null, d.nameTh)
        o.value = d.id
        return o
      })
    )
    select.value = current
    $("f-error").hidden = true
    dialog.showModal()
    ;(current ? landmark : select).focus()
  }

  function formError(text) {
    $("f-error").textContent = text
    $("f-error").hidden = false
  }

  let toastTimer = 0
  function toast(text) {
    $("toast").textContent = text
    $("toast").hidden = false
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => ($("toast").hidden = true), 4000)
  }

  landmark.addEventListener("input", () => {
    // Count the way the server does (RPT-REQ-004): NFKC, drop format chars, collapse spaces.
    const text = landmark.value.normalize("NFKC").replace(/\p{Cf}/gu, "").replace(/\s+/gu, " ").trim()
    const n = [...text].length
    $("f-counter").textContent = `${n} / 80`
    $("f-counter").classList.toggle("over", n > 80)
  })

  form.addEventListener("submit", async (e) => {
    e.preventDefault()
    const districtId = $("f-district").value
    if (!districtId) return formError("เลือกเขตก่อนส่ง")
    const minutesAgo = Number($("f-seen").value)
    const body = {
      landmark: landmark.value,
      depth: new FormData(form).get("depth"),
      seenAt: new Date(Date.now() - minutesAgo * 60 * 1000).toISOString()
    }
    $("f-submit").disabled = true
    let res
    try {
      res = await api(`/districts/${districtId}/reports`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      })
    } catch {
      return formError("เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง")
    } finally {
      $("f-submit").disabled = false
    }

    if (res.status !== 201 && res.status !== 200) {
      const code = res.body && res.body.error
      if (code === "rate_limited") {
        const minutes = Math.ceil(Number(res.body.retryAfterSec) / 60)
        return formError(`ส่งได้ 5 ครั้งต่อชั่วโมง ลองใหม่อีกประมาณ ${minutes} นาที`)
      }
      return formError(ERRORS[code] ?? "ส่งไม่สำเร็จ ลองใหม่อีกครั้ง")
    }

    // Saved. From here on the dialog is closed, so problems go to the toast.
    dialog.close()
    form.reset()
    landmark.dispatchEvent(new Event("input"))
    const report = res.body.report
    toast(res.body.merged ? `รวมกับรายงานเดิม ตอนนี้ยืนยัน ${report.confirmations} คน` : "บันทึกแล้ว ขอบคุณที่แจ้ง")
    state.filter = "all"
    try {
      await load()
      select(report.id, true)
    } catch {
      toast("บันทึกแล้ว แต่โหลดแผนที่ใหม่ไม่ได้ จะลองอีกครั้งใน 1 นาที")
    }
  })

  $("report-open").addEventListener("click", openForm)
  $("report-close").addEventListener("click", () => dialog.close())

  async function refresh() {
    try {
      await load()
      if (state.selected) select(state.selected, false)
    } catch {
      toast("โหลดข้อมูลล่าสุดไม่ได้ จะลองใหม่อีกครั้ง")
    }
  }

  initMap().finally(() => {
    refresh()
    setInterval(() => {
      if (!document.hidden) refresh()
    }, REFRESH_MS)
  })
})()
