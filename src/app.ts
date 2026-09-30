import { randomUUID } from "node:crypto"
import { districts } from "./districts.ts"
import { createMemoryReportStore, type ReportStore } from "./report-store.ts"
import { REPORT_LABEL, severityOf, validateReportInput, type Report } from "./reports.ts"
import { latestReading, stationsIn } from "./stations.ts"
import { toBangkokIso } from "./time.ts"

export type Response = { status: number; body: unknown }

export type Context = { now: Date; clientIp?: string }

export type AppDeps = { store: ReportStore }

export const NOTICE = "ตัวอย่างเพื่อการเรียนเท่านั้น ไม่ใช่ประกาศเตือนภัยทางการ ข้อมูลเป็นข้อมูลสมมติ"

/** Build a router around its own dependencies. Tests use this with a fresh memory store. */
export function createApp(deps: AppDeps): typeof handle {
  return (method, path, body, ctx = { now: new Date() }) => {
    if (method === "GET" && path === "/districts") {
      return { status: 200, body: { notice: NOTICE, districts: [...districts.values()] } }
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
      return { status: 200, body: { notice: NOTICE, district, stations } }
    }

    if (method === "POST" && path === "/reports") {
      const checked = validateReportInput(body)
      if (!checked.ok) return { status: 400, body: { error: "invalid report", fields: checked.fields } }
      const { districtId, landmark, depthCm, observedAt } = checked.input
      const report: Report = {
        id: randomUUID(),
        districtId,
        landmark,
        landmarkKey: landmark,
        depthCm,
        observedAt: observedAt.toISOString(),
        receivedAt: ctx.now.toISOString(),
        reporterHash: null,
        hiddenAt: null
      }
      deps.store.add(report)
      return {
        status: 201,
        body: {
          notice: NOTICE,
          label: REPORT_LABEL,
          report: {
            id: report.id,
            districtId,
            landmark,
            depthCm,
            severity: severityOf(depthCm),
            observedAt: toBangkokIso(observedAt)
          }
        }
      }
    }

    return { status: 404, body: { error: "not found" } }
  }
}

const defaultApp = createApp({ store: createMemoryReportStore() })

/** Route one request. Kept free of node:http so it is easy to test. */
export function handle(method: string, path: string, body: unknown, ctx: Context = { now: new Date() }): Response {
  return defaultApp(method, path, body, ctx)
}
