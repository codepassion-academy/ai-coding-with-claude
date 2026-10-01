import { districts, resolveDistrictId } from "./districts.ts"
import { createReportStore, toPublicReport, type ReportStore } from "./reports.ts"
import { latestReading, stationsIn } from "./stations.ts"
import { toBangkokIso } from "./time.ts"

export type Response = { status: number; body: unknown; headers?: Record<string, string> }

/** `clientKey` is only for the rate limiter; it must never reach a report, response or log (RPT-REQ-009). */
export type Context = { now: Date; clientKey?: string; reports?: ReportStore }

const defaultReports = createReportStore()

export const NOTICE = "ตัวอย่างเพื่อการเรียนเท่านั้น ไม่ใช่ประกาศเตือนภัยทางการ ข้อมูลเป็นข้อมูลสมมติ"

/** Route one request. Kept free of node:http so it is easy to test. */
export function handle(method: string, path: string, body: unknown, ctx: Context = { now: new Date() }): Response {
  if (method === "GET" && path === "/districts") {
    return { status: 200, body: { notice: NOTICE, districts: [...districts.values()] } }
  }

  const reports = ctx.reports ?? defaultReports

  // A district is a P-code (TH1038) or, for one release, an old Bangkok slug (lat-phrao).
  const reportsMatch = path.match(/^\/districts\/([A-Za-z0-9-]+)\/reports$/)
  if (method === "POST" && reportsMatch) {
    const districtId = resolveDistrictId(reportsMatch[1] ?? "")
    if (!districtId) return { status: 404, body: { notice: NOTICE, error: "unknown district" } }
    // No key means the shared "unknown" bucket: still limited, fail closed (RPT-REQ-009 AC5).
    const result = reports.submit(body, districtId, ctx.clientKey ?? "unknown", ctx.now)
    if (!result.ok) {
      const { ok: _ok, status, ...error } = result
      const response: Response = { status, body: { notice: NOTICE, ...error } }
      if (result.retryAfterSec !== undefined) response.headers = { "Retry-After": String(result.retryAfterSec) }
      return response
    }
    return {
      status: result.merged ? 200 : 201,
      body: { notice: NOTICE, merged: result.merged, report: toPublicReport(result.report, ctx.now) }
    }
  }

  const districtMatch = path.match(/^\/districts\/([A-Za-z0-9-]+)$/)
  if (method === "GET" && districtMatch) {
    const district = districts.get(resolveDistrictId(districtMatch[1] ?? "") ?? "")
    if (!district) return { status: 404, body: { notice: NOTICE, error: "unknown district" } }
    const stations = stationsIn(district.id).map((s) => {
      const latest = latestReading(s, ctx.now)
      return {
        id: s.id,
        nameTh: s.nameTh,
        latest: latest ? { at: toBangkokIso(latest.at), levelCm: latest.levelCm } : null
      }
    })
    const userReports = reports.activeIn(district.id, ctx.now).map((r) => toPublicReport(r, ctx.now))
    return { status: 200, body: { notice: NOTICE, district, stations, userReports } }
  }

  return { status: 404, body: { notice: NOTICE, error: "not found" } }
}
