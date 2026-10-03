#!/usr/bin/env bash
# Redeploy the backend to the live server.   Usage: deploy/deploy.sh
# Needs SSH access as root to the server (key based). Set SKIP_TESTS=1 to skip the test run.
set -euo pipefail

SERVER="${SERVER:-root@192.3.161.239}"
APP=/var/www/solucio-payments-api
cd "$(dirname "$0")/../server"

if [ -z "${SKIP_TESTS:-}" ]; then npm test --silent; fi

# Everything except secrets, tests and dependencies. The server keeps its own .env.
rsync -az --delete -e "ssh -o BatchMode=yes" \
  --exclude node_modules --exclude '.env' --exclude '.env.*' --exclude tests --exclude coverage \
  --exclude jest.config.js --exclude scripts/seed-demo.js --exclude '*.log' \
  ./ "$SERVER:$APP/"

ssh -o BatchMode=yes "$SERVER" "set -e
  chown -R solucio-api:solucio-api $APP && cd $APP
  runuser -u solucio-api -- env HOME=$APP npm ci --omit=dev --no-audit --no-fund
  systemctl restart solucio-payments-api
  systemctl is-active solucio-payments-api
  # Connecting to the database can take a while on this shared server, so retry for up to 30s.
  for i in \$(seq 1 15); do curl -fsS http://127.0.0.1:5101/api/health && exit 0; sleep 2; done
  echo 'API did not become healthy' >&2; exit 1"
echo
curl -fsS https://solucio.techtree.lifestyle/api/health && echo "  <- live"
