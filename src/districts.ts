export type District = {
  id: string
  nameTh: string
  nameEn: string
  /** กึ่งกลางเขต: a rough [lon, lat] of the district for placing หมุด. Never a reporter's location (RPT-REQ-013). */
  centre: [number, number]
}

/** A subset of Bangkok's 50 districts, enough for the class. */
export const districts: ReadonlyMap<string, District> = new Map(
  (
    [
      { id: "bang-kapi", nameTh: "บางกะปิ", nameEn: "Bang Kapi", centre: [100.645, 13.772] },
      { id: "bang-khen", nameTh: "บางเขน", nameEn: "Bang Khen", centre: [100.625, 13.865] },
      { id: "bang-na", nameTh: "บางนา", nameEn: "Bang Na", centre: [100.615, 13.668] },
      { id: "chatuchak", nameTh: "จตุจักร", nameEn: "Chatuchak", centre: [100.56, 13.83] },
      { id: "din-daeng", nameTh: "ดินแดง", nameEn: "Din Daeng", centre: [100.553, 13.775] },
      { id: "don-mueang", nameTh: "ดอนเมือง", nameEn: "Don Mueang", centre: [100.595, 13.915] },
      { id: "huai-khwang", nameTh: "ห้วยขวาง", nameEn: "Huai Khwang", centre: [100.585, 13.765] },
      { id: "khlong-toei", nameTh: "คลองเตย", nameEn: "Khlong Toei", centre: [100.565, 13.71] },
      { id: "lat-krabang", nameTh: "ลาดกระบัง", nameEn: "Lat Krabang", centre: [100.755, 13.74] },
      { id: "lat-phrao", nameTh: "ลาดพร้าว", nameEn: "Lat Phrao", centre: [100.61, 13.815] },
      { id: "pathum-wan", nameTh: "ปทุมวัน", nameEn: "Pathum Wan", centre: [100.53, 13.742] },
      { id: "sai-mai", nameTh: "สายไหม", nameEn: "Sai Mai", centre: [100.66, 13.905] }
    ] satisfies District[]
  ).map((d) => [d.id, d])
)
