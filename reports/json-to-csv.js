#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = args[i + 1];
    if ((a === '--in' || a === '-i') && next) { opts.in = next; i++; }
    else if ((a === '--out' || a === '-o') && next) { opts.out = next; i++; }
    else if (a === '--views' && next) { opts.views = next.split(',').map(s=>s.trim()).filter(Boolean); i++; }
  }
  if (!opts.in) {
    console.error('Usage: node json-to-csv.js --in <path-to-json> [--out <path-to-csv>] [--views 24h,core,offhours]');
    process.exit(2);
  }
  return opts;
}

function toNum(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '';
  if (typeof v === 'number') return v.toFixed(3);
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(3) : '';
}

function main() {
  const opts = parseArgs();
  const inPath = path.resolve(process.cwd(), opts.in);
  const raw = fs.readFileSync(inPath, 'utf-8');
  const data = JSON.parse(raw);

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
  const rows = [header.join(',')];

  const allViews = new Set();
  for (const g of data.groups || []) {
    if (g.metricsViews) {
      for (const vName of Object.keys(g.metricsViews)) allViews.add(vName);
    }
  }
  const views = opts.views && opts.views.length ? opts.views : Array.from(allViews);

  for (const g of data.groups || []) {
    for (const vName of views) {
      const byBucket = (g.metricsViews && g.metricsViews[vName]) || {};
      const buckets = Object.keys(byBucket);
      if (buckets.length === 0) {
        // still output an empty bucket if none exists
        const m = {};
        const runs = m.latency?.count || m.ttfb?.count || m.lcp?.count || 0;
        const requestsSum = m.totalRequests?.count ? m.totalRequests.avg * m.totalRequests.count : '';
        const transferSum = m.transferBytes?.count ? m.transferBytes.avg * m.transferBytes.count : '';
        const encodedSum = m.encodedBytes?.count ? m.encodedBytes.avg * m.encodedBytes.count : '';
        rows.push([
          g.test, g.browser, vName, '', '', runs,
          toNum(m.latency?.avg), toNum(m.latency?.p95),
          toNum(m.ttfb?.avg), toNum(m.ttfb?.p95),
          toNum(m.lcp?.avg), toNum(m.lcp?.p95),
          toNum(m.cls?.max),
          toNum(m.totalRequests?.avg), toNum(requestsSum),
          toNum(m.failedRequests?.avg ? m.failedRequests.avg * (m.failedRequests.count || 0) : ''),
          toNum(transferSum), toNum(encodedSum),
          g.firstTs, g.lastTs
        ].join(','));
        continue;
      }
      for (const bucket of buckets) {
        const m = byBucket[bucket] || {};
        const meta = (g.bucketMeta && g.bucketMeta[vName] && g.bucketMeta[vName][bucket]) || {};
        const dateStr = meta.date || '';
        const weekdayStr = meta.weekday || (bucket === 'all' ? 'all' : bucket);
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

  const outPath = opts.out ? path.resolve(process.cwd(), opts.out)
    : path.join(path.dirname(inPath), path.basename(inPath).replace(/\.json$/i, '.csv'));
  fs.writeFileSync(outPath, rows.join('\n'), 'utf-8');
  console.log(`Wrote CSV: ${outPath}`);
}

main();
