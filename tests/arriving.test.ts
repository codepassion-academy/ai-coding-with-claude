import { describe, expect, it } from "vitest"
import { handle, NOTICE } from "../src/app.ts"
import { createReportStore } from "../src/reports.ts"

// north-water 04: "น้ำกำลังมา" reports from anywhere in the basin. Still no coordinates (RPT-REQ-013).
const now = new Date("2026-09-30T12:30:00Z")
const seenAt = "2026-09-30T19:00:00+07:00"
const body = (extra: Record<string, unknown> = {}) => ({ landmark: "ท่าน้ำวัดบ้านแพน", depth: "ankle", seenAt, ...extra })
type Public = { kind: string; landmark: string; confirmations: number; districtId?: string }

describe("report kind", () => {
  it("is flooded when the client does not send one, so existing clients keep working", () => {
    const store = createReportStore()
    const result = store.submit(body(), "TH1038", "t", now)
    expect(result.ok && result.report.kind).toBe("flooded")
  })

  it("can be arriving", () => {
    const store = createReportStore()
    const result = store.submit(body({ kind: "arriving" }), "TH1406", "t", now)
    expect(result.ok && result.report.kind).toBe("arriving")
  })

  it("keeps an arriving report apart from a flooded one at the same spot", () => {
    const store = createReportStore()
    store.submit(body(), "TH1406", "a", now)
    const arriving = store.submit(body({ kind: "arriving" }), "TH1406", "b", now)
    expect(arriving.ok && arriving.merged).toBe(false)
    expect(store.activeIn("TH1406", now).map((r) => r.kind).sort()).toEqual(["arriving", "flooded"])
  })

  it("still merges two arriving reports at the same spot", () => {
    const store = createReportStore()
    store.submit(body({ kind: "arriving" }), "TH1406", "a", now)
    const second = store.submit(body({ kind: "arriving" }), "TH1406", "b", now)
    expect(second.ok && second.merged).toBe(true)
    expect(second.ok && second.report.confirmations).toBe(2)
  })

  it("rejects any other kind", () => {
    for (const kind of ["coming", "", 1, null]) {
      expect(createReportStore().submit(body({ kind }), "TH1406", "t", now), String(kind)).toEqual({
        ok: false,
        status: 400,
        error: "kind_invalid",
        field: "kind"
      })
    }
  })
})

describe("basin API", () => {
  it("GET /basin lists the 12 basin จังหวัด with their อำเภอ and centres, for the picker", () => {
    const res = handle("GET", "/basin", undefined, { now })
    expect(res.status).toBe(200)
    const { notice, provinces } = res.body as { notice: string; provinces: { id: string; nameTh: string; districts: { id: string; nameTh: string; centre: number[] }[] }[] }
    expect(notice).toBe(NOTICE)
    expect(provinces).toHaveLength(12)
    const ayutthaya = provinces.find((p) => p.id === "TH14")
    expect(ayutthaya?.nameTh).toBe("พระนครศรีอยุธยา")
    expect(ayutthaya?.districts.length).toBe(16)
    expect(ayutthaya?.districts[0]?.centre).toHaveLength(2)
  })

  it("takes a report for an อำเภอ outside Bangkok and lists it under GET /basin/reports", () => {
    const reports = createReportStore()
    const post = handle("POST", "/districts/TH1406/reports", body({ kind: "arriving" }), { now, reports, clientKey: "t" })
    expect(post.status).toBe(201)
    expect(post.body).toMatchObject({ report: { kind: "arriving" } })
    const list = handle("GET", "/basin/reports", undefined, { now, reports })
    expect(list.status).toBe(200)
    // NFKC splits "ำ" into "ํ" + "า" on purpose (ADR 0002), so compare with the normalized text.
    expect((list.body as { reports: Public[] }).reports).toEqual([
      expect.objectContaining({ districtId: "TH1406", kind: "arriving", landmark: "ท่าน้ำวัดบ้านแพน".normalize("NFKC") })
    ])
  })

  it("returns 404 for a district outside the basin", () => {
    expect(handle("POST", "/districts/TH5001/reports", body({ kind: "arriving" }), { now, reports: createReportStore(), clientKey: "t" }).status).toBe(404)
  })

  it("still refuses coordinates in a report (RPT-REQ-013)", () => {
    const res = handle("POST", "/districts/TH1406/reports", body({ kind: "arriving", lat: 14.35, lng: 100.57 }), { now, reports: createReportStore(), clientKey: "t" })
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ error: "unknown_field" })
  })
})
