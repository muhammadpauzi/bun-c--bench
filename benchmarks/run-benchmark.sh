#!/usr/bin/env bash
set -e

TARGET_HOST=${1:-"http://localhost:3000"}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=========================================================="
echo "🚀 GOGOLABS BENCHMARK SUITE: BUN vs .NET 10 vs LARAVEL (0.5 vCPU LIMIT)"
echo "Target Host: $TARGET_HOST"
echo "Root Dir:    $ROOT_DIR"
echo "=========================================================="

cd "$ROOT_DIR"

# 1. Start PostgreSQL
echo ""
echo "🐘 Ensuring PostgreSQL container is ready..."
docker compose up -d postgres
echo "Waiting for PostgreSQL healthy status..."
until docker compose exec -T postgres pg_isready -U postgres -d gogoskola_db > /dev/null 2>&1; do
  sleep 1
done
echo "✅ PostgreSQL is ready."

# ---------------------------------------------------------
# BENCHMARK 1: BUN + HONO + DRIZZLE
# ---------------------------------------------------------
echo ""
echo "=========================================================="
echo "🟡 STARTING BENCHMARK: BUN + HONO + DRIZZLE"
echo "=========================================================="
docker compose --profile dotnet down > /dev/null 2>&1 || true
docker compose --profile bun up -d --build bun-api

echo "Waiting for Bun service to be ready on $TARGET_HOST/health..."
until curl -s "$TARGET_HOST/health" | grep -q '"status":"ok"'; do
  sleep 1
done
echo "✅ Bun is ready!"

echo "--- Idle Resource Usage ---"
docker stats gogoskola_bun --no-stream --format "Container: {{.Name}} | CPU: {{.CPUPerc}} | MEM: {{.MemUsage}}"

echo ""
echo "Running smoke test on Bun..."
k6 run -e TARGET_URL="$TARGET_HOST" "$SCRIPT_DIR/k6/k6-smoke.js"

echo ""
echo "🔥 Executing full k6 load test on Bun..."
k6 run --summary-export="$SCRIPT_DIR/summary_bun.json" -e TARGET_URL="$TARGET_HOST" "$SCRIPT_DIR/k6/k6-suite.js"

echo "--- Peak/Post Load Resource Usage ---"
docker stats gogoskola_bun --no-stream --format "Container: {{.Name}} | CPU: {{.CPUPerc}} | MEM: {{.MemUsage}}"

echo "Stopping Bun container..."
docker compose --profile bun down

# Cooldown
echo "⏳ Cooldown 10s for database & system to stabilize..."
sleep 10

# ---------------------------------------------------------
# BENCHMARK 2: C# .NET 10 + EF CORE
# ---------------------------------------------------------
echo ""
echo "=========================================================="
echo "🟣 STARTING BENCHMARK: C# (.NET 10) + EF CORE"
echo "=========================================================="
docker compose --profile bun down > /dev/null 2>&1 || true
docker compose --profile dotnet up -d --build dotnet-api

echo "Waiting for .NET service to be ready on $TARGET_HOST/health..."
until curl -s "$TARGET_HOST/health" | grep -q '"status":"ok"'; do
  sleep 1
done
echo "✅ .NET 10 is ready!"

echo "--- Idle Resource Usage ---"
docker stats gogoskola_dotnet --no-stream --format "Container: {{.Name}} | CPU: {{.CPUPerc}} | MEM: {{.MemUsage}}"

echo ""
echo "Running smoke test on .NET 10..."
k6 run -e TARGET_URL="$TARGET_HOST" "$SCRIPT_DIR/k6/k6-smoke.js"

echo ""
echo "🔥 Executing full k6 load test on .NET 10..."
k6 run --summary-export="$SCRIPT_DIR/summary_dotnet.json" -e TARGET_URL="$TARGET_HOST" "$SCRIPT_DIR/k6/k6-suite.js"

echo "--- Peak/Post Load Resource Usage ---"
docker stats gogoskola_dotnet --no-stream --format "Container: {{.Name}} | CPU: {{.CPUPerc}} | MEM: {{.MemUsage}}"

echo "Stopping .NET container..."
docker compose --profile dotnet down

# Cooldown
echo "⏳ Cooldown 10s for database & system to stabilize..."
sleep 10

# ---------------------------------------------------------
# BENCHMARK 3: LARAVEL (OCTANE + FRANKENPHP)
# ---------------------------------------------------------
echo ""
echo "=========================================================="
echo "🔴 STARTING BENCHMARK: LARAVEL (OCTANE + FRANKENPHP)"
echo "=========================================================="
docker compose --profile bun --profile dotnet down > /dev/null 2>&1 || true
docker compose --profile laravel up -d --build laravel-api

echo "Waiting for Laravel service to be ready on $TARGET_HOST/health..."
until curl -s "$TARGET_HOST/health" | grep -q '"status":"ok"'; do
  sleep 1
done
echo "✅ Laravel is ready!"

echo "--- Idle Resource Usage ---"
docker stats gogoskola_laravel --no-stream --format "Container: {{.Name}} | CPU: {{.CPUPerc}} | MEM: {{.MemUsage}}"

echo ""
echo "Running smoke test on Laravel..."
k6 run -e TARGET_URL="$TARGET_HOST" "$SCRIPT_DIR/k6/k6-smoke.js"

echo ""
echo "🔥 Executing full k6 load test on Laravel..."
k6 run --summary-export="$SCRIPT_DIR/summary_laravel.json" -e TARGET_URL="$TARGET_HOST" "$SCRIPT_DIR/k6/k6-suite.js"

echo "--- Peak/Post Load Resource Usage ---"
docker stats gogoskola_laravel --no-stream --format "Container: {{.Name}} | CPU: {{.CPUPerc}} | MEM: {{.MemUsage}}"

echo "Stopping Laravel container..."
docker compose --profile laravel down

echo ""
echo "=========================================================="
echo "🏁 BENCHMARK COMPLETED!"
echo "Summary JSON files saved to:"
echo "  - Bun:     $SCRIPT_DIR/summary_bun.json"
echo "  - .NET 10: $SCRIPT_DIR/summary_dotnet.json"
echo "  - Laravel: $SCRIPT_DIR/summary_laravel.json"
echo "=========================================================="

