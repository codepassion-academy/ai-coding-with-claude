import { createApp, NOTICE } from "./app.ts"
import { ReportStore } from "./reports.ts"

const MINUTE = 60 * 1000

/**
 * Read-only public demo on Cloudflare Workers.
 * Every request gets a fresh store seeded with made-up reports relative to `now`,
 * so all isolates answer the same and nothing a visitor sends is ever stored.
 * Writes are refused: a public endpoint must not collect phone numbers or spam.
 */
export default {
  fetch(request: Request): Response {
    const now = new Date()
    const path = new URL(request.url).pathname

    if (request.method !== "GET") {
      return json(405, { error: "read-only demo: clone the repo and run `npm run dev` to submit reports" })
    }
    if (path === "/") {
      return json(200, {
        notice: NOTICE,
        endpoints: ["/districts", "/districts/chatuchak", "/districts/chatuchak/reports"],
        source: "https://github.com/codepassion-academy/ai-coding-with-claude/tree/class-demo"
      })
    }

    const { status, body } = createApp(seededStore(now))("GET", path, undefined, { now })
    return json(status, body)
  }
}

/** Made-up demo reports; seenAt is always within the last hour so none expire. */
export function seededStore(now: Date): ReportStore {
  const store = new ReportStore()
  const ago = (minutes: number) => new Date(now.getTime() - minutes * MINUTE)
  store.submit({ districtId: "chatuchak", landmark: "หน้าตลาดนัดจตุจักร ประตู 1", depthCm: 25, seenAt: ago(50) }, ago(50))
  store.submit({ districtId: "chatuchak", landmark: "หน้าตลาดนัดจตุจักร ประตู 1", depthCm: 30, seenAt: ago(20) }, ago(20))
  store.submit({ districtId: "chatuchak", landmark: "ห้าแยกลาดพร้าว", depthCm: 8, seenAt: ago(35) }, ago(35))
  store.submit({ districtId: "din-daeng", landmark: "แยกดินแดง ฝั่งขาออก", depthCm: 25, seenAt: ago(15) }, ago(15))
  return store
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } })
}
