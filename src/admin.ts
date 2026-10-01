import { createHash, timingSafeEqual } from "node:crypto"

export const ADMIN_TOKEN_MIN_LENGTH = 16
export const AUTH_FAILURE_MAX = 10
export const AUTH_FAILURE_WINDOW_MS = 15 * 60 * 1000

export type AuthFailureStatus = { limited: false } | { limited: true; retryAfterSeconds: number }

export type AuthFailureLimiter = {
  status(key: string, now: Date): AuthFailureStatus
  recordFailure(key: string, now: Date): void
}

/** The admin channel exists only when the token is long enough to resist guessing (RPT-REQ-014). */
export function isAdminEnabled(token: string | undefined): token is string {
  return token !== undefined && token.length >= ADMIN_TOKEN_MIN_LENGTH
}

const digest = (value: string) => createHash("sha256").update(value).digest()

/** Constant-time check of `Authorization: Bearer <token>`. Hashing first gives timingSafeEqual equal lengths. */
export function checkBearer(authorization: string | undefined, token: string): boolean {
  const prefix = "Bearer "
  if (authorization === undefined || !authorization.startsWith(prefix)) return false
  return timingSafeEqual(digest(authorization.slice(prefix.length)), digest(token))
}

/** Failed attempts per key in a sliding window, in memory only (lost on restart). */
export function createAuthFailureLimiter(): AuthFailureLimiter {
  const failures = new Map<string, number[]>()
  const recent = (key: string, now: Date) =>
    (failures.get(key) ?? []).filter((at) => at > now.getTime() - AUTH_FAILURE_WINDOW_MS)

  return {
    status(key, now) {
      const times = recent(key, now)
      if (times.length < AUTH_FAILURE_MAX) return { limited: false }
      const oldestLeavesAt = Math.min(...times) + AUTH_FAILURE_WINDOW_MS
      return { limited: true, retryAfterSeconds: Math.ceil((oldestLeavesAt - now.getTime()) / 1000) }
    },
    recordFailure(key, now) {
      failures.set(key, [...recent(key, now), now.getTime()])
    }
  }
}
