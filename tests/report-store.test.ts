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

describe("repository layout", () => {
  const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8")

  it("RPT-REQ-015 AC6 keeps src/app.ts free of node:fs", () => {
    expect(read("../src/app.ts")).not.toMatch(/["'](node:)?fs["']/)
  })

  it("RPT-REQ-015 AC7 ignores var/ in git", () => {
    expect(read("../.gitignore").split(/\r?\n/)).toContain("var/")
  })
})
