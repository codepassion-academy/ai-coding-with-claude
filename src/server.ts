import { randomBytes } from "node:crypto"
import { createServer } from "node:http"
import { ADMIN_TOKEN_MIN_LENGTH, isAdminEnabled } from "./admin.ts"
import { createApp } from "./app.ts"
import { createFileReportStore } from "./report-store.ts"

const port = Number(process.env.PORT ?? 3000)

const ipHashSecret = process.env.IP_HASH_SECRET ?? randomBytes(32).toString("hex")
if (!process.env.IP_HASH_SECRET) {
  console.warn("IP_HASH_SECRET is not set: using a random secret, so report quotas reset on every restart")
}

const adminToken = process.env.ADMIN_TOKEN
if (adminToken !== undefined && !isAdminEnabled(adminToken)) {
  console.warn(`ADMIN_TOKEN is shorter than ${ADMIN_TOKEN_MIN_LENGTH} characters: the admin channel stays closed`)
}

const store = createFileReportStore(process.env.REPORTS_FILE ?? "var/reports.json")

// Reporter hashes are cleared 24 hours after a report arrives (RPT-REQ-008): once now, then every hour.
function purgeReporterHashes(): void {
  try {
    store.purgeReporterHashes(new Date())
  } catch (error) {
    console.warn("could not purge reporter hashes:", error instanceof Error ? error.message : "unknown error")
  }
}
purgeReporterHashes()
setInterval(purgeReporterHashes, 60 * 60 * 1000).unref()

const app = createApp({
  store,
  ipHashSecret,
  adminToken,
  // One JSON line per event on stdout. The app only ever passes allowed fields (src/report-log.ts).
  log: (event, fields) => console.log(JSON.stringify({ event, ...fields }))
})

createServer((req, res) => {
  let raw = ""
  req.on("data", (chunk) => (raw += chunk))
  req.on("end", () => {
    let body: unknown = undefined
    if (raw) {
      try {
        body = JSON.parse(raw)
      } catch {
        res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "invalid JSON" }))
        return
      }
    }
    const path = new URL(req.url ?? "/", "http://x").pathname
    const ctx = { now: new Date(), clientIp: req.socket.remoteAddress, authorization: req.headers.authorization }
    const { status, body: out, headers } = app(req.method ?? "GET", path, body, ctx)
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers }).end(JSON.stringify(out))
  })
}).listen(port, () => console.log(`น้ำท่วมไหม listening on http://localhost:${port}`))
