#!/usr/bin/env node
/**
 * Generate aggregated report from Prometheus metrics (Playwright).
 * Outputs CSV and JSON summaries grouped by test+browser.
 *
 * Usage examples (Windows PowerShell):
 *   node reports/generate-report.js --from "2026-01-17T00:00:00Z" --to "2026-01-20T00:00:00Z" --step 600 --prom "http://localhost:9090"
 *   node reports/generate-report.js --days 7
 * 
 * Metrics and abbreviations:
test: Name des getesteten Szenarios.
browser: Browser/Projekt, unter dem der Test lief.
runs: Anzahl der Messpunkte im gewählten Zeitraum.
latency_avg_ms: Durchschnittliche End‑to‑End‑Testdauer (ms) aus der Playwright‑Latenzmetrik.
latency_p95_ms: 95‑Perzentil der End‑to‑End‑Testdauer (ms), zeigt typische Worst‑Case‑Latenz.
ttfb_avg_ms: Time‑to‑First‑Byte (ms) aus Navigation Timing (responseStart − requestStart), Durchschnitt.
ttfb_p95_ms: 95‑Perzentil TTFB (ms).
lcp_avg_ms: Largest Contentful Paint (ms) via PerformanceObserver, Durchschnitt.
lcp_p95_ms: 95‑Perzentil LCP (ms).
cls_max: Maximale Cumulative Layout Shift (dimensionslos, je kleiner desto stabiler).
requests_avg: Durchschnittliche Anzahl Netzwerk‑Requests pro Lauf.
requests_sum: Gesamtanzahl Requests über alle Läufe im Zeitraum.
failed_sum: Summe fehlgeschlagener Requests (HTTP ≥ 400) im Zeitraum.
transfer_bytes_sum: Summe der übertragenen Bytes (transferSize) im Zeitraum.
encoded_bytes_sum: Summe der codierten Body‑Bytes (encodedBodySize) im Zeitraum.
first_ts: Erster Zeitstempel (Unix‑Sekunden, UTC) im Aggregationsfenster.
last_ts: Letzter Zeitstempel (Unix‑Sekunden, UTC) im Aggregationsfenster.

 *   node reports/generate-report.js --days 7 --views 24h,core,offhours
 *   node reports/generate-report.js --days 7 --by-weekday
 *   node reports/generate-report.js --days 7 --by-day
 *   node reports/generate-report.js --from "2026-01-20T00:00:00Z" --to "2026-01-27T23:59:59Z" --views core --by-day --useUTC
 *
 * Run inside container:
 *   docker compose -f server/grafana/docker-compose.yml exec playwright-server \
 *     node /usr/src/app/reports/generate-report.js --days 7 --views 24h,core,offhours --by-day
  if (m === 'firefox' || m === 'mozilla firefox') return 'Mozilla Firefox';
  if (m === 'chromium' || m === 'google chrome' || m === 'chrome') return 'Google Chrome';
  if (m === 'msedge' || m === 'microsoft edge' || m === 'edge') return 'Microsoft Edge';
 *
 * Flags:
 * --prom <url>           Prometheus‑BasisURL (Default: env PROM_URL oder http://localhost:9090)
 * --from <ISO>           Startzeitpunkt ISO 8601
 * --to <ISO>             Endzeitpunkt ISO 8601
 * --days <n>             Alternativ zum from/to: Zeitfenster der letzten n Tage
 * --step <sec>           Query‑Schrittweite in Sekunden (Default: 600)
 * --views <list>         Kommagetrennt: 24h, core, offhours
 * --useUTC               Interpretiere Stundenfenster in UTC statt Lokalzeit
 * --by-weekday[=true|false]  Gruppiere nach Wochentag (Mon..Sun); Standard: false
 * --by-day[=true|false]      Gruppiere nach Datum (YYYY‑MM‑DD); Standard: false (setzt sich gegenüber --by-weekday durch)
 * --filter-test <regex>  Filtere Tests (PromQL Regex auf Label test)
 * --filter-browser <regex> Filtere Browser (PromQL Regex auf Label browser)
 *
 * Views (Zeitfenster):
 * 24h        00:00–23:59 (alle Werte)
 * core       07:00–16:59 (Start inkl., Ende exkl.)
 * offhours   18:00–23:59 und 00:00–05:59
 *
 * Ausgabe:
 * CSV‑Spalten: test, browser, view, date, weekday, runs, latency_avg_ms, latency_p95_ms,
 *              ttfb_avg_ms, ttfb_p95_ms, lcp_avg_ms, lcp_p95_ms, cls_max,
 *              requests_avg, requests_sum, failed_sum, transfer_bytes_sum, encoded_bytes_sum,
 *              first_ts, last_ts
 * JSON enthält zusätzlich: useUTC, views, byWeekday, byDay und gruppierte Statistiken je View/Bucket.
 * 
 * 
 * 
 */

