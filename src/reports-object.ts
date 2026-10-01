import { handle, type Response as AppResponse } from "./app.ts"
import { createReportStore, type ReportStore, type StoreSnapshot } from "./reports.ts"

/** The part of a SQLite-backed Durable Object's `ctx.storage.sql` this file uses. */
export type SqlStorage = {
  exec(query: string, ...bindings: unknown[]): { toArray(): Record<string, unknown>[] }
}

export type DurableObjectStateLike = { storage: { sql: SqlStorage } }

/** What the Worker sends in. `clientKey` is already an HMAC, never an IP (ADR 0003, RPT-REQ-009). */
export type ObjectRequest = { method: string; path: string; body: unknown; clientKey: string; now: number }

/**
 * The one Durable Object that owns every รายงาน and the rate limiter (ADR 0003). It runs `handle()` with its own
 * store, so behaviour is the same as `npm run dev`, and saves the store to SQLite after each accepted POST so
 * reports survive the object being shut down. One request at a time, like the sync `handle()` (spec E26).
 */
export class ReportsObject {
  private readonly sql: SqlStorage
  private readonly store: ReportStore

  constructor(state: DurableObjectStateLike, _env: unknown) {
    this.sql = state.storage.sql
    this.sql.exec("CREATE TABLE IF NOT EXISTS snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)")
    const row = this.sql.exec("SELECT data FROM snapshot WHERE id = 1").toArray()[0]
    const saved = typeof row?.data === "string" ? (JSON.parse(row.data) as StoreSnapshot) : undefined
    this.store = createReportStore(undefined, saved)
  }

  async fetch(request: Request): Promise<Response> {
    const input = (await request.json()) as ObjectRequest
    // Pass the store in: without it handle() would use its module-level store, i.e. isolate memory.
    const result: AppResponse = handle(input.method, input.path, input.body, {
      now: new Date(input.now),
      clientKey: input.clientKey,
      reports: this.store
    })
    // Only an accepted POST changes what must survive; expired reports are purged again on load.
    if (input.method === "POST" && result.status < 300) {
      this.sql.exec(
        "INSERT INTO snapshot (id, data) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET data = excluded.data",
        JSON.stringify(this.store.snapshot())
      )
    }
    return Response.json(result)
  }
}
