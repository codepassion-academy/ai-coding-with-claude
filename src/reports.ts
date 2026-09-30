import { randomUUID } from "node:crypto"
import { createRateLimiter, type RateLimiter } from "./rate-limit.ts"
import { toBangkokIso } from "./time.ts"

export type DepthLevel = "ankle" | "knee" | "waist"
export const DEPTH_CM: Record<DepthLevel, number> = { ankle: 10, knee: 50, waist: 100 }

export const USER_REPORT_LABEL = "ผู้ใช้รายงาน ยังไม่ยืนยัน"

export const MAX_BACKDATE_MS = 3 * 60 * 60 * 1000
export const DISPLAY_TTL_MS = 6 * 60 * 60 * 1000
export const MAX_BODY_BYTES = 2048
export const MAX_ACTIVE_REPORTS = 1000
export const LANDMARK_MIN = 2
export const LANDMARK_MAX = 80

// Rate limit constants live in rate-limit.ts to avoid an import cycle; re-exported so spec §2 names resolve here.
export { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from "./rate-limit.ts"

/** Kept in memory only. No IP, user agent, name, phone or coordinates (RPT-REQ-013). */
export type Report = {
  id: string
  districtId: string
  landmark: string
  landmarkKey: string
  depthLevel: DepthLevel
  depthCm: number
  seenAt: Date
  confirmations: number
}

export type PublicReport = {
  id: string
  source: "user-report"
  verified: false
  label: string
  landmark: string
  depthLevel: DepthLevel
  depthCm: number
  seenAt: string
  ageMinutes: number
  ageLabel: string
  confirmations: number
}

export type SubmitResult =
  | { ok: true; merged: boolean; report: Report }
  | { ok: false; status: 400 | 429 | 503; error: string; field?: string; retryAfterSec?: number }

export type ReportStore = {
  submit(input: unknown, districtId: string, clientKey: string, now: Date): SubmitResult
  activeIn(districtId: string, now: Date): Report[]
  size(): number
}

const FIELDS: readonly string[] = ["landmark", "depth", "seenAt"]

/** Nothing but mask stars and spaces left after masking (RPT-REQ-005). */
const ONLY_MASK = /^[*\s]*$/u

type Invalid = { ok: false; status: 400; error: string; field?: string }
type ValidInput = { ok: true; landmark: string; depthLevel: DepthLevel; seenAt: Date }

function invalid(error: string, field?: string): Invalid {
  return field ? { ok: false, status: 400, error, field } : { ok: false, status: 400, error }
}

function isDepthLevel(value: unknown): value is DepthLevel {
  return typeof value === "string" && Object.hasOwn(DEPTH_CM, value)
}

/**
 * Clean up a landmark (RPT-REQ-004): NFKC, reject control chars, drop format chars
 * (zero-width etc.), collapse whitespace, then check length in code points.
 * Returns undefined when the landmark is not acceptable.
 */
export function normalizeLandmark(raw: string): string | undefined {
  const nfkc = raw.normalize("NFKC")
  if (/\p{Cc}/u.test(nfkc)) return undefined
  const text = nfkc.replace(/\p{Cf}/gu, "").replace(/\s+/gu, " ").trim()
  const length = [...text].length
  return length >= LANDMARK_MIN && length <= LANDMARK_MAX ? text : undefined
}

/** Prefix + house number such as `บ้านเลขที่ 45/12`, `เลขที่ ๔๕`, `บ้าน 45-12`. */
const HOUSE_NUMBER = /(?:บ้านเลขที่|เลขที่|บ้าน)\s*[0-9๐-๙]+(?:[/-][0-9๐-๙]+)*/gu

/**
 * 9+ digits (ASCII or Thai) with any run of space - . ( ) between them, plus a leading + or (.
 * Separators and digits never overlap, so each repetition has one way to match (no ReDoS).
 */
const PHONE_NUMBER = /[+(]?[0-9๐-๙](?:[\s.\-()]*[0-9๐-๙]){8,}/gu

/**
 * Mask house numbers, then phone numbers, with *** (RPT-REQ-005). Aggressive on purpose:
 * a false positive is better than a phone number getting stored. Expects normalized text.
 */
export function maskPersonalData(text: string): string {
  return text.replace(HOUSE_NUMBER, "***").replace(PHONE_NUMBER, "***")
}

const ISO_WITH_OFFSET = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(?:Z|([+-])(\d{2}):(\d{2}))$/

/** Strict ISO 8601 that must carry Z or ±HH:MM, and the calendar date must exist (RPT-REQ-007). */
export function parseIsoWithOffset(raw: string): Date | undefined {
  const m = ISO_WITH_OFFSET.exec(raw)
  if (!m) return undefined
  const n = (i: number) => Number(m[i] ?? "0")
  const [year, month, day, hour, minute, second] = [n(1), n(2), n(3), n(4), n(5), n(6)]
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) return undefined
  if (hour > 23 || minute > 59 || second > 59) return undefined
  const offsetHours = n(9)
  const offsetMinutes = n(10)
  if (offsetHours > 14 || offsetMinutes > 59) return undefined
  const ms = Number((m[7] ?? "").padEnd(3, "0"))
  const offsetMs = (m[8] === "-" ? -1 : 1) * (offsetHours * 60 + offsetMinutes) * 60 * 1000
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms) - offsetMs)
}