import fs from 'fs';
import path from 'path';

function normalizeBrowserLabel(b) {
  if (!b) return b;
  const m = String(b).trim().toLowerCase();

  return b;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { prom: process.env.PROM_URL || 'http://localhost:9090', step: 600, useUTC: false, byWeekday: false, byDay: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = args[i + 1];
    if (a === '--prom' && next) { opts.prom = next; i++; }
    else if (a === '--from' && next) { opts.from = next; i++; }
    else if (a === '--to' && next) { opts.to = next; i++; }
    else if (a === '--step' && next) { opts.step = Number(next); i++; }
    else if (a === '--days' && next) { opts.days = Number(next); i++; }
    else if (a === '--filter-test' && next) { opts.filterTest = next; i++; }
    else if (a === '--filter-browser' && next) { opts.filterBrowser = next; i++; }
    else if (a === '--useUTC') { opts.useUTC = true; }
    else if (a === '--by-weekday') {
      if (next && /^(true|false)$/i.test(next)) { opts.byWeekday = next.toLowerCase() === 'true'; i++; }
      else { opts.byWeekday = true; }
    }
    else if (a === '--by-day') {
      if (next && /^(true|false)$/i.test(next)) { opts.byDay = next.toLowerCase() === 'true'; i++; }
      else { opts.byDay = true; }
    }
    else if (a === '--views' && next) { 
      // comma-separated list: 24h,core,offhours
      opts.views = next.split(',').map(s => s.trim()).filter(Boolean);
      i++;
    }
  }
  if (!opts.from || !opts.to) {
    const now = new Date();
    const days = opts.days || 7;
    const from = new Date(now.getTime() - days * 24 * 3600 * 1000);
    opts.from = from.toISOString();
    opts.to = now.toISOString();
  }
  if (!opts.views || opts.views.length === 0) {
    opts.views = ['24h', 'core', 'offhours'];
  }
  return opts;
}

