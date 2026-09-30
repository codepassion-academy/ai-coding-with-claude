import { toBangkokIso } from "./time.ts"

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
export function validateReportInput(body: unknown): Validation {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, fields: ["body"] }
  const { districtId, landmark, depthCm, observedAt } = body as Record<string, unknown>
  if (typeof districtId !== "string" || typeof landmark !== "string" || typeof depthCm !== "number" || typeof observedAt !== "string") {
    return { ok: false, fields: ["body"] }
  }
  const observed = new Date(observedAt)
  if (Number.isNaN(observed.getTime())) return { ok: false, fields: ["body"] }
  return { ok: true, input: { districtId, landmark, depthCm, observedAt: observed } }
}
