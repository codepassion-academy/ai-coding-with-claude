import { describe, expect, it } from "vitest"
import { districts } from "../src/districts.ts"
import {
  landmarkKey,
  maskPhoneNumbers,
  PHONE_MASK,
  severityOf,
  validateReportInput,
  visibleItems,
  type Report
} from "../src/reports.ts"

const NOW = new Date("2026-09-30T12:30:00Z")

const validReport = {
  districtId: "sai-mai",
  landmark: "ปากซอยสายไหม 15",
  depthCm: 25,
  observedAt: "2026-09-30T12:20:00Z"
}

/** Validate the valid report with some fields replaced; `undefined` leaves the field out. */
function check(overrides: Record<string, unknown>) {
  const body: Record<string, unknown> = { ...validReport, ...overrides }
  for (const key of Object.keys(body)) if (body[key] === undefined) delete body[key]
  return validateReportInput(body, NOW)
}

function badFields(overrides: Record<string, unknown>): string[] {
  const result = check(overrides)
  return result.ok ? [] : result.fields
}

function storedObservedAt(observedAt: string): string | undefined {
  const result = check({ observedAt })
  return result.ok ? result.input.observedAt.toISOString() : undefined
}

describe("validateReportInput: districtId", () => {
  it.each(["atlantis", "สายไหม", 12, undefined])("RPT-REQ-002 AC1 AC2 AC3 rejects %j", (districtId) => {
    expect(badFields({ districtId })).toEqual(["districtId"])
  })

  it("RPT-REQ-002 AC4 accepts all 12 district ids", () => {
    for (const districtId of districts.keys()) expect(badFields({ districtId })).toEqual([])
    expect(districts.size).toBe(12)
  })
})

describe("validateReportInput: depthCm", () => {
  it.each([1, 300])("RPT-REQ-003 AC1 accepts %j", (depthCm) => {
    expect(badFields({ depthCm })).toEqual([])
  })

  it.each([0, 301, -5, 25.5, "25", null, true, undefined])("RPT-REQ-003 AC2 AC3 AC4 rejects %j", (depthCm) => {
    expect(badFields({ depthCm })).toEqual(["depthCm"])
  })
})

describe("validateReportInput: observedAt", () => {
  it("RPT-REQ-004 AC1 accepts exactly 6 hours ago", () => {
    expect(storedObservedAt("2026-09-30T06:30:00Z")).toBe("2026-09-30T06:30:00.000Z")
  })

  it("RPT-REQ-004 AC2 rejects one second older than 6 hours", () => {
    expect(badFields({ observedAt: "2026-09-30T06:29:59Z" })).toEqual(["observedAt"])
  })

  it("RPT-REQ-004 AC3 accepts exactly 2 minutes ahead and records server time", () => {
    expect(storedObservedAt("2026-09-30T12:32:00Z")).toBe("2026-09-30T12:30:00.000Z")
  })

  it("RPT-REQ-004 AC4 rejects more than 2 minutes ahead", () => {
    expect(badFields({ observedAt: "2026-09-30T12:32:01Z" })).toEqual(["observedAt"])
  })

  it("RPT-REQ-004 AC5 converts an offset time to UTC", () => {
    expect(storedObservedAt("2026-09-30T19:20:00+07:00")).toBe("2026-09-30T12:20:00.000Z")
  })

  it.each(["2026-09-30T12:20:00", "เมื่อกี้", 1759235400000, "2026-02-30T00:00:00Z", undefined])(
    "RPT-REQ-004 AC6 rejects %j",
    (observedAt) => {
      expect(badFields({ observedAt })).toEqual(["observedAt"])
    }
  )
})

function storedLandmark(landmark: unknown): string | undefined {
  const result = check({ landmark })
  return result.ok ? result.input.landmark : undefined
}