async function fetchRange(prom, expr, from, to, step) {
  const url = `${prom}/api/v1/query_range?query=${encodeURIComponent(expr)}&start=${encodeURIComponent(from)}&end=${encodeURIComponent(to)}&step=${step}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Prometheus error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.status !== 'success') throw new Error(`Prometheus response: ${JSON.stringify(json)}`);
  return json.data.result; // array of series
}

function statsFromValues(values) {
  const nums = values.map(v => Number(v[1])).filter(n => Number.isFinite(n));
  const count = nums.length;
  if (count === 0) return { count: 0, avg: null, min: null, max: null, p50: null, p95: null };
  nums.sort((a, b) => a - b);
  const sum = nums.reduce((a, b) => a + b, 0);
  const avg = sum / count;
  const min = nums[0];
  const max = nums[count - 1];
  const p = (q) => {
    const idx = Math.floor((q / 100) * (count - 1));
    return nums[idx];
  };
  return { count, avg, min, max, p50: p(50), p95: p(95) };
}

function statsFromNumbers(numsIn) {
  const nums = numsIn.filter(n => Number.isFinite(n));
  const count = nums.length;
  if (count === 0) return { count: 0, avg: null, min: null, max: null, p50: null, p95: null };
  nums.sort((a, b) => a - b);
  const sum = nums.reduce((a, b) => a + b, 0);
  const avg = sum / count;
  const min = nums[0];
  const max = nums[count - 1];
  const p = (q) => {
    const idx = Math.floor((q / 100) * (count - 1));
    return nums[idx];
  };
  return { count, avg, min, max, p50: p(50), p95: p(95) };
}

function ensureGroup(map, key, labels) {
  if (!map.has(key)) {
    map.set(key, {
      key,
      test: labels.test || 'unknown',
      browser: labels.browser || 'unknown',
      firstTs: null,
      lastTs: null,
      metrics: {}
    });
  }
  return map.get(key);
}

function updateTimeRange(group, values) {
  if (!values || values.length === 0) return;
  const first = Number(values[0][0]);
  const last = Number(values[values.length - 1][0]);
  group.firstTs = (group.firstTs === null) ? first : Math.min(group.firstTs, first);
  group.lastTs = (group.lastTs === null) ? last : Math.max(group.lastTs, last);
}

function getHour(ts, useUTC) {
  const d = new Date(ts * 1000);
  return useUTC ? d.getUTCHours() : d.getHours();
}

function inCoreHours(ts, useUTC) {
  const h = getHour(ts, useUTC);
  // Core hours: 07:00 inclusive to 17:00 exclusive (07:00–16:59)
  return h >= 7 && h < 17;
}

function inOffHours(ts, useUTC) {
  const h = getHour(ts, useUTC);
  // Off hours: 18:00–23:59 and 00:00–05:59
  return h >= 18 || h < 6;
}

function getWeekdayName(ts, useUTC) {
  const d = new Date(ts * 1000);
  const idx = useUTC ? d.getUTCDay() : d.getDay(); // 0=Sun ... 6=Sat
  const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return names[idx];
}

function getDateStr(ts, useUTC) {
  const d = new Date(ts * 1000);
  if (useUTC) return d.toISOString().slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function main() {
  const opts = parseArgs();
  const { prom, from, to, step, filterTest, filterBrowser, views, useUTC, byWeekday, byDay } = opts;

  const exprs = {
    latency: 'playwright_latency',
    ttfb: 'playwright_ttfb_ms',
    lcp: 'playwright_lcp_ms',
    cls: 'playwright_cls',
    fcp: 'playwright_fcp_ms',
    dcl: 'playwright_domcontentloaded_ms',
    load: 'playwright_load_ms',
    interactive: 'playwright_interactive_ms',
    totalRequests: 'playwright_total_requests',
    failedRequests: 'playwright_failed_requests',
    transferBytes: 'playwright_total_transfer_bytes',
    encodedBytes: 'playwright_total_encoded_bytes'
  };

  const groups = new Map(); // key = `${test}|${browser}`

  for (const [name, baseExpr] of Object.entries(exprs)) {
    const filters = [];
    if (filterTest) filters.push(`test=~"${filterTest}"`);
    if (filterBrowser) filters.push(`browser=~"${filterBrowser}"`);
    const expr = filters.length ? `${baseExpr}{${filters.join(',')}}` : baseExpr;

    const series = await fetchRange(prom, expr, from, to, step);
    for (const s of series) {
      const raw = s.metric || {};
      const labels = { ...raw, browser: normalizeBrowserLabel(raw.browser) };
      const key = `${labels.test || 'unknown'}|${labels.browser || 'unknown'}`;
      const group = ensureGroup(groups, key, labels);
      updateTimeRange(group, s.values);
      // Initialize accumulators by view and bucket (weekday or date)
      if (!group.accViews) group.accViews = {};
      for (const vName of views) {
        if (!group.accViews[vName]) group.accViews[vName] = {};
      }
      if (!group.bucketMeta) group.bucketMeta = {};
      for (const vName of views) { if (!group.bucketMeta[vName]) group.bucketMeta[vName] = {}; }
      // Distribute values into requested views (+ optional weekday/day split)
      for (const [tsStr, valStr] of s.values) {
        const ts = Number(tsStr);
        const val = Number(valStr);
        if (!Number.isFinite(val)) continue;
        const bucketKey = byDay ? getDateStr(ts, useUTC) : (byWeekday ? getWeekdayName(ts, useUTC) : 'all');
        for (const vName of views) {
          if (vName === '24h') {
            if (!group.accViews[vName][bucketKey]) group.accViews[vName][bucketKey] = {};
            if (!group.accViews[vName][bucketKey][name]) group.accViews[vName][bucketKey][name] = [];
            group.accViews[vName][bucketKey][name].push(val);
            if (!group.bucketMeta[vName][bucketKey]) group.bucketMeta[vName][bucketKey] = { date: byDay ? bucketKey : '', weekday: byDay ? getWeekdayName(ts, useUTC) : (byWeekday ? bucketKey : 'all') };
          } else if (vName === 'core') {
            if (inCoreHours(ts, useUTC)) {
              if (!group.accViews[vName][bucketKey]) group.accViews[vName][bucketKey] = {};
              if (!group.accViews[vName][bucketKey][name]) group.accViews[vName][bucketKey][name] = [];
              group.accViews[vName][bucketKey][name].push(val);
              if (!group.bucketMeta[vName][bucketKey]) group.bucketMeta[vName][bucketKey] = { date: byDay ? bucketKey : '', weekday: byDay ? getWeekdayName(ts, useUTC) : (byWeekday ? bucketKey : 'all') };
            }
          } else if (vName === 'offhours') {
            if (inOffHours(ts, useUTC)) {
              if (!group.accViews[vName][bucketKey]) group.accViews[vName][bucketKey] = {};
              if (!group.accViews[vName][bucketKey][name]) group.accViews[vName][bucketKey][name] = [];
              group.accViews[vName][bucketKey][name].push(val);
              if (!group.bucketMeta[vName][bucketKey]) group.bucketMeta[vName][bucketKey] = { date: byDay ? bucketKey : '', weekday: byDay ? getWeekdayName(ts, useUTC) : (byWeekday ? bucketKey : 'all') };
            }
          }
        }
      }
    }
  }

  // finalize stats per group by view
  for (const g of groups.values()) {
    g.metricsViews = {};
    for (const vName of views) {
      const accByBucket = g.accViews?.[vName] || {};
      const metricsByBucket = {};
      for (const [bucket, byMetric] of Object.entries(accByBucket)) {
        const metrics = {};
        for (const [metricName, nums] of Object.entries(byMetric)) {
          metrics[metricName] = statsFromNumbers(nums);
        }
        metricsByBucket[bucket] = metrics;
      }
      g.metricsViews[vName] = metricsByBucket;
    }
  }

  // Prepare CSV
  const rows = [];
  const header = [
    'test','browser','view','date','weekday','runs',
    'latency_avg_ms','latency_p95_ms',
    'ttfb_avg_ms','ttfb_p95_ms',
    'lcp_avg_ms','lcp_p95_ms',
    'cls_max',
    'requests_avg','requests_sum',
    'failed_sum',
    'transfer_bytes_sum','encoded_bytes_sum',
    'first_ts','last_ts'
  ];
  rows.push(header.join(','));

  const toNum = (v) => (v === null || v === undefined) ? '' : (typeof v === 'number' ? v.toFixed(3) : v);

  const weekdayOrder = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  for (const g of groups.values()) {
    for (const vName of views) {
      const byBucket = g.metricsViews[vName] || {};
      const keys = byBucket && Object.keys(byBucket).length > 0 ? Object.keys(byBucket) : ['all'];
      const sortedKeys = byBucket && byBucket['all'] ? ['all'] : (byBucket ? keys.sort((a,b)=>{
        const ai = weekdayOrder.indexOf(a); const bi = weekdayOrder.indexOf(b);
        if (ai === -1 && bi === -1) return a.localeCompare(b);
        if (ai === -1) return 1; if (bi === -1) return -1; return ai - bi;
      }) : keys);
      for (const wk of sortedKeys) {
        const m = byBucket[wk] || {};
        const meta = g.bucketMeta?.[vName]?.[wk] || {};
        const dateStr = meta.date || '';
        const weekdayStr = meta.weekday || (wk === 'all' ? 'all' : wk);
        const runs = m.latency?.count || m.ttfb?.count || m.lcp?.count || 0;
        const requestsSum = m.totalRequests?.count ? m.totalRequests.avg * m.totalRequests.count : '';
        const transferSum = m.transferBytes?.count ? m.transferBytes.avg * m.transferBytes.count : '';
        const encodedSum = m.encodedBytes?.count ? m.encodedBytes.avg * m.encodedBytes.count : '';

        rows.push([
          g.test,
          g.browser,
          vName,
          dateStr,
          weekdayStr,
          runs,
          toNum(m.latency?.avg),
          toNum(m.latency?.p95),
          toNum(m.ttfb?.avg),
          toNum(m.ttfb?.p95),
          toNum(m.lcp?.avg),
          toNum(m.lcp?.p95),
          toNum(m.cls?.max),
          toNum(m.totalRequests?.avg),
          toNum(requestsSum),
          toNum(m.failedRequests?.avg ? m.failedRequests.avg * (m.failedRequests.count || 0) : ''),
          toNum(transferSum),
          toNum(encodedSum),
          g.firstTs,
          g.lastTs
        ].join(','));
      }
    }
  }

  const outDir = path.resolve(process.cwd(), 'reports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const safe = (s) => s.replace(/[:]/g, '').replace(/\./g, '-');
  const baseName = `report_${safe(from)}_${safe(to)}`;

  const csvPath = path.join(outDir, `${baseName}.csv`);
  fs.writeFileSync(csvPath, rows.join('\n'), 'utf-8');

  const jsonPath = path.join(outDir, `${baseName}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({ from, to, step, useUTC, views, byWeekday, byDay, groups: Array.from(groups.values()) }, null, 2), 'utf-8');
}

main().catch(err => {
  console.error('Failed to generate report:', err);
  process.exit(1);
});
