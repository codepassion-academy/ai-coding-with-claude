import { describe, expect, it } from "vitest"
import { createRateLimiter } from "../src/rate-limit.ts"
import {
  createReportStore,
  DISPLAY_TTL_MS,
  LANDMARK_MAX,
  MAX_ACTIVE_REPORTS,
  maskPersonalData,
  normalizeLandmark,
  validateReportInput
} from "../src/reports.ts"

describe("normalizeLandmark (RPT-REQ-004)", () => {
  it("AC1: accepts exactly 80 code points and rejects 81", () => {
    expect(normalizeLandmark("ก".repeat(LANDMARK_MAX))).toBe("ก".repeat(LANDMARK_MAX))
    expect(normalizeLandmark("ก".repeat(LANDMARK_MAX + 1))).toBeUndefined()
  })

  it("AC1: counts code points, not UTF-16 units (80 emoji pass)", () => {
    expect(normalizeLandmark("🌊".repeat(LANDMARK_MAX))).toBe("🌊".repeat(LANDMARK_MAX))
  })

  it("AC1: rejects a single character after trimming, accepts two", () => {
    expect(normalizeLandmark("  ก  ")).toBeUndefined()
    expect(normalizeLandmark("กข")).toBe("กข")
  })

  it("AC2: rejects control characters", () => {
    for (const bad of ["ซอย\nลาดพร้าว", "ซอย\tลาดพร้าว", "ซอย\u0000ลาดพร้าว", "ซอย\u007fลาดพร้าว"]) {
      expect(normalizeLandmark(bad)).toBeUndefined()
    }
  })

  it("AC3: strips zero-width and other format characters", () => {
    expect(normalizeLandmark("ซอย\u200Bลาดพร้าว")).toBe("ซอยลาดพร้าว")
    expect(normalizeLandmark("\uFEFFซอยลาดพร้าว")).toBe("ซอยลาดพร้าว")
  })

  it("AC4: rejects whitespace only (including NBSP)", () => {
    expect(normalizeLandmark("     ")).toBeUndefined()
    expect(normalizeLandmark("\u00A0\u00A0\u00A0")).toBeUndefined()
  })

  it("trims and collapses repeated spaces", () => {
    expect(normalizeLandmark("  ปากซอย   ลาดพร้าว\u00A071 ")).toBe("ปากซอย ลาดพร้าว 71")
  })

  it("AC5: counts Thai by code point after NFKC (locked; note SARA AM splits into two)", () => {
    // "น้ำ" is 3 code points as typed; NFKC decomposes ำ (U+0E33) into ํ + า, giving 4.
    expect([...normalizeLandmark("น้ำท่วม")!].length).toBe(8)
    expect(normalizeLandmark("น้ำ".repeat(20))).toBeDefined() // 80 after NFKC
    expect(normalizeLandmark("น้ำ".repeat(20) + "ก")).toBeUndefined() // 81 after NFKC
    expect(normalizeLandmark("ที่ตั้ง".repeat(10))).toBeDefined() // 7 × 10 = 70
  })
})

const now = new Date("2026-09-30T12:30:00Z")

function validate(landmark: string) {
  return validateReportInput({ landmark, depth: "knee", seenAt: "2026-09-30T12:00:00Z" }, now)
}