describe("validateReportInput: landmark", () => {
  it.each(["abc", "ก".repeat(100)])("RPT-REQ-005 AC1 accepts 3 and 100 characters", (landmark) => {
    expect(storedLandmark(landmark)).toBe(landmark)
  })

  it.each(["ก".repeat(101), "ab", "", "   "])("RPT-REQ-005 AC2 rejects %j", (landmark) => {
    expect(badFields({ landmark })).toEqual(["landmark"])
  })

  it("RPT-REQ-005 AC3 collapses whitespace and trims", () => {
    expect(storedLandmark("  ปากซอย \n สายไหม 15  ")).toBe("ปากซอย สายไหม 15")
  })

  it("RPT-REQ-005 normalizes to NFC", () => {
    expect(storedLandmark("café สายไหม")).toBe("café สายไหม")
  })

  it.each(["ปาก\u0000ซอย", "ปาก\u001bซอย"])("RPT-REQ-005 AC4 rejects control characters", (landmark) => {
    expect(badFields({ landmark })).toEqual(["landmark"])
  })

  it.each([15, { text: "ปากซอย" }, undefined])("RPT-REQ-005 AC5 rejects a non-string: %j", (landmark) => {
    expect(badFields({ landmark })).toEqual(["landmark"])
  })

  it("RPT-REQ-006 AC1 masks a phone number before the landmark leaves validation", () => {
    expect(storedLandmark("หน้าร้านป้าแดง โทร 081-234-5678")).toBe("หน้าร้านป้าแดง โทร [ปิดเบอร์โทร]")
  })

  it("RPT-REQ-006 AC4 rejects a landmark that is only a phone number", () => {
    expect(badFields({ landmark: "0812345678" })).toEqual(["landmark"])
    expect(badFields({ landmark: "ab 0812345678" })).toEqual(["landmark"])
  })

  it("RPT-REQ-006 AC6 checks the 100-character limit before masking", () => {
    const landmark = `${"ก".repeat(89)} 0812345678`
    expect([...landmark]).toHaveLength(100)
    expect(storedLandmark(landmark)).toBe(`${"ก".repeat(89)} ${PHONE_MASK}`)
  })
})

describe("maskPhoneNumbers", () => {
  it.each(["0812345678", "081 234 5678", "02-123-4567", "+66812345678", "๐๘๑๒๓๔๕๖๗๘", "081.234.5678"])(
    "RPT-REQ-006 AC2 masks %s",
    (phone) => {
      expect(maskPhoneNumbers(`โทร ${phone} ได้เลย`)).toBe(`โทร ${PHONE_MASK} ได้เลย`)
    }
  )

  it.each(["ซอยลาดพร้าว 101 หน้าเซเว่น", "สายไหม 15 แยก 3", "หมู่บ้าน 12345678"])("RPT-REQ-006 AC3 leaves %s alone", (text) => {
    expect(maskPhoneNumbers(text)).toBe(text)
  })
})

function report(overrides: Partial<Report> = {}): Report {
  return {
    id: "r-1",
    districtId: "sai-mai",
    landmark: "ปากซอยสายไหม 15",
    landmarkKey: "ปากซอยสายไหม15",
    depthCm: 25,
    observedAt: "2026-09-30T12:20:00.000Z",
    receivedAt: "2026-09-30T12:20:00.000Z",
    reporterHash: "a".repeat(64),
    hiddenAt: null,
    ...overrides
  }
}

const itemsAt = (iso: string, reports: Report[] = [report()]) => visibleItems(reports, "sai-mai", new Date(iso))

