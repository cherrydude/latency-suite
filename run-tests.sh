#!/bin/sh

cd /usr/src/app # Ensure the working directory is correct
echo "Starting latency-suite.Optimized.spec.ts at $(date)"
# Refresh auth states before initial run
node src/auth/login.js || echo "Initial main login failed"
node src/auth/portal-login.js || echo "Initial portal login failed"
# Nutze explizit die Playwright-Config, damit Reports korrekt erzeugt werden
# Führe Export nach dem Test immer aus; das Export-Skript handhabt leere/fehlende Reports selbst
npx playwright test src/tests/latency-suite.Optimized.spec.ts --config src/tests/playwright.config.mjs --workers=1 ; node src/metrics/playwright-metrics-to-prometheus.js || echo "Initial test or metrics export failed"

while true; do
  echo "Test started at $(date)"
  node src/auth/login.js || echo "Main login failed"
  node src/auth/portal-login.js || echo "Portal login failed"
  npx playwright test src/tests/latency-suite.Optimized.spec.ts --config src/tests/playwright.config.mjs --workers=1 ; node src/metrics/playwright-metrics-to-prometheus.js || echo "Test or metrics export failed, retrying in 20 minutes"
  sleep 1200
done