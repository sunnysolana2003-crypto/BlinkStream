#!/usr/bin/env bash
set -e

echo "==> Installing frontend dependencies..."
cd frontend
npm install --ignore-scripts

echo "==> Building frontend..."
npm run build

cd ..
echo "==> Frontend build complete. dist/ is ready."
