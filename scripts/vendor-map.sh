#!/usr/bin/env bash
# Fetch the pinned map assets into public/vendor/ and check each against public/vendor/SHA256SUMS
# (ADR 0001: the map page loads nothing from another site). Does not touch package.json.
#
#   scripts/vendor-map.sh          fetch, verify against SHA256SUMS, then install
#   UPDATE=1 scripts/vendor-map.sh fetch and rewrite SHA256SUMS (only when bumping a pinned version)
set -euo pipefail

MAPLIBRE=5.24.0
PMTILES=4.5.0
BASEMAPS=5.7.2
# protomaps/basemaps-assets has no releases, so pin a commit.
ASSETS=028c18f713baecad011301ff7a69acc39bcc2ae7

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/public/vendor"
SUMS="$DEST/SHA256SUMS"
RAW="https://raw.githubusercontent.com/protomaps/basemaps-assets/$ASSETS"

# "local path<TAB>source URL". Glyph folders drop the spaces; src/static.ts maps the URL MapLibre asks for.
FILES=$(cat <<EOF
maplibre-gl.js	https://unpkg.com/maplibre-gl@$MAPLIBRE/dist/maplibre-gl.js
maplibre-gl.css	https://unpkg.com/maplibre-gl@$MAPLIBRE/dist/maplibre-gl.css
pmtiles.js	https://unpkg.com/pmtiles@$PMTILES/dist/pmtiles.js
basemaps.js	https://unpkg.com/@protomaps/basemaps@$BASEMAPS/dist/basemaps.js
glyphs/OFL.txt	$RAW/fonts/OFL.txt
EOF
)
for face in Regular Medium; do
  dir="noto-sans-$(echo "$face" | tr '[:upper:]' '[:lower:]')"
  # Latin, Latin-1, Latin Extended-A, Thai, General Punctuation. Other scripts don't render (accepted).
  for range in 0-255 256-511 3584-3839 8192-8447; do
    FILES+=$'\n'"glyphs/$dir/$range.pbf	$RAW/fonts/Noto%20Sans%20$face/$range.pbf"
  done
done
for flavor in light dark; do
  for suffix in .json .png @2x.json @2x.png; do
    FILES+=$'\n'"sprites/$flavor$suffix	$RAW/sprites/v4/$flavor$suffix"
  done
done

sha() { if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
NEW_SUMS="$TMP/SHA256SUMS"
: > "$NEW_SUMS"

while IFS=$'\t' read -r path url; do
  mkdir -p "$TMP/files/$(dirname "$path")"
  curl -fsSL --retry 2 -o "$TMP/files/$path" "$url"
  echo "$(sha "$TMP/files/$path")  $path" >> "$NEW_SUMS"
done <<< "$FILES"

if [[ "${UPDATE:-}" != "1" ]]; then
  if ! diff -u "$SUMS" "$NEW_SUMS"; then
    echo "vendor-map: a fetched file does not match public/vendor/SHA256SUMS. Nothing was installed." >&2
    exit 1
  fi
fi

mkdir -p "$DEST"
cp -R "$TMP/files/." "$DEST/"
cp "$NEW_SUMS" "$SUMS"
echo "vendor-map: $(wc -l < "$SUMS" | tr -d ' ') files in public/vendor/ match SHA256SUMS"