/** Validate the whole body at the boundary (RPT-REQ-003..007). Never echoes the input back. */
export function validateReportInput(input: unknown, now: Date): ValidInput | Invalid {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return invalid("invalid_body")
  const proto = Object.getPrototypeOf(input)
  if (proto !== Object.prototype && proto !== null) return invalid("invalid_body")
  if (Object.keys(input).some((k) => !FIELDS.includes(k))) return invalid("unknown_field")

  const field = (name: string): unknown => (Object.hasOwn(input, name) ? (input as Record<string, unknown>)[name] : undefined)
  const rawLandmark = field("landmark")
  const depth = field("depth")
  const rawSeenAt = field("seenAt")

  const normalized = typeof rawLandmark === "string" ? normalizeLandmark(rawLandmark) : undefined
  const landmark = normalized === undefined ? undefined : maskPersonalData(normalized)
  if (landmark === undefined || ONLY_MASK.test(landmark)) return invalid("landmark_invalid", "landmark")
  if (!isDepthLevel(depth)) return invalid("depth_invalid", "depth")

  const seenAt = typeof rawSeenAt === "string" ? parseIsoWithOffset(rawSeenAt) : undefined
  if (!seenAt) return invalid("seen_at_invalid", "seenAt")
  if (seenAt.getTime() > now.getTime()) return invalid("seen_at_future", "seenAt")
  if (seenAt.getTime() < now.getTime() - MAX_BACKDATE_MS) return invalid("seen_at_too_old", "seenAt")

  return { ok: true, landmark, depthLevel: depth, seenAt }
}

/** Dedupe key (RPT-REQ-010). `landmarkKey` comes from the masked landmark, so phones never reach it. */
function dedupeKey(districtId: string, landmarkKey: string): string {
  return districtId + "\u0000" + landmarkKey
}

/** Each store gets its own limiter unless one is passed in, so tests never share quota (RPT-REQ-017 AC4). */
export function createReportStore(limiter: RateLimiter = createRateLimiter()): ReportStore {
  const reports = new Map<string, Report>()

  /** Lazy purge on every POST and GET (RPT-REQ-012): expired reports leave memory, no timer. */
  function purge(now: Date): void {
    for (const [key, report] of reports) {
      if (now.getTime() - report.seenAt.getTime() >= DISPLAY_TTL_MS) reports.delete(key)
    }
    limiter.prune(now)
  }

  return {
    submit(input, districtId, clientKey, now) {
      purge(now)
      // Quota before validation (RPT-REQ-008). Only accepted reports are recorded (A2).
      const quota = limiter.check(clientKey, now)
      if (!quota.allowed) return { ok: false, status: 429, error: "rate_limited", retryAfterSec: quota.retryAfterSec }

      const valid = validateReportInput(input, now)
      if (!valid.ok) return valid

      const landmarkKey = valid.landmark.toLowerCase()
      const key = dedupeKey(districtId, landmarkKey)
      const existing = reports.get(key)
      if (existing) {
        existing.confirmations += 1
        // A1: newer wins. An older or same-time report only adds a confirmation.
        if (valid.seenAt.getTime() > existing.seenAt.getTime()) {
          existing.seenAt = valid.seenAt
          existing.depthLevel = valid.depthLevel
          existing.depthCm = DEPTH_CM[valid.depthLevel]
        }
        limiter.record(clientKey, now)
        return { ok: true, merged: true, report: existing }
      }

      // Only a brand-new report needs room; merges above still work when full (RPT-REQ-014).
      if (reports.size >= MAX_ACTIVE_REPORTS) return { ok: false, status: 503, error: "store_full" }

      const report: Report = {
        id: randomUUID(),
        districtId,
        landmark: valid.landmark,
        landmarkKey,
        depthLevel: valid.depthLevel,
        depthCm: DEPTH_CM[valid.depthLevel],
        seenAt: valid.seenAt,
        confirmations: 1
      }
      reports.set(key, report)
      limiter.record(clientKey, now)
      return { ok: true, merged: false, report }
    },
    activeIn(districtId, now) {
      purge(now)
      return [...reports.values()]
        .filter((r) => r.districtId === districtId)
        .sort((a, b) => b.seenAt.getTime() - a.seenAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    },
    size() {
      return reports.size
    }
  }
}

/** Thai "seen N ago" label (RPT-REQ-011). */
export function ageLabelTh(ageMinutes: number): string {
  if (ageMinutes < 1) return "เห็นเมื่อสักครู่"
  if (ageMinutes < 60) return `เห็นเมื่อ ${ageMinutes} นาทีก่อน`
  return `เห็นเมื่อ ${Math.floor(ageMinutes / 60)} ชั่วโมงก่อน`
}

export function toPublicReport(r: Report, now: Date): PublicReport {
  // Clamped at 0 so a clock that reads earlier than seenAt never shows a negative age.
  const ageMinutes = Math.max(0, Math.floor((now.getTime() - r.seenAt.getTime()) / 60_000))
  return {
    id: r.id,
    source: "user-report",
    verified: false,
    label: USER_REPORT_LABEL,
    landmark: r.landmark,
    depthLevel: r.depthLevel,
    depthCm: r.depthCm,
    seenAt: toBangkokIso(r.seenAt),
    ageMinutes,
    ageLabel: ageLabelTh(ageMinutes),
    confirmations: r.confirmations
  }
}
