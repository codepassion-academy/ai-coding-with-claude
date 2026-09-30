import { districts } from "./districts.ts"
import { parseIsoInstant, toBangkokIso } from "./time.ts"

export type Report = {
  id: string
  districtId: string
  landmark: string
  landmarkKey: string
  depthCm: number
  observedAt: string // UTC ISO
  receivedAt: string // UTC ISO
  reporterHash: string | null
  hiddenAt: string | null
}

export type Severity = "low" | "medium" | "high"

export type ReportItem = {
  landmark: string
  depthCm: number
  severity: Severity
  observedAt: string // Bangkok time
  minutesAgo: number
  reporterCount: number
}

export type ReportInput = { districtId: string; landmark: string; depthCm: number; observedAt: Date }

export type Validation = { ok: true; input: ReportInput } | { ok: false; fields: string[] }

export const REPORT_LABEL = "รายงานจากประชาชน ยังไม่ยืนยัน ไม่ใช่ประกาศเตือนภัยทางการ"

export const REPORT_TTL_MS = 6 * 60 * 60 * 1000
export const FUTURE_TOLERANCE_MS = 2 * 60 * 1000
export const DEPTH_MIN_CM = 1
export const DEPTH_MAX_CM = 300

/** Provisional thresholds (RPT-REQ-012): each level covers depths up to and including maxCm. */
export const SEVERITY_THRESHOLDS: readonly { severity: Severity; maxCm: number }[] = [
  { severity: "low", maxCm: 15 },
  { severity: "medium", maxCm: 30 },
  { severity: "high", maxCm: 300 }
]

/** Severity is derived from depth on every response and never stored, so thresholds can change. */
export function severityOf(depthCm: number): Severity {
  return SEVERITY_THRESHOLDS.find((t) => depthCm <= t.maxCm)?.severity ?? "high"
}

/** The reports of one district as the public sees them. Computed on every response, never stored. */
export function visibleItems(reports: readonly Report[], districtId: string, now: Date): ReportItem[] {
  return reports
    .filter((r) => r.districtId === districtId && r.hiddenAt === null)
    .map((r) => {
      const observedAt = new Date(r.observedAt)
      return {
        landmark: r.landmark,
        depthCm: r.depthCm,
        severity: severityOf(r.depthCm),
        observedAt: toBangkokIso(observedAt),
        minutesAgo: Math.floor((now.getTime() - observedAt.getTime()) / 60_000),
        reporterCount: 1
      }
    })
}

/** Check a POST /reports body. On failure, lists the names of the bad fields, never their values. */
export function validateReportInput(body: unknown, now: Date): Validation {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, fields: ["body"] }
  const raw = body as Record<string, unknown>
  const districtId = typeof raw.districtId === "string" && districts.has(raw.districtId) ? raw.districtId : undefined
  const landmark = typeof raw.landmark === "string" ? raw.landmark : undefined
  const depthCm = isDepthCm(raw.depthCm) ? raw.depthCm : undefined
  const observedAt = checkObservedAt(raw.observedAt, now)

  if (districtId === undefined || landmark === undefined || depthCm === undefined || observedAt === undefined) {
    const checks = { districtId, landmark, depthCm, observedAt }
    const fields = Object.entries(checks).flatMap(([name, value]) => (value === undefined ? [name] : []))
    return { ok: false, fields }
  }
  return { ok: true, input: { districtId, landmark, depthCm, observedAt } }
}

/** An integer JSON number in range. No rounding and no conversion from strings. */
function isDepthCm(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= DEPTH_MIN_CM && value <= DEPTH_MAX_CM
}

/** The time to record: within the last 6 hours, or up to 2 minutes ahead (recorded as server time). */
function checkObservedAt(value: unknown, now: Date): Date | undefined {
  const observed = typeof value === "string" ? parseIsoInstant(value) : undefined
  if (!observed) return undefined
  const aheadMs = observed.getTime() - now.getTime()
  if (aheadMs > FUTURE_TOLERANCE_MS || -aheadMs > REPORT_TTL_MS) return undefined
  return aheadMs > 0 ? now : observed
}
