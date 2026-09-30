import { createServer } from "node:http"
import { createApp } from "./app.ts"
import { createFileReportStore } from "./report-store.ts"

const port = Number(process.env.PORT ?? 3000)

const app = createApp({ store: createFileReportStore(process.env.REPORTS_FILE ?? "var/reports.json") })

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
    const ctx = { now: new Date(), clientIp: req.socket.remoteAddress }
    const { status, body: out } = app(req.method ?? "GET", path, body, ctx)
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(out))
  })
}).listen(port, () => console.log(`น้ำท่วมไหม listening on http://localhost:${port}`))
