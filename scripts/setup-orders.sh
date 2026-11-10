#!/bin/sh
# Run from the Git deploy path. Creates the server-side env file once (secrets generated here, never committed).
cd "$(dirname "$0")/.." || exit 1
[ -f build/orders/.env ] && exit 0
{
  echo "AUTH_SECRET=$(openssl rand -hex 32)"
  echo "DEMO_MODE=1"
  echo "ALLOW_DEMO_ACCOUNTS=true"
  echo "DEMO_CONTACT_URL=https://av-digital.kz/#contact"
  echo "CRON_SECRET=$(openssl rand -hex 16)"
} > build/orders/.env
chmod 600 build/orders/.env
