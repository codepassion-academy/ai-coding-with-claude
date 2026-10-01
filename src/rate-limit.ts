export const RATE_LIMIT_MAX = 5
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000

export type RateLimiter = {
  check(key: string, now: Date): { allowed: true } | { allowed: false; retryAfterSec: number }
  record(key: string, now: Date): void
  /** Drop entries older than the window and keys left empty (RPT-REQ-012 AC3). */
  prune(now: Date): void
  /** Number of keys that still have entries in the window. */
  size(): number
  /** Every key with its timestamps, so a Durable Object can save and restore the limiter (ADR 0003). */
  entries(): [string, number[]][]
}

/**
 * Sliding-window log per client key (RPT-REQ-008). Keeps only timestamps as numbers, in memory.
 * `check` never records; the caller records only reports it accepted (A2).
 */
export function createRateLimiter(
  max = RATE_LIMIT_MAX,
  windowMs = RATE_LIMIT_WINDOW_MS,
  saved: Iterable<[string, number[]]> = []
): RateLimiter {
  const logs = new Map<string, number[]>([...saved].map(([key, log]) => [key, [...log]]))

  /** Entries still inside the window; an entry exactly `windowMs` old has left it (AC4). */
  function inWindow(key: string, now: Date): number[] {
    const cutoff = now.getTime() - windowMs
    const log = (logs.get(key) ?? []).filter((t) => t > cutoff)
    if (log.length > 0) logs.set(key, log)
    else logs.delete(key)
    return log
  }

  return {
    check(key, now) {
      const log = inWindow(key, now)
      if (log.length < max) return { allowed: true }
      const oldest = Math.min(...log)
      const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now.getTime()) / 1000))
      return { allowed: false, retryAfterSec }
    },
    record(key, now) {
      const log = inWindow(key, now)
      log.push(now.getTime())
      logs.set(key, log)
    },
    prune(now) {
      for (const key of [...logs.keys()]) inWindow(key, now)
    },
    size() {
      return logs.size
    },
    entries() {
      return [...logs].map(([key, log]) => [key, [...log]])
    }
  }
}

const UNKNOWN_CLIENT = "unknown"
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
const HEX_GROUP = /^[0-9a-f]{1,4}$/i

function parseIpv4(text: string): number[] | undefined {
  const m = IPV4.exec(text)
  if (!m) return undefined
  const octets = m.slice(1).map(Number)
  return octets.every((o) => o <= 255) ? octets : undefined
}

/** Expand an IPv6 address (with `::` and an optional dotted IPv4 tail) into 8 numeric groups. */
function parseIpv6(text: string): number[] | undefined {
  let address = text
  const lastColon = address.lastIndexOf(":")
  const tail = address.slice(lastColon + 1)
  if (tail.includes(".")) {
    const o = parseIpv4(tail)
    if (!o) return undefined
    const [a = 0, b = 0, c = 0, d = 0] = o
    address = address.slice(0, lastColon + 1) + ((a << 8) | b).toString(16) + ":" + ((c << 8) | d).toString(16)
  }

  const halves = address.split("::")
  if (halves.length > 2) return undefined
  const groups = (part: string | undefined) => (part ? part.split(":") : [])
  const head = groups(halves[0])
  const rest = groups(halves[1])
  if (![...head, ...rest].every((g) => HEX_GROUP.test(g))) return undefined
  const missing = 8 - head.length - rest.length
  if (halves.length === 2 ? missing < 1 : missing !== 0) return undefined
  return [...head, ...Array<string>(missing).fill("0"), ...rest].map((g) => parseInt(g, 16))
}

/**
 * Rate-limit key from the socket address only (RPT-REQ-009). IPv4-mapped IPv6 becomes plain
 * IPv4, IPv6 is cut to its /64 so one household cannot rotate suffixes. Anything missing or
 * unparseable shares the "unknown" bucket (fail closed).
 */
export function clientKeyFromAddress(addr: string | undefined): string {
  if (!addr) return UNKNOWN_CLIENT
  const ipv4 = parseIpv4(addr)
  if (ipv4) return ipv4.join(".")

  const groups = parseIpv6(addr.split("%")[0] ?? "")
  if (!groups) return UNKNOWN_CLIENT
  const isV4Mapped = groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff
  if (isV4Mapped) {
    const [hi = 0, lo = 0] = groups.slice(6)
    return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join(".")
  }
  return groups.slice(0, 4).map((g) => g.toString(16)).join(":") + "::/64"
}
