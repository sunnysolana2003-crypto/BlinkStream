#!/usr/bin/env bash
set -e

FRONTEND_DIR="blinkstream-trader (Frontend)"

echo "==> Installing frontend dependencies..."
cd "$FRONTEND_DIR"
npm install --ignore-scripts

echo "==> Building frontend..."
npm run build

cd ..
echo "==> Frontend build complete. dist/ is ready."