describe("maskPersonalData (RPT-REQ-005)", () => {
  it("AC1: masks a dashed phone number, keeping the text around it", () => {
    expect(maskPersonalData("ตรงข้าม 081-234-5678")).toBe("ตรงข้าม ***")
  })

  it("AC2 / E1: masks phones with odd separators, Thai digits and +66", () => {
    expect(maskPersonalData("โทร 0812345678")).toBe("โทร ***")
    expect(maskPersonalData("โทร ๐๘๑๒๓๔๕๖๗๘")).toBe("โทร ***")
    expect(maskPersonalData("โทร +66 81 234 5678")).toBe("โทร ***")
    expect(maskPersonalData("โทร 081 234 5678")).toBe("โทร ***")
    expect(maskPersonalData("โทร 081.234.5678")).toBe("โทร ***")
    expect(maskPersonalData("โทร (081)2345678")).toBe("โทร ***")
    expect(maskPersonalData("โทร 081 - 234 - 5678 นะ")).toBe("โทร *** นะ")
  })

  it("AC3: leaves soi and road numbers alone", () => {
    expect(maskPersonalData("ซอยลาดพร้าว 71")).toBe("ซอยลาดพร้าว 71")
    expect(maskPersonalData("ซอย 12/3 ถนน 45")).toBe("ซอย 12/3 ถนน 45")
  })

  it("AC4: exactly 8 digits stay, 9 digits are masked (also with separators)", () => {
    expect(maskPersonalData("รหัส 12345678")).toBe("รหัส 12345678")
    expect(maskPersonalData("รหัส 123456789")).toBe("รหัส ***")
    expect(maskPersonalData("รหัส 0812-3456")).toBe("รหัส 0812-3456")
    expect(maskPersonalData("รหัส 081-234-567")).toBe("รหัส ***")
  })

  it("E2: 13-digit ID numbers are masked too (accepted false positive)", () => {
    expect(maskPersonalData("บัตร 1234567890123")).toBe("บัตร ***")
  })

  it("AC7 / E27: masks the house-number prefix and number together", () => {
    expect(maskPersonalData("บ้านเลขที่ 45/12 ซอยลาดพร้าว 71")).toBe("*** ซอยลาดพร้าว 71")
    expect(maskPersonalData("บ้าน 45/12 หน้าปากซอย")).toBe("*** หน้าปากซอย")
    expect(maskPersonalData("บ้าน 45-12 หน้าปากซอย")).toBe("*** หน้าปากซอย")
    expect(maskPersonalData("เลขที่ ๔๕")).toBe("***")
    expect(maskPersonalData("หน้าบ้านเลขที่45 ถนนใหญ่")).toBe("หน้า*** ถนนใหญ่")
  })

  it("AC8 / E28: a prefix with no number after it is left alone", () => {
    expect(maskPersonalData("บ้านสีฟ้าปากซอย")).toBe("บ้านสีฟ้าปากซอย")
    expect(maskPersonalData("เลขที่ก่อนถึงสะพาน")).toBe("เลขที่ก่อนถึงสะพาน")
  })

  it("AC9 / E29 known limitation: a house number with no prefix is NOT masked", () => {
    expect(maskPersonalData("45/12 ซอยลาดพร้าว")).toBe("45/12 ซอยลาดพร้าว")
    expect(maskPersonalData("no. 45 Soi 7")).toBe("no. 45 Soi 7")
  })

  it("E30: phones are masked before house numbers, so 'บ้าน' + a spaced phone leaves no digits", () => {
    expect(maskPersonalData("บ้าน 081 234 5678")).toBe("บ้าน ***")
    expect(maskPersonalData("บ้าน 081.234.5678")).toBe("บ้าน ***")
    expect(maskPersonalData("บ้านเลขที่ 45/12 โทร 081 234 5678")).toBe("*** โทร ***")
  })
})

