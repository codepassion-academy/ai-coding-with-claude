# 01 · Self-host every map asset

Status: done
Parent: [`../spec.md`](../spec.md) (Implementation Decisions › Map assets self-hosted; ADR 0001)
Blocked by: none

## What to build
Vendor MapLibre GL JS 5.24.0 (UMD build and CSS), pmtiles 4.5.0 and @protomaps/basemaps 5.7.2. Also vendor the glyphs (Noto Sans Regular and Medium; Thai, Latin and punctuation ranges only) and the light and dark sprites. Point the style's glyphs and sprite at our own origin. Serve every file from the fixed static list, and tighten the CSP to `'self'` (plus blob workers).

Add a shell script that fetches the pinned versions, checks each file against a committed hash manifest, and writes them into the vendored folder. It must not touch `package.json` (RPT-REQ-017 AC1).

## Acceptance criteria
- [ ] `public/index.html` and `public/app.js` reference no `http(s)://` URL outside the site.
- [ ] The CSP has no outside host.
- [ ] Every vendored file is served with the right content type.
- [ ] The static list still rejects path tricks.
- [ ] The vendored files on disk match the committed hash manifest.
- [ ] The README says how to run the vendor script and regenerate the tiles extract.

## Tests (seam 2: `createAppServer()` on 127.0.0.1, port 0)
The criteria above, with no network access in tests.
