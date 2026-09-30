import { describe, expect, it } from "vitest"
import { severityOf } from "../src/reports.ts"

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
