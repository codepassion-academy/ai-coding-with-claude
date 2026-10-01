import { describe, expect, it } from "vitest"
import worker from "../src/worker.ts"

const get = (path: string, method = "GET") => worker.fetch(new Request(`https://demo.example${path}`, { method }))

describe("live demo worker", () => {
  it("serves seeded reports for a district, most severe first, without phone numbers", async () => {
    const res = get("/districts/chatuchak/reports")
    expect(res.status).toBe(200)
    const body = (await res.json()) as { reports: { landmark: string; confirmations: number; severity: number }[] }
    expect(body.reports.map((r) => r.landmark)).toEqual(["หน้าตลาดนัดจตุจักร ประตู 1", "ห้าแยกลาดพร้าว"])
    expect(body.reports[0]?.confirmations).toBe(2)
    expect(JSON.stringify(body)).not.toContain("phone")
  })

  it("refuses writes", () => {
    expect(get("/reports", "POST").status).toBe(405)
  })

  it("lists the endpoints at the root", async () => {
    const res = get("/")
    expect(res.status).toBe(200)
    expect(((await res.json()) as { endpoints: string[] }).endpoints).toContain("/districts/chatuchak/reports")
  })

  it("keeps the app's 404 for unknown districts", () => {
    expect(get("/districts/atlantis/reports").status).toBe(404)
  })
})
