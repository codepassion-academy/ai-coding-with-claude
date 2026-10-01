import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { describe, expect, it } from "vitest"

// north-water 02: real dams as reference points; release figures exist only in the สถานการณ์จำลอง (safety rule 4).
type Dam = { type: "Feature"; properties: { id: string; nameTh: string; nameEn: string; rid: string }; geometry: { type: string; coordinates: [number, number] } }
const dams = JSON.parse(readFileSync(new URL("../public/data/dams.geojson", import.meta.url), "utf8")) as { features: Dam[] }

type Popup = { title: string; note: string; link: { href: string; text: string } }
const window: { NAMTUAM_LOGIC?: { damPopup(dam: Dam["properties"]): Popup } } = {}
runInNewContext(readFileSync(new URL("../public/logic.js", import.meta.url), "utf8"), { window })
const logic = window.NAMTUAM_LOGIC as { damPopup(dam: Dam["properties"]): Popup }

describe("dams (north-water 02)", () => {
  it("are the four the spec names", () => {
    expect(dams.features.map((d) => d.properties.nameTh).sort()).toEqual(["เจ้าพระยา", "ป่าสักชลสิทธิ์", "ภูมิพล", "สิริกิติ์"].sort())
  })

  it("are points inside Thailand", () => {
    for (const { geometry, properties } of dams.features) {
      const [lon, lat] = geometry.coordinates
      expect(geometry.type, properties.id).toBe("Point")
      expect(lon > 97.3 && lon < 105.7 && lat > 5.6 && lat < 20.5, properties.id).toBe(true)
    }
  })

  it("carry only a name and an RID link: no release figure or any other number in the real data", () => {
    for (const { properties } of dams.features) {
      expect(Object.keys(properties).sort(), properties.id).toEqual(["id", "nameEn", "nameTh", "rid"])
      expect(new URL(properties.rid).hostname, properties.id).toMatch(/(^|\.)rid\.go\.th$/)
    }
  })

  it("show no number in the popup outside the scenario, and link to RID", () => {
    for (const { properties } of dams.features) {
      const popup = logic.damPopup(properties)
      expect(popup.title, properties.id).toBe(`เขื่อน${properties.nameTh}`)
      expect(`${popup.title} ${popup.note} ${popup.link.text}`, properties.id).not.toMatch(/[0-9๐-๙]/u)
      expect(popup.link.href, properties.id).toBe(properties.rid)
    }
  })
})
