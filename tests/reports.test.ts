import { describe, expect, it } from "vitest"
import { districts } from "../src/districts.ts"
import { severityOf, validateReportInput } from "../src/reports.ts"

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
