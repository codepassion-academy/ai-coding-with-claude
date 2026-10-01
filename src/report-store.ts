import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import type { Report } from "./reports.ts"

/** The only way the rest of the code reaches reports. Synchronous, so `handle` stays synchronous. */
export interface ReportStore {
  all(): readonly Report[]
  add(report: Report): void
  /** Hide (an ISO time) or unhide (null) one report. The report is replaced, never mutated. Unknown id: undefined. */
  setHidden(id: string, hiddenAt: string | null): Report | undefined
}

type StoreFile = { version: 1; reports: Report[] }

export function createMemoryReportStore(): ReportStore {
  const reports: Report[] = []
  return {
    all: () => reports,
    add: (report) => {
      reports.push(report)
    },
    setHidden: (id, hiddenAt) => {
      const index = reports.findIndex((r) => r.id === id)
      const current = reports[index]
      if (!current) return undefined
      const updated = { ...current, hiddenAt }
      reports[index] = updated
      return updated
    }
  }
}

/** Reports in one JSON file: loaded once, then rewritten whole on every change (temp file, then rename). */
export function createFileReportStore(path: string): ReportStore {
  let reports: Report[] = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as StoreFile).reports : []

  // The in-memory copy changes only after the file is safely in place.
  function save(next: Report[]): void {
    const file: StoreFile = { version: 1, reports: next }
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(`${path}.tmp`, JSON.stringify(file, null, 2))
    renameSync(`${path}.tmp`, path)
    reports = next
  }

  return {
    all: () => reports,
    add: (report) => save([...reports, report]),
    setHidden: (id, hiddenAt) => {
      const current = reports.find((r) => r.id === id)
      if (!current) return undefined
      const updated = { ...current, hiddenAt }
      save(reports.map((r) => (r === current ? updated : r)))
      return updated
    }
  }
}
