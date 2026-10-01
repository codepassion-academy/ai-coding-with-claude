# Hosting on Cloudflare Workers — research notes

Researched 2026-10-01 against Cloudflare primary sources (developers.cloudflare.com, Cloudflare changelog, github.com/cloudflare). "UNVERIFIED" = I could not find a primary-source sentence that says it.

## Bottom line for this repo

- **The tiles file cannot be a Workers static asset.** `public/tiles/bangkok.pmtiles` is 46,650,158 bytes (~44.5 MiB). Every Workers plan caps one asset at 25 MiB. Put it in **R2** and serve it from the Worker with `env.BUCKET.get(key, { range: request.headers, onlyIf: request.headers })`, or from a custom domain on the bucket. Don't use r2.dev in production because it is rate-limited.
- **The rest of `public/` fits easily** in Workers Static Assets: free unlimited asset requests, 20,000 files on Free.
- **In-memory `Map` state (reports and rate limiter) will not work as-is.** Isolates are not shared, are not persistent, and get evicted. Cloudflare says not to keep mutable global state. Move the report store to a SQLite-backed **Durable Object** (Free plan OK) or **D1**. KV is the wrong fit because it is eventually consistent, allows 1 write/s per key, and allows 1,000 writes/day on Free.
- **Rate limiter:** the `ratelimit` binding is GA, but it is per location, approximate, periods 10s or 60s only, and Cloudflare advises against keying on IP. To keep the spec's sliding window exact, put it in the same Durable Object, keyed by the `CF-Connecting-IP` value.
- **`node:http` server can run** via `httpServerHandler` from `cloudflare:node` (nodejs_compat, compat date >= 2025-09-01). The cleaner port is a small `fetch` adapter around the pure `handle()`, because `handle()` already takes no `node:http`.
- **Free plan 10 ms CPU per request** is the limit most likely to bite (JSON parse plus NFKC plus masking should fit; measure it). 100k requests/day is shared by Worker invocations. Static asset requests are free.
- **Auto-deploy:** Workers Builds (Git integration) deploys on push to the production branch, makes preview URLs for other branches, and gives 3,000 build min/month on Free. Use a build command like `npm ci && npm test && npm run lint`. That a failing build command stops the deploy is UNVERIFIED for Workers Builds; the Pages docs state it. GitHub Actions + `cloudflare/wrangler-action@v4` is the alternative, with `CLOUDFLARE_API_TOKEN` ("Edit Cloudflare Workers" template) and `CLOUDFLARE_ACCOUNT_ID`.
- **Use Workers, not Pages.** Cloudflare: "Start new projects with Workers."

---

## 1. Workers Static Assets: limits and Range

