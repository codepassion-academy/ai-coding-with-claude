import { randomBytes, randomUUID } from "node:crypto"
import { checkBearer, createAuthFailureLimiter, isAdminEnabled } from "./admin.ts"
import { districts } from "./districts.ts"
import { createReportLog, type LogFn } from "./report-log.ts"
import { createMemoryReportStore, type ReportStore } from "./report-store.ts"
import { hashReporter } from "./reporter.ts"
import {
  adminItem,
  adminItems,
  landmarkKey,
  rateLimitStatus,
  REPORT_LABEL,
  severityOf,
  validateReportInput,
  visibleItems,
  type Report
} from "./reports.ts"
import { latestReading, stationsIn } from "./stations.ts"
import { toBangkokIso } from "./time.ts"

export type Response = { status: number; body: unknown; headers?: Record<string, string> }

export type Context = { now: Date; clientIp?: string; authorization?: string }

export type AppDeps = { store: ReportStore; ipHashSecret: string; adminToken?: string; log?: LogFn }

export const NOTICE = "ตัวอย่างเพื่อการเรียนเท่านั้น ไม่ใช่ประกาศเตือนภัยทางการ ข้อมูลเป็นข้อมูลสมมติ"

/** Build a router around its own dependencies. Tests use this with a fresh memory store. */
export function createApp(deps: AppDeps): typeof handle {
  const authFailures = createAuthFailureLimiter()
  const reportLog = createReportLog(deps.log)

  return (method, path, body, ctx = { now: new Date() }): Response => {
    if (path.startsWith("/admin/")) {
      // The token is checked before anything is looked up, so a 401 never reveals whether a report exists.
      const { adminToken } = deps
      if (!isAdminEnabled(adminToken)) return { status: 503, body: { error: "admin disabled" } }
      if (!ctx.clientIp) return { status: 500, body: { error: "client address unavailable" } }
      const who = hashReporter(deps.ipHashSecret, ctx.clientIp)
      const blocked = authFailures.status(who, ctx.now)
      if (blocked.limited) {
        return {
          status: 429,
          body: { error: "rate limit exceeded", retryAfterSeconds: blocked.retryAfterSeconds },
          headers: { "Retry-After": String(blocked.retryAfterSeconds) }
        }
      }
      if (!checkBearer(ctx.authorization, adminToken)) {
        authFailures.recordFailure(who, ctx.now)
        reportLog.adminAuthFailed()
        return { status: 401, body: { error: "unauthorized" }, headers: { "WWW-Authenticate": "Bearer" } }
      }

      if (method === "GET" && path === "/admin/reports") {
        return { status: 200, body: { reports: adminItems(deps.store.all(), ctx.now) } }
      }
      const toggle = path.match(/^\/admin\/reports\/([^/]+)\/(hide|unhide)$/)
      if (method === "POST" && toggle) {
        const [, id = "", action] = toggle
        const current = deps.store.all().find((r) => r.id === id)
        if (!current) return { status: 404, body: { error: "unknown report" } }
        // Repeating the action changes nothing: the first hiddenAt stays, an unhidden report stays unhidden.
        const wanted = action === "hide" ? (current.hiddenAt ?? ctx.now.toISOString()) : null
        const changed = wanted !== current.hiddenAt
        const report = changed ? (deps.store.setHidden(id, wanted) ?? current) : current
        if (changed) (action === "hide" ? reportLog.hidden : reportLog.unhidden)(id, current.districtId)
        return { status: 200, body: { report: adminItem(report) } }
      }
      return { status: 404, body: { error: "not found" } }
    }

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
      const reports = { label: REPORT_LABEL, items: visibleItems(deps.store.all(), district.id, ctx.now) }
      return { status: 200, body: { notice: NOTICE, district, stations, reports } }
    }

    if (method === "POST" && path === "/reports") {
      // Without an address the report cannot be rate-limited, so it is not accepted.
      if (!ctx.clientIp) return { status: 500, body: { error: "client address unavailable" } }
      const reporterHash = hashReporter(deps.ipHashSecret, ctx.clientIp)
      const quota = rateLimitStatus(deps.store.all(), reporterHash, ctx.now)
      if (quota.limited) {
        reportLog.rejectedRateLimit()
        return {
          status: 429,
          body: { error: "rate limit exceeded", retryAfterSeconds: quota.retryAfterSeconds },
          headers: { "Retry-After": String(quota.retryAfterSeconds) }
        }
      }

      const checked = validateReportInput(body, ctx.now)
      if (!checked.ok) {
        reportLog.rejectedValidation(checked.fields)
        return { status: 400, body: { error: "invalid report", fields: checked.fields } }
      }
      const { districtId, landmark, depthCm, observedAt } = checked.input
      const report: Report = {
        id: randomUUID(),
        districtId,
        landmark,
        landmarkKey: landmarkKey(landmark),
        depthCm,
        observedAt: observedAt.toISOString(),
        receivedAt: ctx.now.toISOString(),
        reporterHash,
        hiddenAt: null
      }
      try {
        deps.store.add(report)
      } catch {
        // The store keeps nothing it could not save, so the sender can retry. The cause stays out of the response.
        return { status: 500, body: { error: "could not save report" } }
      }
      reportLog.accepted(report.id, districtId)
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

const defaultApp = createApp({ store: createMemoryReportStore(), ipHashSecret: randomBytes(32).toString("hex") })

/** Route one request. Kept free of node:http so it is easy to test. */
export function handle(method: string, path: string, body: unknown, ctx: Context = { now: new Date() }): Response {
  return defaultApp(method, path, body, ctx)
}
