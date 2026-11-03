#!/usr/bin/env bash
# Starts the image and checks that it serves the baked-in site correctly.
# Usage: [CONTAINER_ENGINE=podman] scripts/smoke-test-image.sh <image> [host-port]
set -euo pipefail

IMAGE="${1:?usage: smoke-test-image.sh <image> [host-port]}"
PORT="${2:-18080}"
NAME="azl-smoke-$$"
ENGINE="${CONTAINER_ENGINE:-docker}"

cleanup() { "$ENGINE" logs "$NAME" 2>&1 | tail -n 20 || true; "$ENGINE" rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

"$ENGINE" run -d --name "$NAME" -p "$PORT:8080" "$IMAGE" >/dev/null

echo "Waiting for the container to become healthy..."
for _ in $(seq 1 30); do
  status="$("$ENGINE" inspect --format '{{.State.Health.Status}}' "$NAME")"
  [ "$status" = "healthy" ] && break
  sleep 1
done
[ "$status" = "healthy" ] || { echo "FAIL: container is $status"; exit 1; }

base="http://127.0.0.1:$PORT"
fail() { echo "FAIL: $*"; exit 1; }
header() { curl -fsS -D - -o /dev/null "$base$1" | tr -d '\r' | grep -i "^$2:" | head -n 1 | cut -d' ' -f2-; }

[ "$("$ENGINE" exec "$NAME" id -u)" != "0" ] || fail "container runs as root"
[ "$(curl -fsS "$base/healthz")" = "ok" ] || fail "/healthz"
curl -fsS "$base/" | grep -q "Azure Local Endpoints" || fail "index.html"
curl -fsS "$base/api/v1/index.json" | grep -q '"scopes"' || fail "api/v1/index.json"
curl -fsS "$base/api/v1/providers.json" | grep -q '"providers"' || fail "api/v1/providers.json"
curl -fsS "$base/terraform/cisco/region-westeurope.tf" | grep -q "Community-driven, unofficial tool" || fail "generated Terraform lacks the disclaimer"
header /terraform/cisco/region-westeurope.tf content-type | grep -qi "text/plain" || fail "Terraform content type"
header /api/v1/index.json cache-control | grep -qi "no-cache" || fail "API cache-control"
header /favicon-dark.svg cache-control | grep -qi "max-age" || fail "icon cache-control"
header /api/v1/index.json access-control-allow-origin | grep -q '\*' || fail "CORS header"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$base/does-not-exist")" = "404" ] || fail "404 handling"

echo "OK: $IMAGE serves the site on port $PORT as uid $("$ENGINE" exec "$NAME" id -u)"
