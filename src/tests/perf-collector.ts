import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTRA_JSON = path.resolve(__dirname, 'extra-metrics.json');

export async function setupDiagnostics(page: any) {
  (page as any).__diag = { consoleErrors: 0, pageErrors: 0, failedRequests: 0 };
  page.on('console', (msg: any) => {
    if (msg.type() === 'error') (page as any).__diag.consoleErrors++;
  });
  page.on('pageerror', () => (page as any).__diag.pageErrors++);
  page.on('response', (resp: any) => {
    const status = resp.status();
    if (status >= 400) (page as any).__diag.failedRequests++;
  });

  // Web Vitals sammeln (FCP/LCP/CLS) via PerformanceObserver
  await page.addInitScript(() => {
    // @ts-ignore
    window.__webVitals = { fcp: null, lcp: null, cls: 0 };
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // @ts-ignore
          if (entry.name === 'first-contentful-paint' && window.__webVitals.fcp == null) {
            // @ts-ignore
            window.__webVitals.fcp = entry.startTime;
          }
        }
      }).observe({ type: 'paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // @ts-ignore
          window.__webVitals.lcp = entry.startTime;
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const e: any = entry as any;
          if (!e.hadRecentInput) {
            // @ts-ignore
            window.__webVitals.cls += (e.value || 0);
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {}
  });
}

export async function collectPerfMetrics(page: any, { testName, browser }: { testName: string; browser: string; }) {
  const perf = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as any;
    const resources = performance.getEntriesByType('resource') as any[];
    const sorted = resources
      .slice()
      .sort((a, b) => (b.duration || 0) - (a.duration || 0));
    const slowest = sorted.slice(0, 5).map(r => ({ name: r.name, duration: r.duration, transferSize: (r as any).transferSize || 0 }));

    const totals = resources.reduce((acc, r: any) => {
      acc.count++;
      acc.transferSize += (r.transferSize || 0);
      acc.encodedBodySize += (r.encodedBodySize || 0);
      return acc;
    }, { count: 0, transferSize: 0, encodedBodySize: 0 });

    // @ts-ignore
    const vitals = window.__webVitals || { fcp: null, lcp: null, cls: 0 };

    return {
      ttfb: nav ? (nav.responseStart - nav.requestStart) : null,
      domContentLoaded: nav ? (nav.domContentLoadedEventEnd - nav.startTime) : null,
      loadEvent: nav ? (nav.loadEventEnd - nav.startTime) : null,
      interactive: nav ? (nav.domInteractive - nav.startTime) : null,
      totalRequests: totals.count,
      totalTransferSize: totals.transferSize,
      totalEncodedBodySize: totals.encodedBodySize,
      slowestResources: slowest,
      fcp: (vitals as any).fcp,
      lcp: (vitals as any).lcp,
      cls: (vitals as any).cls,
    };
  });

  const diag = (page as any).__diag || { consoleErrors: 0, pageErrors: 0, failedRequests: 0 };
  const result = {
    timestamp: Math.floor(Date.now() / 1000),
    test: testName,
    browser,
    ...perf,
    consoleErrors: diag.consoleErrors,
    jsErrors: diag.pageErrors,
    failedRequests: diag.failedRequests,
  };

  let arr: any[] = [];
  if (fs.existsSync(EXTRA_JSON)) {
    try { arr = JSON.parse(fs.readFileSync(EXTRA_JSON, 'utf-8')); } catch {}
  }
  arr.push(result);
  fs.writeFileSync(EXTRA_JSON, JSON.stringify(arr, null, 2));
  return result;
}
