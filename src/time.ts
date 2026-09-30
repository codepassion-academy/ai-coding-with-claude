const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000 // Thailand is UTC+7 all year (no DST)

const ISO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/

/** Parse an ISO 8601 time that states `Z` or an offset. Undefined for anything else, including dates that do not exist. */
export function parseIsoInstant(value: string): Date | undefined {
  const match = ISO_INSTANT.exec(value)
  if (!match) return undefined
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  // Date rolls 02-30 over into March instead of rejecting it, so check the day against the month.
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/** Show a stored UTC time in Bangkok time, e.g. 2026-09-30T12:00:00Z -> "2026-09-30T19:00:00+07:00". */
export function toBangkokIso(date: Date): string {
  const local = new Date(date.getTime() + BANGKOK_OFFSET_MS)
  return local.toISOString().replace(/\.\d{3}Z$/, "+07:00")
}
