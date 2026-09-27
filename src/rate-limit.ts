/** Counts failures per key in a sliding time window. In memory: one process only. */
export class FailureLimiter {
  private failures = new Map<string, number[]>()

  constructor(
    private readonly limit = 5,
    private readonly windowMs = 10 * 60 * 1000
  ) {}

  isBlocked(key: string, now: Date): boolean {
    return this.recent(key, now).length >= this.limit
  }

  recordFailure(key: string, now: Date): void {
    this.failures.set(key, [...this.recent(key, now), now.getTime()])
  }

  private recent(key: string, now: Date): number[] {
    const since = now.getTime() - this.windowMs
    return (this.failures.get(key) ?? []).filter((t) => t > since)
  }
}
