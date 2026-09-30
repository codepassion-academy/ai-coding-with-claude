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

export type RateLimitStatus = { limited: false } | { limited: true; retryAfterSeconds: number }

export const REPORT_LABEL = "รายงานจากประชาชน ยังไม่ยืนยัน ไม่ใช่ประกาศเตือนภัยทางการ"

export const REPORT_TTL_MS = 6 * 60 * 60 * 1000
export const FUTURE_TOLERANCE_MS = 2 * 60 * 1000
export const DEPTH_MIN_CM = 1
export const DEPTH_MAX_CM = 300
export const LANDMARK_MIN = 3 // code points
export const LANDMARK_MAX = 100
export const PHONE_MASK = "[ปิดเบอร์โทร]"
export const RATE_LIMIT_MAX = 5
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000

// Arabic or Thai digits, at most one separator between digits, optional leading +.
const PHONE_NUMBER = /\+?[0-9๐-๙](?:[ .-]?[0-9๐-๙]){8,}/g

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

/** Whether a reporter has used up the quota of accepted reports in the sliding window (RPT-REQ-007). */
export function rateLimitStatus(reports: readonly Report[], reporterHash: string, now: Date): RateLimitStatus {
  const windowStart = now.getTime() - RATE_LIMIT_WINDOW_MS
  const received = reports
    .filter((r) => r.reporterHash === reporterHash)
    .map((r) => new Date(r.receivedAt).getTime())
    .filter((receivedAt) => receivedAt > windowStart)
  if (received.length < RATE_LIMIT_MAX) return { limited: false }
  const oldestLeavesAt = Math.min(...received) + RATE_LIMIT_WINDOW_MS
  return { limited: true, retryAfterSeconds: Math.ceil((oldestLeavesAt - now.getTime()) / 1000) }
}

/** Check a POST /reports body. On failure, lists the names of the bad fields, never their values. */
export function validateReportInput(body: unknown, now: Date): Validation {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, fields: ["body"] }
  const raw = body as Record<string, unknown>
  const districtId = typeof raw.districtId === "string" && districts.has(raw.districtId) ? raw.districtId : undefined
  const landmark = cleanLandmark(raw.landmark)
  const depthCm = isDepthCm(raw.depthCm) ? raw.depthCm : undefined
  const observedAt = checkObservedAt(raw.observedAt, now)

  if (districtId === undefined || landmark === undefined || depthCm === undefined || observedAt === undefined) {
    const checks = { districtId, landmark, depthCm, observedAt }
    const fields = Object.entries(checks).flatMap(([name, value]) => (value === undefined ? [name] : []))
    return { ok: false, fields }
  }
  return { ok: true, input: { districtId, landmark, depthCm, observedAt } }
}

/** Replace every run of 9 or more digits, the shape of a phone number, with PHONE_MASK. */
export function maskPhoneNumbers(text: string): string {
  return text.replace(PHONE_NUMBER, PHONE_MASK)
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

/** The landmark as it may be stored: tidied and with phone numbers masked. The raw text goes no further. */
function cleanLandmark(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const text = collapseWhitespace(value.normalize("NFC"))
  const length = [...text].length
  if (length < LANDMARK_MIN || length > LANDMARK_MAX || /\p{Cc}/u.test(text)) return undefined
  const masked = maskPhoneNumbers(text)
  const unmasked = collapseWhitespace(masked.replaceAll(PHONE_MASK, ""))
  return [...unmasked].length < LANDMARK_MIN ? undefined : masked
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
