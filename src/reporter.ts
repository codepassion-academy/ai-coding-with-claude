import { createHmac } from "node:crypto"

const IPV4_MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i

/** The address a reporter is counted under: IPv4 as it is, IPv6 cut to its /64 network. */
export function normalizeIp(ip: string): string {
  const address = ip.split("%")[0] ?? ip // drop an IPv6 zone id
  const mapped = IPV4_MAPPED.exec(address)
  if (mapped) return mapped[1] ?? address
  if (!address.includes(":")) return address

  const [head = "", tail] = address.split("::")
  const headGroups = head ? head.split(":") : []
  const tailGroups = tail ? tail.split(":") : []
  const zeros = Array<string>(Math.max(0, 8 - headGroups.length - tailGroups.length)).fill("0")
  const network = [...headGroups, ...(tail === undefined ? [] : zeros), ...tailGroups].slice(0, 4)
  return `${network.map((group) => parseInt(group, 16).toString(16)).join(":")}::/64`
}

/**
 * The address a request counts under (RPT-REQ-008 AC7). The socket address, unless the server sits behind one
 * trusted proxy: then the last X-Forwarded-For value, which is the one that proxy appended itself.
 */
export function clientIpOf(
  socketAddress: string | undefined,
  forwardedFor: string | undefined,
  trustProxy: boolean
): string | undefined {
  if (!trustProxy || socketAddress === undefined) return socketAddress
  const forwarded = (forwardedFor ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "")
  return forwarded.at(-1) ?? socketAddress
}

/** The only form of a reporter's identity that is ever stored (RPT-REQ-008). */
export function hashReporter(secret: string, ip: string): string {
  return createHmac("sha256", secret).update(normalizeIp(ip)).digest("hex")
}
