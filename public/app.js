"use strict"

// Map page for the flood-report API. Talks only to this server (same origin).
// Every piece of text that came from a user goes into the page with textContent, never as markup.
;(() => {
  const DEPTH_TH = { ankle: "ข้อเท้า", knee: "เข่า", waist: "เอว" }
  const REFRESH_MS = 60 * 1000
  // Each tab has its own basemap extract (ADR 0001); neither is in git, and the page works without them.
  const TILES = { flood: "/tiles/bangkok.pmtiles", north: "/tiles/thailand.pmtiles" }
  // กึ่งกลางเขต [lon, lat] by district id, from GET /districts. The API stores no coordinates
  // for reports (spec §5, RPT-REQ-013), so pins sit near these points. Approximate on purpose.
  let CENTRES = {}
  const BOUNDS = { flood: [[100.3, 13.5], [100.95, 14.05]], north: [[97.3, 5.6], [105.7, 20.5]] }
  // The Chao Phraya basin from the big dams (Tak, Uttaradit) down to the sea, the area the north tab is about.
  const BASIN_VIEW = [[98.6, 13.4], [101.7, 18.0]]
  // The whole demo scene (city-wide) fits this view; the normal view starts a little tighter.
  const DEMO_VIEW = { center: [100.635, 13.8], zoom: 10.9 }

  // DOM-free logic (merge, sort, count, place, wording) lives in logic.js so it can be tested.
  const L = window.NAMTUAM_LOGIC

  // Simulated reports and flood areas from demo.js, only when the page is opened with ?demo or toggled on.
  const DEMO = window.NAMTUAM_DEMO
  // Depth bands in cm for the water layer. Colours come from the --flood-1..5 tokens in app.css,
  // so the map, the legend and the pins share one palette per theme.
  const FLOOD_CM = [10, 30, 50, 80, 100]

  const state = {
    districts: [],
    stations: [],
    realReports: [],
    reports: [],
    filter: "all",
    selected: null,
    demo: Boolean(DEMO) && new URLSearchParams(location.search).has("demo"),
    tab: L.tabFromHash(location.hash),
    // Real เขื่อน as reference points (public/data/dams.geojson), loaded once.
    dams: [],
    // The สถานการณ์จำลอง: off until the viewer opens it, loaded on first use, scrubbed by T+hours.
    scenario: null,
    scenarioOn: false,
    t: 0,
    // Basin จังหวัด with their อำเภอ (GET /basin, once) and every active basin รายงาน (GET /basin/reports).
    basin: [],
    basinReports: [],
    // Which kind the report form sends: "flooded" from the flood tab, "arriving" from the north tab.
    formKind: "flooded"
  }
  const pins = new Map()
  let map = null
  const hasTiles = { flood: false, north: false }
  let firstRender = true
  // True between a style's "style.load" and the next setStyle; custom layers can only be added then.
  let styleReady = false
  let popup = null
  let onPopupClose = null

  const SVG_NS = "http://www.w3.org/2000/svg"
  /** Small inline icon from path data we write ourselves (never from user input). */
  function icon(d, className) {
    const svg = document.createElementNS(SVG_NS, "svg")
    svg.setAttribute("viewBox", "0 0 20 20")
    svg.setAttribute("aria-hidden", "true")
    if (className) svg.setAttribute("class", className)
    const path = document.createElementNS(SVG_NS, "path")
    path.setAttribute("d", d)
    path.setAttribute("fill", "none")
    path.setAttribute("stroke", "currentColor")
    path.setAttribute("stroke-width", "1.7")
    path.setAttribute("stroke-linecap", "round")
    path.setAttribute("stroke-linejoin", "round")
    svg.append(path)
    return svg
  }
  const ICON_PEOPLE = "M7 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm-4.5 7c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5M13.5 9a2 2 0 1 0 0-4M14 11.6c1.9.4 3.5 2.1 3.5 4.4"
  const ICON_DROP = "M10 2.5c3.2 4 5.2 6.8 5.2 9.2a5.2 5.2 0 0 1-10.4 0c0-2.4 2-5.2 5.2-9.2Z"

  const $ = (id) => document.getElementById(id)
  const el = (tag, className, text) => {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text != null) node.textContent = text
    return node
  }

  const positionOf = (item) => L.positionOf(item, CENTRES)

  const { ageLabel: ageLabelTh, bangkokIso } = L

  function demoReports() {
    if (!state.demo) return []
    const nameOf = (id) => state.districts.find((d) => d.id === id)?.nameTh ?? id
    return DEMO.reports.map((r, i) => ({
      ...r,
      id: `demo-${i}`,
      key: `demo:${i}`,
      kind: "report",
      demo: true,
      districtName: nameOf(r.districtId),
      ageLabel: ageLabelTh(r.ageMinutes),
      seenAt: bangkokIso(Date.now() - r.ageMinutes * 60 * 1000)
    }))
  }

  function mergeReports() {
    state.reports = L.mergeReports(state.realReports, demoReports(), state.demo)
  }

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
    CENTRES = Object.fromEntries(state.districts.map((d) => [d.id, d.centre]))
    const details = await Promise.all(state.districts.map((d) => api(`/districts/${d.id}`)))
    const stations = []
    const reports = []
    details.forEach((res, i) => {
      const d = state.districts[i]
      if (res.status !== 200) return
      for (const s of res.body.stations) if (s.latest) stations.push({ ...s, kind: "station", key: "st:" + s.id, districtId: d.id, districtName: d.nameTh })
      for (const r of res.body.userReports) reports.push({ ...r, kind: "report", key: r.id, districtId: d.id, districtName: d.nameTh })
    })
    state.stations = stations
    state.realReports = reports
    await loadDams().catch(() => {})
    await loadBasin().catch(() => {})
    mergeReports()
    if (state.selected && !findItem(state.selected)) {
      state.selected = null
      closePopup()
    }
    render()
  }

  const findItem = (key) => [...state.reports, ...state.stations].find((x) => x.key === key)
  const inFilter = (item) => L.inFilter(state.filter)(item)

  const confirmText = (n) => (n > 1 ? `ยืนยัน ${n} คน` : "รายงาน 1 คน")
  const depthText = (level, cm) => `ระดับ${DEPTH_TH[level]} ~${cm} cm`

  /** A small staff gauge filled to the reported depth. */
  function staff(level) {
    const gauge = el("span", "staff " + level)
    gauge.setAttribute("aria-hidden", "true")
    gauge.append(el("i"))
    return gauge
  }

  function renderSummary() {
    const counts = L.countByDepth(state.reports, state.filter)
    for (const level of ["ankle", "knee", "waist"]) {
      $("summary").querySelector(`.tile.${level} b`).textContent = String(counts[level])
    }
    $("updated").textContent = `อัปเดต ${bangkokIso(Date.now()).slice(11, 16)} น.`
  }

  function renderFilters() {
    const counts = L.countByDistrict(state.reports)
    const options = [["all", "ทุกเขต", state.reports.length], ...state.districts.map((d) => [d.id, d.nameTh, counts[d.id] ?? 0])]
    $("filters").replaceChildren(
      ...options.map(([id, name, n]) => {
        const b = el("button", "chip", name)
        b.type = "button"
        if (n) b.append(el("b", null, String(n)))
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
    $("count").textContent = visible.length ? `· ${visible.length}` : ""
    const list = $("incidents")
    if (!visible.length) {
      const empty = el("li", "empty")
      empty.append(icon(ICON_DROP), el("span", null, "ยังไม่มีใครรายงานในช่วง 6 ชั่วโมงที่ผ่านมา"), el("span", null, "ถ้าเห็นน้ำท่วม กด \"แจ้งจุดน้ำท่วม\""))
      list.replaceChildren(empty)
      return
    }
    list.replaceChildren(
      ...visible.map((r) => {
        const li = el("li")
        const b = el("button", "incident")
        b.type = "button"
        b.setAttribute("aria-current", String(state.selected === r.key))

        const info = el("div", "body")
        const title = el("div", "title")
        title.append(el("span", "landmark", r.landmark))
        if (r.demo) title.append(el("span", "demo-badge", "จำลอง"))
        const meta = el("div", "meta")
        meta.append(el("span", "depth-label", depthText(r.depthLevel, r.depthCm)), el("span", "dot"), el("span", null, `เขต${r.districtName}`))
        const foot = el("div", "foot")
        const confirm = el("span", "confirm")
        confirm.append(icon(ICON_PEOPLE), confirmText(r.confirmations))
        foot.append(el("span", null, r.ageLabel), confirm, el("span", null, r.label))
        info.append(title, meta, foot)

        b.append(staff(r.depthLevel), info)
        b.addEventListener("click", () => select(r.key, true))
        li.append(b)
        return li
      })
    )
    // Stagger the cards in on the first render only; refreshes should not replay it.
    if (firstRender) {
      firstRender = false
      list.classList.add("intro")
      setTimeout(() => list.classList.remove("intro"), 900)
    }
  }

  function renderPins() {
    if (!map) return
    for (const { marker } of pins.values()) marker.remove()
    pins.clear()
    if (state.tab === "north") {
      renderDamPins()
      renderArrivingPins()
      return
    }
    const items = [...state.stations.filter(inFilter), ...[...state.reports].reverse().filter(inFilter)]
    for (const item of items) {
      const b = el("button", "pin")
      b.type = "button"
      if (item.kind === "station") {
        b.classList.add("pin-station")
        b.setAttribute("aria-label", `สถานีวัด ${item.nameTh} ${item.latest.levelCm} เซนติเมตร`)
      } else {
        b.classList.add("pin-report", item.depthLevel)
        if (item.demo) b.classList.add("demo")
        b.title = item.landmark
        if (item.confirmations > 1) b.append(el("span", null, String(Math.min(item.confirmations, 99))))
        b.setAttribute("aria-label", `${item.landmark} น้ำระดับ${DEPTH_TH[item.depthLevel]} ${item.ageLabel} ยืนยัน ${item.confirmations} คน`)
      }
      if (state.selected === item.key) b.classList.add("selected")
      b.addEventListener("click", (e) => {
        e.stopPropagation()
        select(item.key, false)
      })
      const marker = new maplibregl.Marker({ element: b, anchor: "center" })
        .setLngLat(positionOf(item))
        .addTo(map)
      pins.set(item.key, { marker, el: b })
    }
  }

  const ICON_DAM = "M3 15h14M5 15V8l5-3 5 3v7M8 15v-4h4v4"

  /** เขื่อน on the north tab: name and a link to RID only, never a release figure (safety rule 4). */
  function renderDamPins() {
    for (const { properties, geometry } of state.dams) {
      const b = el("button", "pin pin-dam")
      b.type = "button"
      b.append(icon(ICON_DAM))
      const popupText = L.damPopup(properties, releaseOf(properties.id))
      b.setAttribute("aria-label", popupText.title)
      b.addEventListener("click", (e) => {
        e.stopPropagation()
        closePopup()
        popup = new maplibregl.Popup({ offset: 16, maxWidth: "280px" }).setLngLat(geometry.coordinates).setDOMContent(damContent(popupText)).addTo(map)
      })
      const marker = new maplibregl.Marker({ element: b, anchor: "center" }).setLngLat(geometry.coordinates).addTo(map)
      pins.set(`dam:${properties.id}`, { marker, el: b })
    }
  }

  /** อำเภอ centres for the whole basin, so an arriving รายงาน gets a stable spot near its อำเภอ. */
  const basinCentres = () => Object.fromEntries(state.basin.flatMap((p) => p.districts.map((d) => [d.id, d.centre])))
  const districtNameOf = (id) => state.basin.flatMap((p) => p.districts).find((d) => d.id === id)?.nameTh ?? id

  /** "น้ำกำลังมา" reports on the north tab, placed near their อำเภอ centre like every รายงาน (RPT-REQ-013). */
  function renderArrivingPins() {
    const centres = basinCentres()
    const arriving = state.basinReports.filter((r) => r.kind === "arriving")
    $("arriving-count").textContent = arriving.length ? `มีคนแจ้งน้ำกำลังมา ${arriving.length} จุด ใน 6 ชั่วโมงล่าสุด` : "ยังไม่มีใครแจ้งน้ำกำลังมาใน 6 ชั่วโมงล่าสุด"
    for (const r of arriving) {
      const at = L.place(centres, r.districtId, r.landmark.toLowerCase())
      const b = el("button", `pin pin-report pin-arriving ${r.depthLevel}`)
      b.type = "button"
      if (r.confirmations > 1) b.append(el("span", null, String(Math.min(r.confirmations, 99))))
      b.setAttribute("aria-label", `น้ำกำลังมา ${r.landmark} ${districtNameOf(r.districtId)} ${r.ageLabel}`)
      b.addEventListener("click", (e) => {
        e.stopPropagation()
        closePopup()
        popup = new maplibregl.Popup({ offset: 20, maxWidth: "280px" }).setLngLat(at).setDOMContent(arrivingContent(r)).addTo(map)
      })
      const marker = new maplibregl.Marker({ element: b, anchor: "center" }).setLngLat(at).addTo(map)
      pins.set(`arriving:${r.id}`, { marker, el: b })
    }
  }

  function arrivingContent(r) {
    const box = el("div", "popup")
    const head = el("div", "title")
    head.append(staff(r.depthLevel), el("span", "landmark", r.landmark))
    const meta = el("div", "meta")
    meta.append(el("span", "depth-label", depthText(r.depthLevel, r.depthCm)), el("span", "dot"), el("span", null, r.ageLabel))
    const confirm = el("span", "confirm")
    confirm.append(icon(ICON_PEOPLE), confirmText(r.confirmations))
    const foot = el("div", "foot")
    foot.append(confirm, el("span", null, `${r.label} · ตำแหน่งโดยประมาณ`))
    box.append(el("span", "kind", `น้ำกำลังมา · ${districtNameOf(r.districtId)}`), head, meta, foot)
    return box
  }

  /** The dam's release at the current T, only while the สถานการณ์จำลอง is on; otherwise none (safety rule 4). */
  function releaseOf(damId) {
    if (!state.scenarioOn || !state.scenario) return undefined
    return L.scenarioStep(state.scenario, state.t).releases.find((r) => r.dam === damId)
  }

  const SCENARIO_LAYERS = ["scenario-banner", "scenario-reached", "scenario-line", "scenario-areas"]
  const SCENARIO_SOURCES = ["scenario-banner", "scenario-reached", "scenario-line", "scenario-areas"]
  const DEPTH_VAR = { ankle: "--ankle", knee: "--knee", waist: "--waist" }

  const featureCollection = (features) => ({ type: "FeatureCollection", features })

  /** Water path, reached stretch, flood areas and the on-canvas banner, on the north tab with the scenario on. */
  function syncScenarioLayers() {
    if (!map || !styleReady) return
    for (const id of SCENARIO_LAYERS) if (map.getLayer(id)) map.removeLayer(id)
    for (const id of SCENARIO_SOURCES) if (map.getSource(id)) map.removeSource(id)
    if (state.tab !== "north" || !state.scenarioOn || !state.scenario) return

    const step = L.scenarioStep(state.scenario, state.t)
    const line = state.scenario.flowLine
    const areas = step.areas.map((a) => ({
      type: "Feature",
      properties: { depthLevel: a.depthLevel },
      geometry: { type: "Polygon", coordinates: [L.circleRing(a.centre, a.radiusKm)] }
    }))
    map.addSource("scenario-areas", { type: "geojson", data: featureCollection(areas) })
    map.addSource("scenario-line", { type: "geojson", data: { type: "Feature", properties: {}, geometry: line } })
    map.addSource("scenario-reached", {
      type: "geojson",
      data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: L.lineUpToKm(line, step.frontKm) } }
    })
    map.addSource("scenario-banner", { type: "geojson", data: featureCollection(bannerNow()) })

    map.addLayer({
      id: "scenario-areas",
      type: "fill",
      source: "scenario-areas",
      paint: {
        "fill-color": ["match", ["get", "depthLevel"], ...Object.entries(DEPTH_VAR).flatMap(([k, v]) => [k, cssVar(v)]), cssVar("--knee")],
        "fill-opacity": ["match", ["get", "depthLevel"], "ankle", 0.35, "knee", 0.5, 0.65]
      }
    })
    map.addLayer({ id: "scenario-line", type: "line", source: "scenario-line", paint: { "line-color": cssVar("--accent"), "line-width": 2, "line-opacity": 0.35, "line-dasharray": [2, 2] } })
    map.addLayer({ id: "scenario-reached", type: "line", source: "scenario-reached", paint: { "line-color": cssVar("--accent"), "line-width": 4 } })
    map.addLayer({
      id: "scenario-banner",
      type: "symbol",
      source: "scenario-banner",
      layout: {
        "text-field": ["get", "text"],
        "text-font": ["Noto Sans Medium"],
        "text-size": 20,
        "text-rotate": -18,
        "text-allow-overlap": true,
        "text-ignore-placement": true
      },
      paint: { "text-color": cssVar("--notice-fg"), "text-opacity": 0.45, "text-halo-color": cssVar("--land"), "text-halo-width": 1.5 }
    })
  }

  /** Banner points for what is on screen now, so the label is in frame however far the viewer pans or zooms. */
  function bannerNow() {
    const b = map.getBounds()
    return L.bannerFeatures([[b.getWest(), b.getSouth()], [b.getEast(), b.getNorth()]], state.scenario.label, state.scenarioOn)
  }

  function renderScenarioPanel() {
    const button = $("scenario-toggle")
    button.setAttribute("aria-pressed", String(state.scenarioOn))
    $("scenario-panel").hidden = !state.scenarioOn || !state.scenario
    if (!state.scenarioOn || !state.scenario) return
    const step = L.scenarioStep(state.scenario, state.t)
    const slider = $("scenario-t")
    slider.max = String(state.scenario.maxT)
    slider.step = String(state.scenario.stepT)
    slider.value = String(step.t)
    $("scenario-t-out").textContent = L.formatT(step.t)
    $("scenario-label").textContent = state.scenario.label
    $("scenario-note").textContent = state.scenario.note
    const nameOf = (id) => state.dams.find((d) => d.properties.id === id)?.properties.nameTh ?? id
    $("scenario-releases").replaceChildren(
      ...step.releases.map((r) => {
        const li = el("li")
        li.append(el("span", null, `เขื่อน${nameOf(r.dam)}`), el("b", null, L.releaseText(r.m3s)))
        return li
      })
    )
  }

  async function loadScenario() {
    if (state.scenario) return
    // A static file, never the API: the scenario is never sent anywhere (ข้อมูลจำลอง rules).
    const res = await api("/data/scenarios/chao-phraya.json")
    if (res.status !== 200 || !res.body) throw new Error("scenario")
    state.scenario = res.body
  }

  function damContent({ title, note, link }) {
    const box = el("div", "popup")
    const a = el("a", "official-link", link.text)
    a.href = link.href
    a.target = "_blank"
    a.rel = "noopener"
    box.append(el("span", "kind", "เขื่อน · จุดอ้างอิง"), el("span", "landmark", title), el("span", "meta", note), a)
    return box
  }

  async function loadBasin() {
    if (!state.basin.length) {
      const res = await api("/basin")
      if (res.status === 200 && res.body) state.basin = res.body.provinces
    }
    const reports = await api("/basin/reports")
    if (reports.status === 200 && reports.body) state.basinReports = reports.body.reports
  }

  async function loadDams() {
    if (state.dams.length) return
    const res = await api("/data/dams.geojson")
    if (res.status === 200 && res.body) state.dams = res.body.features
  }

  function popupContent(item) {
    const box = el("div", "popup")
    if (item.kind === "station") {
      const reading = el("div", "reading", String(item.latest.levelCm))
      reading.append(el("small", null, "cm"))
      box.append(
        el("span", "kind", `สถานีวัดระดับน้ำ · เขต${item.districtName}`),
        el("span", "landmark", item.nameTh),
        reading,
        el("span", "meta", `วัดเมื่อ ${item.latest.at.slice(11, 16)} น. · ข้อมูลสมมติ`)
      )
      return box
    }
    const head = el("div", "title")
    head.append(staff(item.depthLevel), el("span", "landmark", item.landmark))
    const meta = el("div", "meta")
    meta.append(el("span", "depth-label", depthText(item.depthLevel, item.depthCm)), el("span", "dot"), el("span", null, item.ageLabel))
    const confirm = el("span", "confirm")
    confirm.append(icon(ICON_PEOPLE), confirmText(item.confirmations))
    const foot = el("div", "foot")
    foot.append(confirm, el("span", null, item.demo ? item.label : `${item.label} · ตำแหน่งโดยประมาณ`))
    box.append(el("span", "kind", `รายงานจากคนในพื้นที่ · เขต${item.districtName}`), head, meta, foot)
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
    popup = new maplibregl.Popup({ offset: item.kind === "station" ? 12 : 20, maxWidth: "280px" }).setLngLat(at).setDOMContent(popupContent(item)).addTo(map)
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

  const FLOOD_LAYERS = ["demo-flood-edge", "demo-flood-glow", "demo-flood"]

  /**
   * Draw (or remove) the simulated flood areas under the basemap's labels. Each depth band is a
   * fill that gets more opaque with depth, over a blurred line of the same colour so edges read
   * as water rather than hard polygons. Safe to call any time.
   */
  function syncFloodLayers() {
    const show = state.demo && state.tab === "flood"
    $("legend").hidden = !show || !map
    if (!map || !styleReady) return
    for (const id of FLOOD_LAYERS) if (map.getLayer(id)) map.removeLayer(id)
    if (map.getSource("demo-flood")) map.removeSource("demo-flood")
    if (!show) return

    const colour = ["interpolate", ["linear"], ["get", "depthCm"], ...FLOOD_CM.flatMap((cm, i) => [cm, cssVar(`--flood-${i + 1}`)])]
    const beforeId = map.getStyle().layers.find((l) => l.type === "symbol")?.id
    map.addSource("demo-flood", { type: "geojson", data: DEMO.floodAreas() })
    map.addLayer(
      {
        id: "demo-flood-glow",
        type: "line",
        source: "demo-flood",
        paint: {
          "line-color": colour,
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 4, 15, 14],
          "line-blur": ["interpolate", ["linear"], ["zoom"], 10, 3, 15, 10],
          "line-opacity": 0.45
        }
      },
      beforeId
    )
    map.addLayer(
      {
        id: "demo-flood",
        type: "fill",
        source: "demo-flood",
        paint: {
          "fill-color": colour,
          "fill-opacity": ["interpolate", ["linear"], ["get", "depthCm"], 10, 0.32, 50, 0.5, 100, 0.72],
          "fill-antialias": true
        }
      },
      beforeId
    )
    map.addLayer(
      {
        id: "demo-flood-edge",
        type: "line",
        source: "demo-flood",
        filter: ["==", ["get", "depthCm"], FLOOD_CM[0]],
        paint: { "line-color": cssVar("--flood-edge"), "line-width": 1.2 }
      },
      beforeId
    )
  }

  const BASIN_LAYERS = ["basin-district-labels", "basin-districts", "basin-provinces"]
  const COD_AB = "เขตการปกครอง: <a href=\"https://data.humdata.org/dataset/cod-ab-tha\">COD-AB</a> กรมแผนที่ทหาร / OCHA (CC BY-IGO)"

  /** จังหวัด and อำเภอ outlines of the basin, with Thai district names, on the north tab only. Safe to call any time. */
  function syncBasinLayers() {
    if (!map || !styleReady) return
    for (const id of BASIN_LAYERS) if (map.getLayer(id)) map.removeLayer(id)
    for (const id of ["basin-provinces", "basin-districts"]) if (map.getSource(id)) map.removeSource(id)
    if (state.tab !== "north") return

    map.addSource("basin-provinces", { type: "geojson", data: "/data/basin-provinces.geojson", attribution: COD_AB })
    map.addSource("basin-districts", { type: "geojson", data: "/data/basin-districts.geojson" })
    map.addLayer({
      id: "basin-districts",
      type: "line",
      source: "basin-districts",
      paint: { "line-color": cssVar("--line-strong"), "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.4, 10, 1] }
    })
    map.addLayer({ id: "basin-provinces", type: "line", source: "basin-provinces", paint: { "line-color": cssVar("--muted"), "line-width": 1.6 } })
    map.addLayer({
      id: "basin-district-labels",
      type: "symbol",
      source: "basin-districts",
      minzoom: 8,
      layout: { "text-field": ["get", "nameTh"], "text-font": ["Noto Sans Regular"], "text-size": 11 },
      paint: { "text-color": cssVar("--muted"), "text-halo-color": cssVar("--land"), "text-halo-width": 1.2 }
    })
  }

  /** Show the panel and map for the current tab. */
  function renderTab() {
    for (const node of document.querySelectorAll("[data-tab]")) node.hidden = node.dataset.tab !== state.tab
    for (const tab of ["flood", "north"]) {
      const link = $(`tab-${tab}`)
      if (tab === state.tab) link.setAttribute("aria-current", "page")
      else link.removeAttribute("aria-current")
    }
    if (!map) return
    map.setMaxBounds(BOUNDS[state.tab])
    if (state.tab === "north") map.fitBounds(BASIN_VIEW, { padding: 24, animate: false })
    else map.jumpTo(state.demo ? DEMO_VIEW : { center: [100.6, 13.78], zoom: 10.3 })
    applyStyle()
  }

  function renderDemoToggle() {
    const button = $("demo-toggle")
    button.hidden = !DEMO
    button.setAttribute("aria-pressed", String(state.demo))
  }

  function render() {
    renderDemoToggle()
    renderSummary()
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

  // Glyphs here too, so the basin labels still draw when there is no basemap file.
  function blankStyle() {
    return {
      version: 8,
      glyphs: `${location.origin}/vendor/glyphs/{fontstack}/{range}.pbf`,
      sources: {},
      layers: [{ id: "land", type: "background", paint: { "background-color": cssVar("--land") } }]
    }
  }

  function basemapStyle(tilesUrl) {
    const flavor = dark() ? "dark" : "light"
    // Thai labels. The italic face has no Thai glyphs, so water names use the regular face.
    const layers = basemaps.layers("protomaps", basemaps.namedFlavor(flavor), { lang: "th" }).map((layer) => {
      const font = layer.layout && layer.layout["text-font"]
      if (Array.isArray(font)) layer.layout["text-font"] = font.map((f) => (f === "Noto Sans Italic" ? "Noto Sans Regular" : f))
      return layer
    })
    return {
      version: 8,
      // Self-hosted (ADR 0001, scripts/vendor-map.sh). MapLibre wants absolute URLs here, like the tiles.
      glyphs: `${location.origin}/vendor/glyphs/{fontstack}/{range}.pbf`,
      sprite: `${location.origin}/vendor/sprites/${flavor}`,
      sources: {
        protomaps: {
          type: "vector",
          url: `pmtiles://${location.origin}${tilesUrl}`,
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
      center: state.demo ? DEMO_VIEW.center : [100.6, 13.78],
      zoom: state.demo ? DEMO_VIEW.zoom : 10.3,
      maxBounds: BOUNDS[state.tab],
      attributionControl: { compact: true }
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right")
    // Custom layers are dropped whenever the style changes (blank → basemap), so redraw on every load.
    map.on("style.load", () => {
      styleReady = true
      syncFloodLayers()
      syncBasinLayers()
      syncScenarioLayers()
    })
    // Keep the "ข้อมูลจำลอง" banner covering whatever is on screen.
    map.on("moveend", () => {
      const source = map.getSource("scenario-banner")
      if (source && state.scenario) source.setData(featureCollection(bannerNow()))
    })
    if (state.tab === "north") map.fitBounds(BASIN_VIEW, { padding: 24, animate: false })
    // The tiles files are not in git. Without one, that tab shows its pins or outlines on a plain background.
    await Promise.all(
      Object.entries(TILES).map(async ([tab, url]) => {
        try {
          const probe = await fetch(url, { headers: { range: "bytes=0-126" } })
          hasTiles[tab] = probe.status === 206 || probe.status === 200
        } catch {
          hasTiles[tab] = false
        }
      })
    )
    applyStyle()
    // Follow the system theme: new basemap flavour and new water colours.
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", applyStyle)
  }

  function applyStyle() {
    if (!map) return
    styleReady = false
    const tiles = hasTiles[state.tab]
    showStatus(tiles ? "" : "ยังไม่มีไฟล์แผนที่พื้นหลัง (ดู README หัวข้อแผนที่) ข้อมูลบนแผนที่ยังดูได้ตามปกติ")
    // diff: false so every swap is a full load that fires "style.load" and the custom layers come back.
    map.setStyle(tiles ? basemapStyle(TILES[state.tab]) : blankStyle(), { diff: false })
  }

  // Report form
  const dialog = $("report-dialog")
  const form = $("report-form")
  const landmark = $("f-landmark")

  function openForm(kind = "flooded") {
    state.formKind = kind
    const arriving = kind === "arriving"
    $("form-h").textContent = arriving ? "แจ้งน้ำกำลังมา" : "แจ้งจุดน้ำท่วม"
    $("f-district-label").textContent = arriving ? "จังหวัดและอำเภอ" : "เขต"
    const select = $("f-district")
    const current = !arriving && state.filter !== "all" ? state.filter : ""
    const placeholder = el("option", null, arriving ? "เลือกอำเภอ" : "เลือกเขต")
    placeholder.value = ""
    const option = (d) => {
      const o = el("option", null, d.nameTh)
      o.value = d.id
      return o
    }
    // จังหวัด → อำเภอ: one optgroup per basin province (north-water 04).
    const groups = state.basin.map((p) => {
      const g = document.createElement("optgroup")
      g.label = p.nameTh
      g.append(...p.districts.map(option))
      return g
    })
    select.replaceChildren(placeholder, ...(arriving ? groups : state.districts.map(option)))
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
    if (!districtId) return formError(state.formKind === "arriving" ? "เลือกอำเภอก่อนส่ง" : "เลือกเขตก่อนส่ง")
    const minutesAgo = Number($("f-seen").value)
    const body = {
      landmark: landmark.value,
      depth: new FormData(form).get("depth"),
      seenAt: new Date(Date.now() - minutesAgo * 60 * 1000).toISOString(),
      // Only the north tab sends a kind; a flood-tab report stays exactly as before (missing means flooded).
      ...(state.formKind === "arriving" ? { kind: "arriving" } : {})
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
      return formError(L.errorMessage(res.body && res.body.error, res.body && res.body.retryAfterSec))
    }

    // Saved. From here on the dialog is closed, so problems go to the toast.
    dialog.close()
    form.reset()
    landmark.dispatchEvent(new Event("input"))
    const report = res.body.report
    toast(res.body.merged ? `รวมกับรายงานเดิม ตอนนี้ยืนยัน ${report.confirmations} คน` : "บันทึกแล้ว ขอบคุณที่แจ้ง")
    if (state.formKind === "arriving") {
      // Not in the Bangkok list: reload the basin reports and show the new pin.
      try {
        await load()
        if (map) map.flyTo({ center: L.place(basinCentres(), districtId, report.landmark.toLowerCase()), zoom: Math.max(map.getZoom(), 10) })
      } catch {
        toast("บันทึกแล้ว แต่โหลดแผนที่ใหม่ไม่ได้ จะลองอีกครั้งใน 1 นาที")
      }
      return
    }
    state.filter = "all"
    try {
      await load()
      select(report.id, true)
    } catch {
      toast("บันทึกแล้ว แต่โหลดแผนที่ใหม่ไม่ได้ จะลองอีกครั้งใน 1 นาที")
    }
  })

  $("report-open").addEventListener("click", () => openForm("flooded"))
  $("arriving-open").addEventListener("click", () => openForm("arriving"))
  $("demo-toggle").addEventListener("click", () => {
    state.demo = !state.demo
    if (!state.demo && state.selected?.startsWith("demo:")) {
      state.selected = null
      closePopup()
    }
    mergeReports()
    render()
    syncFloodLayers()
    if (state.demo && map) map.flyTo(DEMO_VIEW)
  })
  $("report-close").addEventListener("click", () => dialog.close())
  $("scenario-toggle").addEventListener("click", async () => {
    state.scenarioOn = !state.scenarioOn
    if (state.scenarioOn) {
      try {
        await loadScenario()
      } catch {
        state.scenarioOn = false
        toast("โหลดสถานการณ์จำลองไม่ได้ ลองใหม่อีกครั้ง")
      }
    }
    closePopup()
    renderScenarioPanel()
    syncScenarioLayers()
    renderPins()
  })
  $("scenario-t").addEventListener("input", (e) => {
    state.t = Number(e.target.value)
    closePopup()
    renderScenarioPanel()
    syncScenarioLayers()
    renderPins()
  })
  window.addEventListener("hashchange", () => {
    const tab = L.tabFromHash(location.hash)
    if (tab === state.tab) return
    state.tab = tab
    state.selected = null
    closePopup()
    renderTab()
    render()
    renderScenarioPanel()
  })
  renderTab()

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
