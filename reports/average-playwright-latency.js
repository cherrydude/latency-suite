#!/usr/bin/env node
/**
 * Compute the arithmetic mean for selected Playwright tests from Prometheus.
 *
 * By default this averages `playwright_latency` across all browsers for:
 *   - Datenbank: Alle Spalten Ansicht
 *   - Datenbank: Sachverhalt Ansicht
 *   - Datenbank: Telefonie Ansicht
 *
 * Examples:
 *   node reports/average-playwright-latency.js
 *   node reports/average-playwright-latency.js --prom http://localhost:9090 --from 2026-01-01T00:00:00Z
 *   node reports/average-playwright-latency.js --metric playwright_selector_latency_ms
 */

const DEFAULT_TESTS = [
  'Datenbank: Alle Spalten Ansicht',
  'Datenbank: Sachverhalt Ansicht',
  'Datenbank: Telefonie Ansicht',
];

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    prom: process.env.PROM_URL || 'http://localhost:9090',
    metric: 'playwright_latency',
    tests: DEFAULT_TESTS,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    if (arg === '--prom' && next) {
      opts.prom = next;
      i++;
    } else if (arg === '--metric' && next) {
      opts.metric = next;
      i++;
    } else if (arg === '--from' && next) {
      opts.from = next;
      i++;
    } else if (arg === '--to' && next) {
      opts.to = next;
      i++;
    } else if (arg === '--tests' && next) {
      opts.tests = next.split(',').map((value) => value.trim()).filter(Boolean);
      i++;
    }
  }

  if (!opts.to) {
    opts.to = new Date().toISOString();
  }

  if (!opts.from) {
    // The Prometheus retention is 180d in this stack; go back a bit further so
    // the query still covers the full available history even when the exact
    // start of recording is unknown.
    const from = new Date(Date.now() - 3650 * 24 * 60 * 60 * 1000);
    opts.from = from.toISOString();
  }

  return opts;
}

function escapePromqlLabelValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function rangeSelector(fromIso, toIso) {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const windowSeconds = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 1000));
  return `${windowSeconds}s`;
}

async function queryInstant(prom, expr) {
  const url = `${prom}/api/v1/query?query=${encodeURIComponent(expr)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Prometheus error ${response.status}: ${await response.text()}`);
  }

  const json = await response.json();
  if (json.status !== 'success') {
    throw new Error(`Prometheus response: ${JSON.stringify(json)}`);
  }

  return json.data.result;
}

function readScalar(result) {
  const value = result?.[0]?.value?.[1];
  if (value == null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(3) : 'n/a';
}

async function main() {
  const opts = parseArgs();
  const window = rangeSelector(opts.from, opts.to);

  console.log(`Prometheus: ${opts.prom}`);
  console.log(`Metric: ${opts.metric}`);
  console.log(`Window: ${opts.from} -> ${opts.to} (${window})`);
  console.log('');

  const rows = [];
  let totalSum = 0;
  let totalCount = 0;

  for (const testName of opts.tests) {
    const testLabel = escapePromqlLabelValue(testName);
    const metricExpr = `${opts.metric}{test="${testLabel}"}`;
    const sumExpr = `sum(sum_over_time(${metricExpr}[${window}]))`;
    const countExpr = `sum(count_over_time(${metricExpr}[${window}]))`;

    const [sumResult, countResult] = await Promise.all([
      queryInstant(opts.prom, sumExpr),
      queryInstant(opts.prom, countExpr),
    ]);

    const sum = readScalar(sumResult) ?? 0;
    const count = readScalar(countResult) ?? 0;
    const average = count > 0 ? sum / count : null;

    totalSum += sum;
    totalCount += count;

    rows.push({ testName, sum, count, average });
  }

  for (const row of rows) {
    console.log(`${row.testName}`);
    console.log(`  sum: ${formatNumber(row.sum)}`);
    console.log(`  count: ${formatNumber(row.count)}`);
    console.log(`  average: ${formatNumber(row.average ?? Number.NaN)} ms`);
  }

  console.log('');
  console.log('Gesamt');
  console.log(`  sum: ${formatNumber(totalSum)}`);
  console.log(`  count: ${formatNumber(totalCount)}`);
  console.log(`  average: ${formatNumber(totalCount > 0 ? totalSum / totalCount : Number.NaN)} ms`);
}

main().catch((error) => {
  console.error('Failed to calculate average latency:', error);
  process.exit(1);
});