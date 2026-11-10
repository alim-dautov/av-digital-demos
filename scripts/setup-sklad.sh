#!/bin/sh
# Run from the Git deploy path. Creates the server-side env file once (secrets generated here, never committed).
cd "$(dirname "$0")/.." || exit 1
[ -f build/sklad/.env ] && exit 0
{
  echo "DATABASE_URL="
  echo "APP_URL=https://demo-sklad.av-digital.kz"
  echo "APP_SECRET=$(openssl rand -hex 32)"
  echo "DB_AUTO_SETUP=1"
  echo "DISABLE_SCHEDULER=1"
  echo "CRON_SECRET=$(openssl rand -hex 16)"
  echo "DEMO_MODE=1"
  echo "SEED_PASSWORD=demo12345"
  echo "STORAGE_DRIVER=local"
} > build/sklad/.env
chmod 600 build/sklad/.env