describe("visibleItems: age", () => {
  it("RPT-REQ-010 AC1 still shows a report one second before it turns 6 hours old", () => {
    expect(itemsAt("2026-09-30T18:19:59Z")).toMatchObject([{ minutesAgo: 359 }])
  })

  it("RPT-REQ-010 AC2 stops showing a report at exactly 6 hours", () => {
    expect(itemsAt("2026-09-30T18:20:00Z")).toEqual([])
  })

  it("RPT-REQ-010 AC3 rounds minutesAgo down to whole minutes", () => {
    expect(itemsAt("2026-09-30T12:20:59Z")).toMatchObject([{ minutesAgo: 0 }])
    expect(itemsAt("2026-09-30T12:21:00Z")).toMatchObject([{ minutesAgo: 1 }])
  })

  it("RPT-REQ-010 AC4 never gives a negative or fractional minutesAgo", () => {
    expect(itemsAt("2026-09-30T12:19:30Z")).toMatchObject([{ minutesAgo: 0 }])
  })

  it("RPT-REQ-009 AC6 lists the most recently seen report first", () => {
    const reports = [
      report({ id: "r-1", landmark: "จุด ก", landmarkKey: "จุดก", observedAt: "2026-09-30T11:00:00.000Z" }),
      report({ id: "r-2", landmark: "จุด ข", landmarkKey: "จุดข", observedAt: "2026-09-30T12:20:00.000Z" }),
      report({ id: "r-3", landmark: "จุด ค", landmarkKey: "จุดค", observedAt: "2026-09-30T11:40:00.000Z" })
    ]
    expect(itemsAt("2026-09-30T12:30:00Z", reports).map((item) => item.landmark)).toEqual(["จุด ข", "จุด ค", "จุด ก"])
  })
})

describe("landmarkKey", () => {
  it("RPT-REQ-011 AC5 ignores case, spaces and leading filler words", () => {
    expect(landmarkKey("หน้า Big C สายไหม")).toBe("bigcสายไหม")
    expect(landmarkKey("บริเวณหน้า big c สายไหม")).toBe("bigcสายไหม")
    expect(landmarkKey("BIG C สายไหม")).toBe("bigcสายไหม")
  })

  it("RPT-REQ-011 AC6 strips ตรง but keeps ตรงข้าม", () => {
    expect(landmarkKey("ตรงข้ามเซเว่น")).toBe("ตรงข้ามเซเว่น")
    expect(landmarkKey("ตรงเซเว่น")).toBe(landmarkKey("เซเว่น"))
    expect(landmarkKey("ตรงข้ามเซเว่น")).not.toBe(landmarkKey("เซเว่น"))
  })

  it("RPT-REQ-011 AC8 never strips a landmark down to nothing", () => {
    expect(landmarkKey("บริเวณ")).toBe("บริเวณ")
    expect(landmarkKey("บริเวณหน้า")).toBe("หน้า")
  })

  it("RPT-REQ-011 reads Thai digits as Arabic digits", () => {
    expect(landmarkKey("ปากซอยสายไหม ๑๕")).toBe(landmarkKey("ปากซอย สายไหม15"))
  })

  it.each(["แถว", "ใกล้"])("RPT-REQ-011 strips the prefix %s", (prefix) => {
    expect(landmarkKey(`${prefix}ตลาดสายไหม`)).toBe("ตลาดสายไหม")
  })
})

describe("validateReportInput: several fields", () => {
  it("RPT-REQ-005 AC6 lists every bad field", () => {
    expect(badFields({ districtId: "x", depthCm: 0 })).toEqual(["districtId", "depthCm"])
  })

  it("RPT-REQ-001 AC3 drops unknown fields", () => {
    const result = check({ phone: "0812345678", name: "สมชาย" })
    expect(result.ok && Object.keys(result.input).sort()).toEqual(["depthCm", "districtId", "landmark", "observedAt"])
  })
})

describe("severityOf", () => {
  it("RPT-REQ-012 AC1 rates 1 and 15 cm as low", () => {
    expect(severityOf(1)).toBe("low")
    expect(severityOf(15)).toBe("low")
  })

  it("RPT-REQ-012 AC2 rates 16 and 30 cm as medium", () => {
    expect(severityOf(16)).toBe("medium")
    expect(severityOf(30)).toBe("medium")
  })

  it("RPT-REQ-012 AC3 rates 31 and 300 cm as high", () => {
    expect(severityOf(31)).toBe("high")
    expect(severityOf(300)).toBe("high")
  })
})
