import { describe, expect, it } from "vitest"
import { createReportStore, LANDMARK_MAX, maskPersonalData, normalizeLandmark, validateReportInput } from "../src/reports.ts"

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

  it("known limitation: house rule runs first, so 'บ้าน' + spaced phone leaves the last 7 digits", () => {
    // Spec order is house number, then phone. "บ้าน 081" is eaten as a house number and the
    // remaining "234 5678" is under 9 digits. Pinned so the trade-off is visible (flagged to Save).
    expect(maskPersonalData("บ้าน 081 234 5678")).toBe("*** 234 5678")
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
