#!/usr/bin/env bash
set -euo pipefail

export ASTROSAGE_HOST="${ASTROSAGE_HOST:-127.0.0.1}"
export PORT="${PORT:-3000}"

echo "Building ASTROSAGE local production bundle..."
npm run build

echo "Starting ASTROSAGE offline server on http://${ASTROSAGE_HOST}:${PORT}"
exec npm start
