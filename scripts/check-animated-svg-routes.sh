#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
svg_file="$repo_root/dashboard/public/optiora-animated.svg"
api_file="$repo_root/optiora_backend/api.py"

if [[ ! -f "$svg_file" ]]; then
  echo "SVG not found: $svg_file"
  exit 1
fi

if [[ ! -f "$api_file" ]]; then
  echo "API routes file not found: $api_file"
  exit 1
fi

if command -v rg >/dev/null 2>&1; then
  svg_matches="$(rg -o '/api/v1/[A-Za-z0-9_./{}-]+' "$svg_file" || true)"
  api_matches="$(rg -o '@router\.(get|post|put|patch|delete)\("/[^"]+"' "$api_file" || true)"
else
  svg_matches="$(grep -oE '/api/v1/[A-Za-z0-9_./{}-]+' "$svg_file" || true)"
  api_matches="$(grep -oE '@router\.(get|post|put|patch|delete)\("/[^"]+"' "$api_file" || true)"
fi

svg_routes="$(printf "%s\n" "$svg_matches" | sed 's/["<>,)]$//' | sed '/^$/d' | sort -u)"
api_routes="$(printf "%s\n" "$api_matches" | sed -E 's/.*\("(\/[^\"]+)"/\1/' | sed 's#^#/api/v1#' | sed '/^$/d' | sort -u)"

if [[ -z "$svg_routes" ]]; then
  echo "No /api/v1 routes found in animated SVG."
  exit 0
fi

missing=0
while IFS= read -r route; do
  [[ -z "$route" ]] && continue
  if ! grep -Fxq "$route" <<< "$api_routes"; then
    echo "Missing backend route referenced in SVG: $route"
    missing=1
  fi
done <<< "$svg_routes"

if [[ "$missing" -ne 0 ]]; then
  exit 1
fi

echo "Animated SVG route references are consistent with backend routes."
