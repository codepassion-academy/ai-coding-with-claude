"use strict"

// Simulated flooding for demos and class, shown only when the page runs in demo mode (/?demo).
// Nothing here is real and nothing here is sent to the API. Every report carries a "ข้อมูลจำลอง" label.
;(() => {
  const LABEL = "ข้อมูลจำลอง ไม่ใช่รายงานจริง"
  const DEPTH_CM = { ankle: 10, knee: 50, waist: 100 }

  const report = (districtId, landmark, depthLevel, ageMinutes, confirmations, lngLat) => ({
    landmark,
    depthLevel,
    depthCm: DEPTH_CM[depthLevel],
    ageMinutes,
    confirmations,
    districtId,
    lngLat,
    label: LABEL
  })

  // Spots that often flood after heavy rain in the 12 districts this repo knows. Positions are
  // approximate and the whole scene is invented: a heavy evening downpour across the city.
  const reports = [
    // Bang Kapi: Ramkhamhaeng and the Khlong Chan flats, the widest water in this scene
    report("TH1006", "หน้ามหาวิทยาลัยรามคำแหง", "waist", 18, 14, [100.6182, 13.7563]),
    report("TH1006", "ถนนรามคำแหง หน้าราชมังคลากีฬาสถาน", "knee", 32, 6, [100.6235, 13.7552]),
    report("TH1006", "ปากซอยรามคำแหง 24", "knee", 47, 3, [100.6145, 13.7545]),
    report("TH1006", "แยกลำสาลี ถนนรามคำแหง", "knee", 26, 8, [100.636, 13.7585]),
    report("TH1006", "หน้าเดอะมอลล์บางกะปิ", "ankle", 12, 2, [100.6395, 13.7625]),
    report("TH1006", "ซอยรามคำแหง 53 ฝั่งตลาด", "ankle", 71, 1, [100.63, 13.761]),
    report("TH1006", "แฟลตคลองจั่น อาคาร 5 ชั้นล่าง", "waist", 9, 11, [100.6446, 13.7866]),
    report("TH1006", "ทางเข้าชุมชนแฟลตคลองจั่น", "waist", 22, 6, [100.642, 13.7852]),
    report("TH1006", "ถนนเสรีไทย หน้าแฟลตคลองจั่น", "knee", 41, 3, [100.6465, 13.7882]),
    report("TH1006", "ตลาดคลองจั่น", "ankle", 56, 2, [100.6385, 13.7812]),

    // Chatuchak: Ha Yaek Lat Phrao, Vibhavadi and Kaset
    report("TH1030", "ห้าแยกลาดพร้าว ใต้สะพานข้ามแยก", "waist", 14, 12, [100.5612, 13.8163]),
    report("TH1030", "ถนนวิภาวดีรังสิต ขาออก หน้าเซ็นทรัลลาดพร้าว", "knee", 27, 7, [100.5628, 13.8182]),
    report("TH1030", "แยกรัชโยธิน ถนนพหลโยธิน", "knee", 38, 4, [100.5736, 13.8285]),
    report("TH1030", "แยกเกษตร หน้ามหาวิทยาลัยเกษตรศาสตร์", "waist", 21, 9, [100.5706, 13.8468]),
    report("TH1030", "ถนนงามวงศ์วาน ประตูงามวงศ์วาน 1 เกษตร", "knee", 44, 3, [100.5672, 13.8492]),

    // Lat Phrao
    report("TH1038", "แยกโชคชัย 4 ถนนลาดพร้าว", "knee", 33, 5, [100.5935, 13.8132]),
    report("TH1038", "ถนนนาคนิวาส ปากซอยนาคนิวาส 6", "ankle", 95, 1, [100.6052, 13.8087]),
    report("TH1038", "ถนนประดิษฐ์มนูธรรม ใต้ทางด่วน", "ankle", 150, 2, [100.6068, 13.8205]),

    // Bang Khen, Sai Mai, Don Mueang: the north
    report("TH1005", "วงเวียนบางเขน หน้าวัดพระศรีมหาธาตุ", "knee", 29, 6, [100.5925, 13.8768]),
    report("TH1005", "ถนนรามอินทรา กม.2", "ankle", 64, 2, [100.6128, 13.8708]),
    report("TH1042", "ปากซอยสายไหม 56", "waist", 7, 10, [100.6718, 13.9148]),
    report("TH1042", "ถนนสายไหม หน้าตลาดวงศกร", "knee", 36, 5, [100.6605, 13.9128]),
    report("TH1042", "สะพานใหม่ ถนนพหลโยธิน ขาเข้า", "ankle", 118, 1, [100.6445, 13.8905]),
    report("TH1036", "ถนนวิภาวดีรังสิต หน้าท่าอากาศยานดอนเมือง", "knee", 52, 4, [100.5995, 13.9125]),
    report("TH1036", "ถนนช่างอากาศอุทิศ", "ankle", 205, 1, [100.5925, 13.9068]),

    // Din Daeng and Huai Khwang
    report("TH1026", "ถนนวิภาวดีรังสิต ใต้ทางด่วนดินแดง", "knee", 24, 6, [100.5588, 13.7718]),
    report("TH1026", "ถนนประชาสงเคราะห์ ปากซอย 1", "ankle", 83, 2, [100.5655, 13.7748]),
    report("TH1017", "แยกห้วยขวาง ถนนรัชดาภิเษก", "knee", 19, 7, [100.5745, 13.7772]),
    report("TH1017", "ถนนประชาราษฎร์บำเพ็ญ", "knee", 58, 3, [100.5785, 13.7736]),
    report("TH1017", "ถนนพระราม 9 หน้าเซ็นทรัลพระราม 9", "ankle", 132, 1, [100.5652, 13.7585]),

    // Pathum Wan and Khlong Toei: the centre
    report("TH1007", "สามย่าน ถนนพญาไท หน้าจุฬาฯ", "knee", 31, 5, [100.5292, 13.7338]),
    report("TH1007", "แยกราชประสงค์", "ankle", 49, 3, [100.5402, 13.7442]),
    report("TH1007", "ถนนบรรทัดทอง ช่วงสนามศุภชลาศัย", "ankle", 162, 1, [100.5238, 13.7408]),
    report("TH1033", "แยกอโศกมนตรี ถนนสุขุมวิท", "knee", 16, 9, [100.5606, 13.7372]),
    report("TH1033", "ถนนสุขุมวิท หน้าซอย 24", "ankle", 67, 2, [100.5693, 13.7318]),
    report("TH1033", "ถนนพระราม 4 หน้าตลาดคลองเตย", "knee", 39, 4, [100.5552, 13.7218]),

    // Bang Na and Lat Krabang: the east and south-east
    report("TH1047", "ซอยลาซาล สุขุมวิท 105", "knee", 34, 6, [100.6138, 13.6668]),
    report("TH1047", "ถนนบางนา-ตราด หน้าไบเทค", "ankle", 77, 2, [100.6108, 13.6692]),
    report("TH1047", "ปากซอยแบริ่ง", "knee", 91, 3, [100.6112, 13.6618]),
    report("TH1011", "ถนนฉลองกรุง หน้าสถาบันเทคโนโลยีพระจอมเกล้าเจ้าคุณทหารลาดกระบัง", "waist", 25, 8, [100.7722, 13.7318]),
    report("TH1011", "ถนนลาดกระบัง ปากซอยลาดกระบัง 7", "knee", 43, 4, [100.7545, 13.7255]),
    report("TH1011", "ถนนร่มเกล้า ช่วงตัดถนนเจ้าคุณทหาร", "knee", 61, 3, [100.7485, 13.7438]),
    report("TH1011", "ถนนหลวงแพ่ง", "ankle", 188, 1, [100.7785, 13.7432]),
    report("TH1011", "ชุมชนริมคลองประเวศบุรีรมย์", "ankle", 312, 1, [100.7655, 13.7208])
  ]

  // Each zone is a stack of nested, irregular rings: the outer ring is shallow, the inner ones deeper,
  // drifting toward the deepest spot. Depth bands are in cm like everything else in the app.
  const zone = (name, centre, deepest, radius, phase, depths) => ({
    zone: name,
    centre,
    deepest,
    radius,
    phase,
    bands: depths.map((cm, i) => [[1, 0.72, 0.5, 0.3, 0.18][i], cm])
  })
  const zones = [
    zone("ramkhamhaeng", [100.626, 13.7575], [100.6185, 13.7565], [0.021, 0.0095], [0.4, 1.9, 3.1], [10, 30, 50, 80]),
    zone("khlong-chan", [100.6435, 13.7858], [100.6445, 13.7866], [0.0115, 0.0082], [2.2, 0.7, 4.0], [10, 30, 50, 100]),
    zone("ha-yaek-lat-phrao", [100.5625, 13.8168], [100.5612, 13.8163], [0.0085, 0.0062], [1.1, 2.6, 0.3], [10, 30, 50, 80]),
    zone("kaset", [100.5708, 13.8472], [100.5706, 13.8468], [0.0072, 0.0058], [3.0, 1.2, 2.2], [10, 30, 50, 80]),
    zone("ratchayothin", [100.5736, 13.8285], [100.5736, 13.8285], [0.0038, 0.0034], [0.9, 2.0, 1.5], [10, 30]),
    zone("chok-chai-4", [100.5935, 13.8132], [100.5935, 13.8132], [0.0042, 0.0034], [1.8, 0.2, 2.9], [10, 30]),
    zone("bang-khen", [100.5925, 13.8768], [100.5925, 13.8768], [0.0048, 0.004], [2.6, 1.4, 0.6], [10, 30, 50]),
    zone("sai-mai", [100.6655, 13.9142], [100.6718, 13.9148], [0.0135, 0.0082], [0.2, 3.3, 1.7], [10, 30, 50, 80]),
    zone("don-mueang", [100.5992, 13.9118], [100.5995, 13.9125], [0.0055, 0.0072], [1.5, 0.8, 2.4], [10, 30, 50]),
    zone("din-daeng-huai-khwang", [100.5668, 13.7752], [100.5665, 13.7752], [0.0145, 0.0068], [2.1, 3.4, 0.9], [10, 30, 50]),
    zone("samyan", [100.5292, 13.7338], [100.5292, 13.7338], [0.0042, 0.0045], [0.7, 1.9, 3.0], [10, 30, 50]),
    zone("asok", [100.5618, 13.7362], [100.5606, 13.7372], [0.0068, 0.0048], [2.8, 0.5, 1.3], [10, 30, 50]),
    zone("khlong-toei-market", [100.5552, 13.7218], [100.5552, 13.7218], [0.0045, 0.0036], [1.2, 2.7, 0.4], [10, 30, 50]),
    zone("la-salle", [100.6125, 13.6655], [100.6135, 13.6665], [0.0072, 0.0068], [3.1, 1.6, 2.5], [10, 30, 50]),
    zone("lat-krabang", [100.7585, 13.7365], [100.7722, 13.7318], [0.029, 0.0165], [0.6, 2.3, 3.6], [10, 30, 50, 80])
  ]

  function ring(zone, scale) {
    const [cx, cy] = zone.centre
    const [dx, dy] = zone.deepest
    const shift = 1 - scale
    const x0 = cx + (dx - cx) * shift
    const y0 = cy + (dy - cy) * shift
    const [p1, p2, p3] = zone.phase
    const points = []
    for (let i = 0; i < 72; i++) {
      const t = (i / 72) * Math.PI * 2
      const wobble = 1 + 0.16 * Math.sin(3 * t + p1) + 0.08 * Math.sin(5 * t + p2) + 0.05 * Math.sin(7 * t + p3)
      points.push([x0 + Math.cos(t) * zone.radius[0] * scale * wobble, y0 + Math.sin(t) * zone.radius[1] * scale * wobble])
    }
    points.push(points[0])
    return points
  }

  /** GeoJSON bands, shallow first, so deeper rings draw on top. */
  function floodAreas() {
    const features = []
    for (const zone of zones) {
      for (const [scale, depthCm] of zone.bands) {
        features.push({
          type: "Feature",
          properties: { zone: zone.zone, depthCm },
          geometry: { type: "Polygon", coordinates: [ring(zone, scale)] }
        })
      }
    }
    return { type: "FeatureCollection", features }
  }

  window.NAMTUAM_DEMO = { label: LABEL, reports, floodAreas }
})()
