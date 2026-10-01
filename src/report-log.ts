/** Where log lines go. Injected, so `handle` stays free of console and files (RPT-REQ-017). */
export type LogFn = (event: string, fields: Record<string, unknown>) => void

/**
 * The only field names a log line may carry. Everything the reports feature logs goes through
 * `createReportLog`, so a line cannot hold a landmark, a body, an address, a hash or a token.
 */
export const LOG_FIELD_NAMES = ["id", "districtId", "status", "reason", "fields"] as const

export type ReportLog = {
  accepted(id: string, districtId: string): void
  /** `fields` are the names of the bad fields, never their values. */
  rejectedValidation(fields: readonly string[]): void
  rejectedRateLimit(): void
  hidden(id: string, districtId: string): void
  unhidden(id: string, districtId: string): void
  /** A request that failed the token check. Carries the status only: no token, header, address or hash. */
  adminAuthFailed(): void
}

export function createReportLog(log: LogFn | undefined): ReportLog {
  const emit = (event: string, fields: Partial<Record<(typeof LOG_FIELD_NAMES)[number], unknown>>) => log?.(event, fields)
  return {
    accepted: (id, districtId) => emit("report.accepted", { id, districtId, status: 201 }),
    rejectedValidation: (fields) => emit("report.rejected", { reason: "validation", status: 400, fields: [...fields] }),
    rejectedRateLimit: () => emit("report.rejected", { reason: "rate_limit", status: 429 }),
    hidden: (id, districtId) => emit("report.hidden", { id, districtId, status: 200 }),
    unhidden: (id, districtId) => emit("report.unhidden", { id, districtId, status: 200 }),
    adminAuthFailed: () => emit("admin.auth_failed", { status: 401 })
  }
}
