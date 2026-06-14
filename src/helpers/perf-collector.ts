import type { Page } from '@playwright/test';
import { test } from '@playwright/test';

// WHY addInitScript (not page.evaluate after goto): a PerformanceObserver
// added after navigation misses paint entries on most pages. FCP/LCP fire
// during the *first* paint, so the observer must be wired before any
// navigation begins. addInitScript runs on every new document in the page.
export async function setupDiagnostics(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // WHY `buffered: true`: catches entries that already fired before the
    // observer subscribed. Defensive, in case a redirect produced an early
    // paint we'd otherwise miss.
    (window as any).__vitals = { fcp: 0, lcp: 0, cls: 0 };
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) {
        if (e.entryType === 'largest-contentful-paint') {
          (window as any).__vitals.lcp = e.startTime;
        }
        if (e.entryType === 'paint' && e.name === 'first-contentful-paint') {
          (window as any).__vitals.fcp = e.startTime;
        }
        // WHY filter on hadRecentInput: user-initiated shifts (scroll, click)
        // are not bugs; only spontaneous shifts count toward CLS.
        if (e.entryType === 'layout-shift' && !(e as any).hadRecentInput) {
          (window as any).__vitals.cls += (e as any).value;
        }
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
}

export type PerfMetrics = {
  testName: string;
  browser: string;
  vitals: { fcp: number; lcp: number; cls: number };
  resources: { count: number; totalBytes: number };
  navigation: { ttfb: number; domContentLoaded: number; loadEvent: number };
};

export async function collectPerfMetrics(
  page: Page,
  ctx: { testName: string; browser: string },
): Promise<void> {
  // WHY do the heavy lifting inside the page: avoids N CDP round-trips for
  // resource enumeration, and lets us read the same `performance` entries
  // the browser itself uses.
  const metrics = await page.evaluate(() => {
    const vitals = (window as any).__vitals ?? { fcp: 0, lcp: 0, cls: 0 };
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const nav = (performance.getEntriesByType('navigation')[0] ?? null) as PerformanceNavigationTiming | null;
    return {
      vitals,
      resources: {
        count: resources.length,
        totalBytes: resources.reduce((s, r) => s + (r.transferSize || 0), 0),
      },
      navigation: nav ? {
        ttfb:             nav.responseStart - nav.requestStart,
        domContentLoaded: nav.domContentLoadedEventEnd,
        loadEvent:        nav.loadEventEnd,
      } : { ttfb: 0, domContentLoaded: 0, loadEvent: 0 },
    };
  });

  const payload: PerfMetrics = { ...ctx, ...metrics };
  await test.info().attach('playwright_perf_metrics', {
    body: JSON.stringify(payload, null, 2),
    contentType: 'application/json',
  });
}
