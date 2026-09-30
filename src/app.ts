import { districts } from "./districts.ts"
import { createReportStore, toPublicReport, type ReportStore } from "./reports.ts"
import { latestReading, stationsIn } from "./stations.ts"
import { toBangkokIso } from "./time.ts"

export type Response = { status: number; body: unknown }

export type Context = { now: Date; reports?: ReportStore }

const defaultReports = createReportStore()

export const NOTICE = "ตัวอย่างเพื่อการเรียนเท่านั้น ไม่ใช่ประกาศเตือนภัยทางการ ข้อมูลเป็นข้อมูลสมมติ"

/** Route one request. Kept free of node:http so it is easy to test. */
export function handle(method: string, path: string, body: unknown, ctx: Context = { now: new Date() }): Response {
  if (method === "GET" && path === "/districts") {
    return { status: 200, body: { notice: NOTICE, districts: [...districts.values()] } }
  }

  const reports = ctx.reports ?? defaultReports

  const reportsMatch = path.match(/^\/districts\/([a-z-]+)\/reports$/)
  if (method === "POST" && reportsMatch) {
    const districtId = reportsMatch[1] ?? ""
    if (!districts.has(districtId)) return { status: 404, body: { notice: NOTICE, error: "unknown district" } }
    const result = reports.submit(body, districtId, "unknown", ctx.now)
    if (!result.ok) {
      const { ok: _ok, status, ...error } = result
      return { status, body: { notice: NOTICE, ...error } }
    }
    return {
      status: result.merged ? 200 : 201,
      body: { notice: NOTICE, merged: result.merged, report: toPublicReport(result.report) }
    }
  }

  const districtMatch = path.match(/^\/districts\/([a-z-]+)$/)
  if (method === "GET" && districtMatch) {
    const district = districts.get(districtMatch[1] ?? "")
    if (!district) return { status: 404, body: { error: "unknown district" } }
    const stations = stationsIn(district.id).map((s) => {
      const latest = latestReading(s, ctx.now)
      return {
        id: s.id,
        nameTh: s.nameTh,
        latest: latest ? { at: toBangkokIso(latest.at), levelCm: latest.levelCm } : null
      }
    })
    const userReports = reports.activeIn(district.id, ctx.now).map(toPublicReport)
    return { status: 200, body: { notice: NOTICE, district, stations, userReports } }
  }

  return { status: 404, body: { error: "not found" } }
}
