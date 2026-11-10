#!/bin/sh
# Run from the Git deploy path. Creates demo-crm/api/config.php once with a random secret.
cd "$(dirname "$0")/.." || exit 1
[ -f demo-crm/api/config.php ] && exit 0
sed "s/CHANGE_ME_TO_A_LONG_RANDOM_STRING/$(openssl rand -hex 32)/" demo-crm/api/config.example.php > demo-crm/api/config.php
chmod 640 demo-crm/api/config.php
