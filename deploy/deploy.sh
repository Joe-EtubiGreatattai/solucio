#!/usr/bin/env bash
# Redeploy the backend to the live server.   Usage: deploy/deploy.sh
# Needs SSH access as root to the server (key based). Set SKIP_TESTS=1 to skip the test run.
set -euo pipefail

SERVER="${SERVER:-root@185.181.165.204}"
APP=/var/www/solucio-backend
cd "$(dirname "$0")/../server"

if [ -z "${SKIP_TESTS:-}" ]; then npm test --silent; fi

# Everything except secrets, tests and dependencies. The server keeps its own .env.
rsync -az --delete -e "ssh -o BatchMode=yes" \
  --exclude node_modules --exclude '.env' --exclude '.env.*' --exclude tests --exclude coverage \
  --exclude jest.config.js --exclude scripts/seed-demo.js --exclude '*.log' \
  ./ "$SERVER:$APP/"

ssh -o BatchMode=yes "$SERVER" "set -e
  chown -R solucio:solucio $APP && cd $APP
  runuser -u solucio -- env HOME=$APP npm ci --omit=dev --no-audit --no-fund
  systemctl restart solucio-api
  sleep 3
  systemctl is-active solucio-api
  curl -fsS http://127.0.0.1:5001/api/health"
echo
curl -fsS https://solucio.techtree.lifestyle/api/health && echo "  <- live"
