#!/usr/bin/env bash
# Builds a self-contained bundle in ./deploy for uploading to the server (FTP / Plesk).
# The bundle never contains ./data — production data stays on the server.
set -euo pipefail

cd "$(dirname "$0")/.."

rm -rf .next deploy
npm run build

cp -R .next/standalone deploy
mkdir -p deploy/.next/static deploy/public
cp -R .next/static/. deploy/.next/static/
cp -R public/. deploy/public/
rm -rf deploy/data deploy/.env deploy/.env.*

echo "Bundle ready: ./deploy (startup file: server.js)"