- One static asset file: **25 MiB on both Free and Paid**. https://developers.cloudflare.com/workers/platform/limits/ (page dated 2026-09-05)
- Assets per Worker version: **20,000 on Free, 100,000 on Paid**. https://developers.cloudflare.com/workers/platform/limits/
- Requests to static assets are free and unlimited. https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- **Range / 206 on the assets binding: UNVERIFIED.** No Workers static-assets doc page I read mentions Range or 206 (https://developers.cloudflare.com/workers/static-assets/routing/, https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/). The Pages docs say "Pages currently returns 200 responses for HTTP range requests" and that a fix is in progress: https://developers.cloudflare.com/pages/configuration/serving-pages/. The feature request for 206 on Pages is closed, and its resolution was not visible: https://github.com/cloudflare/workers-sdk/issues/3861. For this repo it doesn't matter, because the 25 MiB cap already rules the tiles file out.
- Related newer feature, **Workers Caching** (`cache: { enabled: true }`, Wrangler >= 4.69.0). Cloudflare strips `Range`, calls the Worker for a full 200, caches it, then returns 206 slices. A 206 returned by the Worker itself is *not* cached. "At launch, all Workers Caching responses are subject to the Free plan size limit regardless of your account's plan." Plan availability and the size number are not stated (UNVERIFIED). https://developers.cloudflare.com/workers/cache/configuration/, https://developers.cloudflare.com/workers/cache/limitations/ (dated 2026-08-25)

## 2. R2

- `get(key, { range })`: `range` is `{offset, length}`, `{offset}`, `{length}`, `{suffix}`, **or a `Headers` object**. `onlyIf` takes an `R2Conditional` or `Headers`, and "All conditional headers aside from `If-Range` are supported." `R2Object.writeHttpMetadata(headers)` copies the stored HTTP metadata onto a response. https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
  - The Worker must set `206`, `Content-Range` and `Accept-Ranges` itself. The reference page does not cover 206 handling. Use the `range` field on the returned object.
- r2.dev: "Public access through `r2.dev` subdomains is rate-limited and should only be used for development purposes." Exact numbers are not published (UNVERIFIED). Don't CNAME to r2.dev. https://developers.cloudflare.com/r2/buckets/public-buckets/
- A custom domain is required for caching, WAF, access controls and Bot Management. https://developers.cloudflare.com/r2/buckets/public-buckets/
- Range support on r2.dev or custom-domain public access: **UNVERIFIED** (not stated on the public-buckets page).
- CORS: JSON policy set in the dashboard or with `npx wrangler r2 bucket cors set <BUCKET> --file cors.json` (`AllowedOrigins`, `AllowedMethods`, `AllowedHeaders`, `ExposeHeaders`, `MaxAgeSeconds`). The page has no Range-specific guidance. For pmtiles you would allow `Range` and expose `Content-Range`, `Content-Length`, `ETag` (my inference). https://developers.cloudflare.com/r2/buckets/cors/. Serving through the same-origin Worker avoids CORS entirely.
- Free tier, Standard storage only: **10 GB-month storage, 1M Class A ops/month, 10M Class B ops/month, egress free.** https://developers.cloudflare.com/r2/pricing/

## 3. nodejs_compat, `node:http`, client IP

- `createServer` works with `httpServerHandler` from `cloudflare:node`. It needs `nodejs_compat`. `enable_nodejs_http_server_modules` is on automatically for compat date >= 2025-09-01. It is built on top of `fetch`. Not supported: `closeAllConnections()`, non-port `listen()`, `maxHeaderSize`/`insecureHTTPParser`/`keepAliveTimeout`, trailers, 1xx. https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/
  - `req.socket.remoteAddress` under this adapter: **UNVERIFIED.** Don't rely on it; read `CF-Connecting-IP`.
- `request.cf` has ASN, country, city, TLS info and similar, but **no client-IP field**. https://developers.cloudflare.com/workers/runtime-apis/request/
- `CF-Connecting-IP` "provides the client IP address connecting to Cloudflare". On cross-zone Worker subrequests it is replaced with a Worker IP "for security". https://developers.cloudflare.com/fundamentals/reference/http-headers/
- Spoofing: `X-Forwarded-For` **is** client-influenced, because Cloudflare appends to an existing header. https://developers.cloudflare.com/fundamentals/reference/http-headers/. Transform Rules cannot set `cf-*` headers, only remove `cf-connecting-ip`. https://developers.cloudflare.com/rules/transform/request-header-modification/. No docs sentence says what happens to a client-sent `CF-Connecting-IP`. **Observed 2026-10-01** on `https://namthuam.savepong.workers.dev`: a request carrying its own `CF-Connecting-IP` is rejected at the edge with `403` and body `error code: 1000`, before the Worker runs. Requests without it but with a varying `X-Forwarded-For` all counted against the real client IP (5 accepted, 6th `429`). So use `CF-Connecting-IP` and never `X-Forwarded-For`. Observed behaviour, not documented: re-test if it matters.

## 4. Global in-memory state

- "Cloudflare recommends you do not use or mutate global state." Isolates may be evicted and are not long-lived. https://developers.cloudflare.com/workers/reference/how-workers-works/
- "Workers reuse isolates across requests… Pass request-scoped data through function arguments or store it on `env` bindings. Never in module-level variables." For coordinated state, Cloudflare recommends KV/D1/R2 or Durable Objects. https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
- So a module-level `Map` is per isolate (separate per location and per instance) and is not persistent. Reports would vanish or diverge, and the limiter would be trivially bypassed.

## 5. Durable Objects, D1, KV on Free

- DO on Free: "Only Durable Objects with SQLite storage backend are available." 5 GB account storage, 2 MB max row/BLOB. https://developers.cloudflare.com/durable-objects/platform/limits/
- DO Free allowances: **100,000 requests/day, 13,000 GB-s/day, 5M rows read/day, 100,000 rows written/day, 5 GB storage**. Ops fail after a limit is hit. Resets 00:00 UTC. https://developers.cloudflare.com/durable-objects/platform/pricing/
- D1 Free: **5M rows read/day, 100,000 rows written/day, 5 GB storage**. Resets 00:00 UTC. https://developers.cloudflare.com/d1/platform/pricing/
- KV Free: **100,000 reads/day, 1,000 writes/day, 1 write/s per key, 1 GB storage**. https://developers.cloudflare.com/kv/platform/limits/
- KV is eventually consistent: changes "may take up to 60 seconds or more to be visible in other global network locations", and it is "not ideal for applications where you need support for atomic operations". https://developers.cloudflare.com/kv/concepts/how-kv-works/

## 6. Workers Rate Limiting binding

- **GA on 2025-09-19.** "stable and recommended for all production workloads". https://developers.cloudflare.com/changelog/post/2025-09-19-ratelimit-workers-ga/ (text from search snippet; the direct fetch was blocked)
- Config: `"ratelimits": [{ "name", "namespace_id", "simple": { "limit", "period" } }]`. `period` "Must be either `10` or `60`". Needs Wrangler >= 4.36.0. https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Counters are "local to the Cloudflare location"; "permissive, eventually consistent, and intentionally designed to not be used as an accurate accounting system." https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- "It is not recommended to use IP addresses or locations… since these can be shared by many users." https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Free-plan availability and pricing: **UNVERIFIED** (not stated on the pages I could read).
- So it cannot express the spec's per-client sliding window over a longer period. It could work as a coarse extra guard.

## 7. Auto-deploy

**Workers Builds (Git integration)**
- Production-branch builds create a version, and "If the build is configured to deploy, that version is promoted to the Active Deployment." Preview builds run for other branches, with a Preview URL. https://developers.cloudflare.com/workers/ci-cd/builds/ (dated 2026-10-01)
- Build command is optional. Deploy command defaults to `npx wrangler deploy`. The non-production command defaults to `npx wrangler preview` and can be changed to `npx wrangler versions upload`. Root directory is configurable. https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- Node: default 24.18.0, with 22.23.2 preinstalled. Override with `NODE_VERSION`, `.nvmrc` or `.node-version`. https://developers.cloudflare.com/workers/ci-cd/builds/build-image/
- Limits: **Free 3,000 build min/month, 1 concurrent build. Paid 6,000 min/month, 6 concurrent. 20-min timeout. 8 GB RAM.** https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/
- That `npm test` in the build command fails the build and skips the deploy on non-zero exit is **UNVERIFIED for Workers Builds**. The Pages docs state the equivalent ("Any non-zero return code will cause a build to be marked as failed"): https://developers.cloudflare.com/pages/configuration/build-configuration/. Check it once with a deliberately failing test.

**GitHub Actions**
- Secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Token from the **"Edit Cloudflare Workers"** template, scoped to the account. Example uses `actions/checkout@v6` + `cloudflare/wrangler-action@v4` on `push: branches: [main]`. https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
- Advantage: `npm test` / `npm run lint` run as separate steps that must pass before the deploy step. Gating is explicit and doesn't depend on unverified behaviour.
- R2 upload of the tiles: add R2 permissions to the token if CI uploads `bangkok.pmtiles` (UNVERIFIED exact permission name). It is simpler to upload it once by hand with `wrangler r2 object put`, since `public/tiles/` is gitignored and won't be in the repo checkout anyway.

## 8. Pages vs Workers

- "Workers supports most Pages use cases and offers a broader feature set. It is Cloudflare's primary platform for building applications. Start new projects with Workers." https://developers.cloudflare.com/pages/
- "If you are starting a new project, use Workers instead of Pages… Pages continues to work, but new features and optimizations are focused on Workers." https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
- Migration guide: https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/

## 9. Free plan limits that could bite

From https://developers.cloudflare.com/workers/platform/limits/ (dated 2026-09-05):
- **CPU: 10 ms per HTTP request on Free** (Paid: 30 s by default, up to 5 min). This is the main risk. Wall-clock I/O wait (R2/DO) does not count as CPU; profile `submit` (NFKC, regex masking).
- **100,000 requests/day on Free.** Static-asset requests are free and unlimited (https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/). Tile range reads through a Worker *do* count, and pmtiles makes many range requests per map view. A public R2 custom domain avoids invoking the Worker.
- Memory 128 MB. 50 subrequests per request on Free. Script 64 MiB. 100 Workers on Free.
- Request body: 100 MB on Free/Pro zones. The app's own 2048-byte cap (413) still has to be enforced in code: read `request.body` with a byte counter rather than trusting `Content-Length`.
- DO free allowances (100k req/day, 100k rows written/day) sit beside the Worker's 100k/day. They are fine for a demo but would be exceeded if every request touches the DO.
