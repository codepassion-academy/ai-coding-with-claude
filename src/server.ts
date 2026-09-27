import { createServer } from "node:http"
import { handle } from "./app.ts"

const port = Number(process.env.PORT ?? 3000)

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
    const { status, body: out } = handle(req.method ?? "GET", new URL(req.url ?? "/", "http://x").pathname, body)
    res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(out))
  })
}).listen(port, () => console.log(`shop listening on http://localhost:${port}`))
