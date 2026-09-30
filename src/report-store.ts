import type { Report } from "./reports.ts"

/** The only way the rest of the code reaches reports. Synchronous, so `handle` stays synchronous. */
export interface ReportStore {
  all(): readonly Report[]
  add(report: Report): void
}

export function createMemoryReportStore(): ReportStore {
  const reports: Report[] = []
  return {
    all: () => reports,
    add: (report) => {
      reports.push(report)
    }
  }
}
