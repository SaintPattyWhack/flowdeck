#!/usr/bin/env bash
# Builds dist/index.html — ONE self-contained FlowDeck page.
# External assets: Leaflet 1.9.4 CSS+JS from cdnjs only. Everything else is inlined.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$ROOT/dist/index.html"
mkdir -p "$ROOT/dist"

CSS_FILES=(map/map.css markets/markets.css splc/splc.css shell/shell.css)
JS_FILES=(data/data.js splc/seed.js splc/splc.js map/map.js markets/markets.js shell/shell.js)

for f in "${CSS_FILES[@]}" "${JS_FILES[@]}"; do
  [[ -f "$ROOT/$f" ]] || { echo "missing $f" >&2; exit 1; }
done
for f in "${JS_FILES[@]}"; do
  if grep -q '</script' "$ROOT/$f"; then echo "$f contains '</script' — would break inlining" >&2; exit 1; fi
done
for f in "${CSS_FILES[@]}"; do
  if grep -q '</style' "$ROOT/$f"; then echo "$f contains '</style'" >&2; exit 1; fi
done

{
  cat <<'HTML'
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0b0d10">
<title>FlowDeck</title>
<meta name="description" content="FlowDeck — client-only commodity flow terminal: live AIS tanker map, choke-point counts, prices, news, watchlist and company supply-chain graphs.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' rx='3' fill='%230b0d10'/%3E%3Crect x='3' y='4' width='3' height='8' fill='%23f5a623'/%3E%3Crect x='7' y='7' width='3' height='5' fill='%23f5a623' opacity='.7'/%3E%3Crect x='11' y='2' width='3' height='10' fill='%23f5a623' opacity='.45'/%3E%3C/svg%3E">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" integrity="sha512-h9FcoyWjHcOcmEVkxOfTLnmZFWIH0iZhZT1H2TbOq55xssQGEJHEaIm+PgoUaZbRvQTNTluNOEfb1ZRy6D3BOw==" crossorigin="anonymous" referrerpolicy="no-referrer">
<style>
HTML
  for f in "${CSS_FILES[@]}"; do
    printf '\n/* ===== %s ===== */\n' "$f"
    cat "$ROOT/$f"
  done
  cat <<'HTML'
</style>
</head>
<body>
<div id="fd-app"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js" integrity="sha512-puJW3E/qXDqYp9IfhAI54BJEaWIfloJ7JWs7OeD5i6ruC9JZL1gERT1wjtwXFlh7CjE7ZJ+/vcRZRkIYIb6p4g==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
HTML
  for f in "${JS_FILES[@]}"; do
    printf '<script>\n/* ===== %s ===== */\n' "$f"
    cat "$ROOT/$f"
    printf '\n</script>\n'
  done
  cat <<'HTML'
</body>
</html>
HTML
} > "$OUT"

echo "wrote $OUT ($(wc -c < "$OUT") bytes)"