describe("validateReportInput masking (RPT-REQ-005)", () => {
  it("AC1: the stored landmark is masked", () => {
    const result = createReportStore().submit(
      { landmark: "ตรงข้าม 081-234-5678", depth: "knee", seenAt: "2026-09-30T12:00:00Z" },
      "lat-phrao",
      "test",
      now
    )
    expect(result.ok && result.report.landmark).toBe("ตรงข้าม ***")
    expect(result.ok && result.report.landmarkKey).toBe("ตรงข้าม ***")
  })

  it("AC5 / E3: a landmark that is only a phone number is rejected", () => {
    for (const phone of ["081-234-5678", "081 234 5678", "(081)2345678", "+66 81 234 5678", "๐๘๑๒๓๔๕๖๗๘"]) {
      expect(validate(phone), phone).toEqual({ ok: false, status: 400, error: "landmark_invalid", field: "landmark" })
    }
  })

  it("AC7: a landmark that is only a house number is rejected", () => {
    expect(validate("เลขที่ ๔๕")).toMatchObject({ ok: false, error: "landmark_invalid", field: "landmark" })
  })

  it("E4: a zero-width char inside the phone does not dodge the mask", () => {
    expect(validate("ตรงข้าม 081\u200B2345678")).toMatchObject({ ok: true, landmark: "ตรงข้าม ***" })
  })

  it("AC6: random 9-13 digit phones embedded in text never leave 9+ digits", () => {
    // mulberry32: tiny seeded PRNG so failures are reproducible without a dependency.
    const seed = 20260930
    let state = seed
    const rand = () => {
      state = (state + 0x6d2b79f5) | 0
      let t = Math.imul(state ^ (state >>> 15), 1 | state)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T
    const asciiDigits = "0123456789"
    const thaiDigits = "๐๑๒๓๔๕๖๗๘๙"
    const separators = ["", "", " ", "-", ".", "(", ")", " - ", "..", "\u200B"]
    const around = ["", "โทร ", "ตรงข้าม ", "ซอย 7 ", "หน้าร้าน", " นะ", " ถนน 45", " ปากซอย"]

    for (let i = 0; i < 500; i++) {
      const length = 9 + Math.floor(rand() * 5)
      let phone = rand() < 0.3 ? pick(["+", "("]) : ""
      for (let d = 0; d < length; d++) {
        if (d > 0) phone += pick(separators)
        phone += pick([asciiDigits, thaiDigits])[Math.floor(rand() * 10)]
      }
      const input = pick(around) + phone + pick(around)
      const normalized = normalizeLandmark(input)
      if (normalized === undefined) continue
      const output = maskPersonalData(normalized)
      // Independent oracle: drop only the spec separator set, then look for 9+ digits in a row.
      const digitsOnly = output.replace(/[\s.\-()]/gu, "")
      expect(digitsOnly, `seed=${seed} i=${i} input=${JSON.stringify(input)} output=${JSON.stringify(output)}`).not.toMatch(
        /[0-9๐-๙]{9,}/u
      )
    }
  })
})

describe("dedupe in the store (RPT-REQ-010)", () => {
  const at = (iso: string) => ({ seenAt: iso })
  const t1 = "2026-09-30T12:00:00Z"
  const t2 = "2026-09-30T12:10:00Z"

  function submit(store: ReturnType<typeof createReportStore>, landmark: string, extra: object = {}, districtId = "lat-phrao") {
    return store.submit({ landmark, depth: "knee", seenAt: t1, ...extra }, districtId, "test", now)
  }

  it("AC1: the same report twice is one entry with confirmations 2, same id, merged=true", () => {
    const store = createReportStore()
    const first = submit(store, "ปากซอย ลาดพร้าว 71")
    const second = submit(store, "ปากซอย ลาดพร้าว 71")
    expect(first).toMatchObject({ ok: true, merged: false })
    expect(second).toMatchObject({ ok: true, merged: true, report: { confirmations: 2 } })
    expect(second.ok && first.ok && second.report.id).toBe(first.ok && first.report.id)
    expect(store.activeIn("lat-phrao", now)).toHaveLength(1)
    expect(store.size()).toBe(1)
  })

  it("AC2 / E9: extra spaces, trailing space and zero-width still merge", () => {
    const store = createReportStore()
    submit(store, "ปากซอย ลาดพร้าว 71")
    for (const variant of ["ปากซอย  ลาดพร้าว 71", "ปากซอย ลาดพร้าว 71 ", "ปากซอย​ ลาดพร้าว 71"]) {
      expect(submit(store, variant), variant).toMatchObject({ ok: true, merged: true })
    }
    expect(store.activeIn("lat-phrao", now)).toEqual([expect.objectContaining({ confirmations: 4 })])
  })

  it("AC3: English upper/lower case is the same landmark", () => {
    const store = createReportStore()
    submit(store, "Central Ladprao")
    expect(submit(store, "CENTRAL ladprao")).toMatchObject({ ok: true, merged: true })
    expect(store.size()).toBe(1)
  })

  it("AC3: the first wording is kept for display", () => {
    const store = createReportStore()
    submit(store, "Central Ladprao")
    submit(store, "CENTRAL ladprao")
    expect(store.activeIn("lat-phrao", now)[0]?.landmark).toBe("Central Ladprao")
  })

  it("AC4 / E10: the same text in another district does not merge", () => {
    const store = createReportStore()
    submit(store, "ปากซอย 7", {}, "lat-phrao")
    expect(submit(store, "ปากซอย 7", {}, "bang-kapi")).toMatchObject({ ok: true, merged: false })
    expect(store.activeIn("lat-phrao", now)).toHaveLength(1)
    expect(store.activeIn("bang-kapi", now)).toHaveLength(1)
  })

  it("E11 / A1: a newer report wins seenAt and depth", () => {
    const store = createReportStore()
    submit(store, "ปากซอย 7", { depth: "ankle", ...at(t1) })
    const merged = submit(store, "ปากซอย 7", { depth: "waist", ...at(t2) })
    expect(merged).toMatchObject({
      ok: true,
      merged: true,
      report: { depthLevel: "waist", depthCm: 100, seenAt: new Date(t2), confirmations: 2 }
    })
  })

  it("AC5: an older report only adds a confirmation", () => {
    const store = createReportStore()
    submit(store, "ปากซอย 7", { depth: "waist", ...at(t2) })
    const merged = submit(store, "ปากซอย 7", { depth: "ankle", ...at(t1) })
    expect(merged).toMatchObject({
      ok: true,
      merged: true,
      report: { depthLevel: "waist", depthCm: 100, seenAt: new Date(t2), confirmations: 2 }
    })
  })

  it("A1: the same seenAt is not newer, so depth stays", () => {
    const store = createReportStore()
    submit(store, "ปากซอย 7", { depth: "knee", ...at(t1) })
    const merged = submit(store, "ปากซอย 7", { depth: "waist", ...at(t1) })
    expect(merged).toMatchObject({ ok: true, merged: true, report: { depthLevel: "knee", confirmations: 2 } })
  })

  it("AC6: different phones in the same text merge, so the key is built after masking", () => {
    const store = createReportStore()
    submit(store, "หน้าร้าน 0811111111")
    const merged = submit(store, "หน้าร้าน 0822222222")
    expect(merged).toMatchObject({ ok: true, merged: true, report: { landmark: "หน้าร้าน ***", confirmations: 2 } })
    expect(JSON.stringify(store.activeIn("lat-phrao", now))).not.toMatch(/0811111111|0822222222/)
  })

  it("a rejected report does not touch an existing one", () => {
    const store = createReportStore()
    submit(store, "ปากซอย 7")
    expect(submit(store, "ปากซอย 7", { depth: "chest" })).toMatchObject({ ok: false })
    expect(store.activeIn("lat-phrao", now)[0]?.confirmations).toBe(1)
  })
})

describe("store capacity (RPT-REQ-014)", () => {
  const seenAt = "2026-09-30T12:00:00Z"
  const body = (landmark: string) => ({ landmark, depth: "knee", seenAt })

  /** A store with MAX_ACTIVE_REPORTS reports from many clients, so the fill itself is not rate-limited. */
  function fullStore() {
    const store = createReportStore(createRateLimiter())
    for (let i = 0; i < MAX_ACTIVE_REPORTS; i++) {
      const result = store.submit(body(`จุดที่ ${i}`), "lat-phrao", `filler-${i}`, now)
      if (!result.ok) throw new Error(`fill failed at ${i}`)
    }
    return store
  }

  it("MAX_ACTIVE_REPORTS is 1000 (spec §2)", () => {
    expect(MAX_ACTIVE_REPORTS).toBe(1000)
  })

  it("AC3 / E23: when full, a new report is 503 store_full and nothing is stored", () => {
    const store = fullStore()
    expect(store.submit(body("จุดใหม่"), "sai-mai", "someone", now)).toEqual({ ok: false, status: 503, error: "store_full" })
    expect(store.size()).toBe(MAX_ACTIVE_REPORTS)
  })

  it("AC3: when full, a duplicate still merges", () => {
    const store = fullStore()
    expect(store.submit(body("จุดที่ 7"), "lat-phrao", "someone", now)).toMatchObject({ ok: true, merged: true, report: { confirmations: 2 } })
  })

  it("AC4: 503 does not use up quota", () => {
    const store = fullStore()
    for (let i = 0; i < 10; i++) expect(store.submit(body(`ใหม่ ${i}`), "sai-mai", "k", now)).toMatchObject({ status: 503 })
    for (let i = 0; i < 5; i++) expect(store.submit(body(`จุดที่ ${i}`), "lat-phrao", "k", now)).toMatchObject({ ok: true, merged: true })
  })

  it("expired reports free their place (purge runs before the capacity check)", () => {
    const store = fullStore()
    const later = new Date(now.getTime() + DISPLAY_TTL_MS)
    expect(store.submit({ ...body("จุดใหม่"), seenAt: later.toISOString() }, "sai-mai", "someone", later)).toMatchObject({ ok: true, merged: false })
  })
})
