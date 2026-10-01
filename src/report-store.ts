import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { REPORTER_HASH_TTL_MS, type Report } from "./reports.ts"

/** The only way the rest of the code reaches reports. Synchronous, so `handle` stays synchronous. */
export interface ReportStore {
  all(): readonly Report[]
  add(report: Report): void
  /** Hide (an ISO time) or unhide (null) one report. The report is replaced, never mutated. Unknown id: undefined. */
  setHidden(id: string, hiddenAt: string | null): Report | undefined
  /** Set reporterHash to null on reports received 24 hours ago or more (RPT-REQ-008). Returns how many changed. */
  purgeReporterHashes(now: Date): number
}

type StoreFile = { version: 1; reports: Report[] }

const isExpired = (r: Report, now: Date) =>
  r.reporterHash !== null && new Date(r.receivedAt).getTime() <= now.getTime() - REPORTER_HASH_TTL_MS

const withoutHash = (r: Report): Report => ({ ...r, reporterHash: null })

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
    },
    purgeReporterHashes: (now) => {
      let purged = 0
      reports.forEach((r, index) => {
        if (!isExpired(r, now)) return
        reports[index] = withoutHash(r)
        purged++
      })
      return purged
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
    },
    purgeReporterHashes: (now) => {
      const purged = reports.filter((r) => isExpired(r, now)).length
      if (purged > 0) save(reports.map((r) => (isExpired(r, now) ? withoutHash(r) : r)))
      return purged
    }
  }
}
