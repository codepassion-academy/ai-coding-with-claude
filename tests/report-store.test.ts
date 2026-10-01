import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createFileReportStore, createMemoryReportStore, type ReportStore } from "../src/report-store.ts"
import type { Report } from "../src/reports.ts"

function report(overrides: Partial<Report> = {}): Report {
  return {
    id: "r-1",
    districtId: "sai-mai",
    landmark: "ปากซอยสายไหม 15",
    landmarkKey: "ปากซอยสายไหม15",
    depthCm: 25,
    observedAt: "2026-09-30T12:20:00.000Z",
    receivedAt: "2026-09-30T12:30:00.000Z",
    reporterHash: "a".repeat(64),
    hiddenAt: null,
    ...overrides
  }
}

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "flood-reports-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const stores: [string, () => ReportStore][] = [
  ["memory store", () => createMemoryReportStore()],
  ["file store", () => createFileReportStore(join(dir, "reports.json"))]
]

describe.each(stores)("ReportStore contract: %s", (_name, create) => {
  it("RPT-REQ-015 AC1 starts empty", () => {
    expect(create().all()).toEqual([])
  })

  it("RPT-REQ-013 AC1 sets hiddenAt on one report, leaves the others alone and returns the updated report", () => {
    const store = create()
    store.add(report({ id: "r-1" }))
    store.add(report({ id: "r-2" }))
    const hiddenAt = "2026-09-30T12:40:00.000Z"
    expect(store.setHidden("r-1", hiddenAt)).toEqual(report({ id: "r-1", hiddenAt }))
    expect(store.all()).toEqual([report({ id: "r-1", hiddenAt }), report({ id: "r-2" })])
  })

  it("RPT-REQ-013 AC3 clears hiddenAt again with null", () => {
    const store = create()
    store.add(report({ id: "r-1", hiddenAt: "2026-09-30T12:40:00.000Z" }))
    expect(store.setHidden("r-1", null)).toEqual(report({ id: "r-1", hiddenAt: null }))
    expect(store.all()).toEqual([report({ id: "r-1" })])
  })

  it("RPT-REQ-013 AC5 returns undefined and changes nothing for an unknown id", () => {
    const store = create()
    store.add(report({ id: "r-1" }))
    expect(store.setHidden("nope", "2026-09-30T12:40:00.000Z")).toBeUndefined()
    expect(store.all()).toEqual([report({ id: "r-1" })])
  })

  it("RPT-REQ-013 AC1 never deletes: hiding keeps the number of reports", () => {
    const store = create()
    store.add(report({ id: "r-1" }))
    store.setHidden("r-1", "2026-09-30T12:40:00.000Z")
    expect(store.all()).toHaveLength(1)
  })

  it("RPT-REQ-015 AC1 does not change a report object that was handed out earlier", () => {
    const store = create()
    store.add(report({ id: "r-1" }))
    const before = store.all()[0]
    store.setHidden("r-1", "2026-09-30T12:40:00.000Z")
    expect(before?.hiddenAt).toBeNull()
  })

  it("RPT-REQ-015 AC1 returns added reports in the order they were added", () => {
    const store = create()
    store.add(report({ id: "r-1" }))
    store.add(report({ id: "r-2", depthCm: 40 }))
    expect(store.all()).toEqual([report({ id: "r-1" }), report({ id: "r-2", depthCm: 40 })])
  })
})

describe("file store", () => {
  it("RPT-REQ-015 AC2 reads back every field after reopening the same path", () => {
    const path = join(dir, "reports.json")
    createFileReportStore(path).add(report())
    expect(createFileReportStore(path).all()).toEqual([report()])
  })

  it("RPT-REQ-015 AC3 starts empty when the file is missing and creates the folder on first write", () => {
    const path = join(dir, "nested", "var", "reports.json")
    const store = createFileReportStore(path)
    expect(store.all()).toEqual([])
    expect(existsSync(path)).toBe(false)
    store.add(report())
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ version: 1, reports: [report()] })
  })
})

describe("file store: hiding", () => {
  it("RPT-REQ-013 AC1 keeps hiddenAt after reopening the same path", () => {
    const path = join(dir, "reports.json")
    const store = createFileReportStore(path)
    store.add(report())
    store.setHidden("r-1", "2026-09-30T12:40:00.000Z")
    expect(createFileReportStore(path).all()).toEqual([report({ hiddenAt: "2026-09-30T12:40:00.000Z" })])
  })

  it("RPT-REQ-013 AC5 does not rewrite the file for an unknown id", () => {
    const path = join(dir, "reports.json")
    const store = createFileReportStore(path)
    store.add(report())
    const before = readFileSync(path, "utf8")
    store.setHidden("nope", "2026-09-30T12:40:00.000Z")
    expect(readFileSync(path, "utf8")).toBe(before)
  })
})

describe("repository layout", () => {
  const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8")

  it("RPT-REQ-015 AC6 keeps src/app.ts free of node:fs", () => {
    expect(read("../src/app.ts")).not.toMatch(/["'](node:)?fs["']/)
  })

  it("RPT-REQ-015 AC7 ignores var/ in git", () => {
    expect(read("../.gitignore").split(/\r?\n/)).toContain("var/")
  })
})
