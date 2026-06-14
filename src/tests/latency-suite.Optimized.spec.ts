/*
 * Hilex latency suite.
 *
 * Conventions (enforced by ../helpers/fixtures.ts):
 *   - Every test produces exactly one of:
 *       selector_latency_ms      (post-navigation render time)
 *       playwright_latency_ms    (wall-clock end-to-end)
 *   - Plus one playwright_perf_metrics JSON with vitals + resources.
 *   - HAR is attached only on failure or when a budget is exceeded.
 */
import { test, expect, reportLatency } from '../helpers/fixtures';
import { TIMEOUTS } from './timeouts';
import { startTimer } from '../helpers/latency';
import { setupDiagnostics, collectPerfMetrics } from '../helpers/perf-collector';

test.beforeEach(async ({ page }) => {
  // WHY before each test (not in fixture): setupDiagnostics installs an
  // init script that captures FCP/LCP from the first paint. Doing it in
  // beforeEach keeps the per-test contract explicit and easy to grep for.
  await setupDiagnostics(page);
});

const HILEX = {
  alleSpalten:   'https://hilex.sruv.de/soep/sheetHome.action?metaData.siteID=19&metaData.sheetId=6&metaData.sheetViewID=14&isDraftView=0',
  sachverhalt: 'https://hilex.sruv.de/soep/sheetHome.action?metaData.siteID=19&metaData.sheetId=6&metaData.sheetViewID=355',
  telefonie: 'https://hilex.sruv.de/soep/sheetHome.action?metaData.siteID=19&metaData.sheetId=6&metaData.sheetViewID=11172&isDraftView=05',
  falladminBoard: 'https://hilex.sruv.de/soep/siteCustomPage.action?metaData.siteID=19&metaData.customPageID=106',
  eaSeBoard: 'https://hilex.sruv.de/soep/siteCustomPage.action?metaData.siteID=19&metaData.customPageID=147',
  schliBoard: 'https://hilex.sruv.de/soep/siteCustomPage.action?metaData.siteID=19&metaData.customPageID=106',
  performanceISheetAlleSpalten: 'https://hilex.sruv.de/soep/sheetHome.action?metaData.siteID=19&metaData.parentFolderID=0&metaData.sheetId=163841&indexPage=true&forcelyGridOpen=false&modalCounter=',
  performanceISheetSachverhalt: 'https://hilex.sruv.de/soep/sheetHome.action?metaData.siteID=19&metaData.sheetId=163841&metaData.sheetViewID=417035&isDraftView=0',
  performanceISheetTelefonie: 'https://hilex.sruv.de/soep/sheetHome.action?metaData.siteID=19&metaData.sheetId=163841&metaData.sheetViewID=417036&isDraftView=0',

} as const;

// ───1st iSheet grid views ──────────────────────────────────────────────────────
test.describe('hilex iSheet: Datenbank', () => {
  // WHY a per-suite budget override: iSheet's Wijmo grid is genuinely slower
  // than the dashboards. A single global budget would either over-trigger HAR
  // retention here or under-trigger it elsewhere.
  test.use({ latencyBudget: { selectorMs: 30_000, navigationMs: 25_000 } });

  test('Datenbank: Alle Spalten Ansicht', async ({ page, recordedLatencyMs }) => {
    test.setTimeout(TIMEOUTS.xl);

    // WHY define locator first, time it second: keeps the timed region tight
    // and removes any locator-construction cost from the metric.
    const firstRowLink = page
      .locator('div.wj-cell[role="gridcell"][aria-colindex="4"] a[title="SRUV"]', { hasText: 'SRUV' })
      .first();

    const elapsed = startTimer();
    // WHY waitUntil 'commit': resolves the instant headers arrive, so the
    // timer keeps running through HTML parse + JS bootstrap + Wijmo render.
    // Default 'load' would have already counted parse/subresource cost on
    // the *other* side of t0, splitting one duration across two halves.
    await page.goto(HILEX.alleSpalten, { waitUntil: 'commit' });
    await expect(firstRowLink).toBeVisible({ timeout: TIMEOUTS.xl });
    const ms = elapsed();

    // WHY reportLatency from fixtures (not helpers/latency): this overload
    // writes the attachment *and* mutates the shared slot the HAR fixture
    // reads to decide retention. One call, both effects.
    await reportLatency('selector', ms, recordedLatencyMs);

    // WHY no extra `toBeVisible` after `toBeVisible`: the review flagged
    // these as no-ops that cost up to 5s on failure. The first assertion
    // is sufficient. Keep `toHaveText` only because text can mutate after
    // initial paint (Wijmo sometimes lazy-renders cell content).
    await expect(firstRowLink).toHaveText(/^\s*SRUV\s*$/);

    await collectPerfMetrics(page, {
      testName: 'Datenbank: Alle Spalten Ansicht',
      browser: test.info().project.name,
    });
  });

  test('Datenbank: Sachverhalt Ansicht', async ({ page, recordedLatencyMs }) => {
    test.setTimeout(TIMEOUTS.xl);

    // WHY define locator first, time it second: keeps the timed region tight
    // and removes any locator-construction cost from the metric.
    const gridCell = page
      .locator('div.wj-cell[role="gridcell"][aria-colindex="5"] a[title="SRUV"]', { hasText: 'SRUV' })
      .first();

    const elapsed = startTimer();
    // WHY waitUntil 'commit': resolves the instant headers arrive, so the
    // timer keeps running through HTML parse + JS bootstrap + Wijmo render.
    await page.goto(HILEX.sachverhalt, { waitUntil: 'commit' });
    await expect(gridCell).toBeVisible({ timeout: TIMEOUTS.xl });
    const ms = elapsed();

    // WHY reportLatency from fixtures (not helpers/latency): this overload
    // writes the attachment *and* mutates the shared slot the HAR fixture
    // reads to decide retention. One call, both effects.
    await reportLatency('selector', ms, recordedLatencyMs);

    // WHY no extra `toBeVisible` after `toBeVisible`: the review flagged
    // these as no-ops that cost up to 5s on failure. The first assertion
    // is sufficient. Keep `toHaveText` only because text can mutate after
    // initial paint (Wijmo sometimes lazy-renders cell content).
    await expect(gridCell).toHaveText(/^\s*SRUV\s*$/);    

    await collectPerfMetrics(page, {
      testName: 'Datenbank: Sachverhalt Ansicht',
      browser: test.info().project.name,
    });
  });

  test('Datenbank: Telefonie Ansicht', async ({ page, recordedLatencyMs }) => {
    test.setTimeout(TIMEOUTS.xl);

    // WHY define locator first, time it second: keeps the timed region tight
    // and removes any locator-construction cost from the metric.
    const gridCell = page
      .locator('div.wj-cell[role="gridcell"][aria-colindex="4"] a[title="SRUV"]', { hasText: 'SRUV' })
      .first();

    const elapsed = startTimer();
    // WHY waitUntil 'commit': resolves the instant headers arrive, so the
    // timer keeps running through HTML parse + JS bootstrap + Wijmo render.
    await page.goto(HILEX.telefonie, { waitUntil: 'commit' });
    await expect(gridCell).toBeVisible({ timeout: TIMEOUTS.xl });
    const ms = elapsed();

    // WHY reportLatency from fixtures (not helpers/latency): this overload
    // writes the attachment *and* mutates the shared slot the HAR fixture
    // reads to decide retention. One call, both effects.
    await reportLatency('selector', ms, recordedLatencyMs);

    // WHY no extra `toBeVisible` after `toBeVisible`: the review flagged
    // these as no-ops that cost up to 5s on failure. The first assertion
    // is sufficient. Keep `toHaveText` only because text can mutate after
    // initial paint (Wijmo sometimes lazy-renders cell content).
    await expect(gridCell).toHaveText(/^\s*SRUV\s*$/);    

    await collectPerfMetrics(page, {
      testName: 'Datenbank: Telefonie Ansicht',
      browser: test.info().project.name,
    });
  });
});

// ─── 2nd iSheet grid view ──────────────────────────────────────────
test.describe('hilex iSheet: PerformanceTest', () => {
  // WHY a per-suite budget override: iSheet's Wijmo grid is genuinely slower
  // than the dashboards. A single global budget would either over-trigger HAR
  // retention here or under-trigger it elsewhere.
  test.use({ latencyBudget: { selectorMs: 15_000, navigationMs: 25_000 } });

  test('PerformanceTest: Alle Spalten Ansicht', async ({ page, recordedLatencyMs }) => {
    test.setTimeout(TIMEOUTS.xl);

    // WHY define locator first, time it second: keeps the timed region tight
    // and removes any locator-construction cost from the metric.
    const firstRowLink = page
      .locator('div.wj-cell[role="gridcell"][aria-colindex="2"] a[title="Svenja Meier"]', { hasText: 'Svenja Meier' })
      .first();

    const elapsed = startTimer();
    // WHY waitUntil 'commit': resolves the instant headers arrive, so the
    // timer keeps running through HTML parse + JS bootstrap + Wijmo render.
    // Default 'load' would have already counted parse/subresource cost on
    // the *other* side of t0, splitting one duration across two halves.
    await page.goto(HILEX.performanceISheetAlleSpalten, { waitUntil: 'commit' });
    await expect(firstRowLink).toBeVisible({ timeout: TIMEOUTS.xl });
    const ms = elapsed();

    // WHY reportLatency from fixtures (not helpers/latency): this overload
    // writes the attachment *and* mutates the shared slot the HAR fixture
    // reads to decide retention. One call, both effects.
    await reportLatency('selector', ms, recordedLatencyMs);

    // WHY no extra `toBeVisible` after `toBeVisible`: the review flagged
    // these as no-ops that cost up to 5s on failure. The first assertion
    // is sufficient. Keep `toHaveText` only because text can mutate after
    // initial paint (Wijmo sometimes lazy-renders cell content).
    await expect(firstRowLink).toHaveText(/^\s*Svenja Meier\s*$/);

    await collectPerfMetrics(page, {
      testName: 'PerformanceTest: Alle Spalten Ansicht',
      browser: test.info().project.name,
    });
  });

  test('PerformanceTest: Sachverhalt Ansicht', async ({ page, recordedLatencyMs }) => {
    test.setTimeout(TIMEOUTS.xl);

    // WHY define locator first, time it second: keeps the timed region tight
    // and removes any locator-construction cost from the metric.
    const gridCell = page
      .locator('div.wj-cell[role="gridcell"][aria-colindex="2"]', { hasText: 'Test1' })
      .first();

    const elapsed = startTimer();
    // WHY waitUntil 'commit': resolves the instant headers arrive, so the
    // timer keeps running through HTML parse + JS bootstrap + Wijmo render.
    await page.goto(HILEX.performanceISheetSachverhalt, { waitUntil: 'commit' });
    await expect(gridCell).toBeVisible({ timeout: TIMEOUTS.xl });
    const ms = elapsed();

    // WHY reportLatency from fixtures (not helpers/latency): this overload
    // writes the attachment *and* mutates the shared slot the HAR fixture
    // reads to decide retention. One call, both effects.
    await reportLatency('selector', ms, recordedLatencyMs);

    // WHY no extra `toBeVisible` after `toBeVisible`: the review flagged
    // these as no-ops that cost up to 5s on failure. The first assertion
    // is sufficient. Keep `toHaveText` only because text can mutate after
    // initial paint (Wijmo sometimes lazy-renders cell content).
    await expect(gridCell).toHaveText(/^\s*Test1\s*$/);

    await collectPerfMetrics(page, {
      testName: 'PerformanceTest: Sachverhalt Ansicht',
      browser: test.info().project.name,
    });
  });

  test('PerformanceTest: Telefonie Ansicht', async ({ page, recordedLatencyMs }) => {
    test.setTimeout(TIMEOUTS.xl);

    // WHY define locator first, time it second: keeps the timed region tight
    // and removes any locator-construction cost from the metric.
    const gridCell = page
      .locator('div.wj-cell[role="gridcell"][aria-colindex="2"]', { hasText: 'Test1' })
      .first();

    const elapsed = startTimer();
    // WHY waitUntil 'commit': resolves the instant headers arrive, so the
    // timer keeps running through HTML parse + JS bootstrap + Wijmo render.
    await page.goto(HILEX.performanceISheetTelefonie, { waitUntil: 'commit' });
    await expect(gridCell).toBeVisible({ timeout: TIMEOUTS.xl });
    const ms = elapsed();

    // WHY reportLatency from fixtures (not helpers/latency): this overload
    // writes the attachment *and* mutates the shared slot the HAR fixture
    // reads to decide retention. One call, both effects.
    await reportLatency('selector', ms, recordedLatencyMs);

    // WHY no extra `toBeVisible` after `toBeVisible`: the review flagged
    // these as no-ops that cost up to 5s on failure. The first assertion
    // is sufficient. Keep `toHaveText` only because text can mutate after
    // initial paint (Wijmo sometimes lazy-renders cell content).
    await expect(gridCell).toHaveText(/^\s*Test1\s*$/);

    await collectPerfMetrics(page, {
      testName: 'PerformanceTest: Telefonie Ansicht',
      browser: test.info().project.name,
    });
  });
});

// ─── Example 2: a dashboard + a viewer that can render to multiple targets ──
/* test.describe('hilex dashboards', () => {
  test('EaSe-Admin Dashboard', async ({ page, recordedLatencyMs }) => {
    test.setTimeout(TIMEOUTS.long);

    const axisLabel = page.locator('svg text', { hasText: 'MGU Verkehrsträger' });

    const elapsed = startTimer();
    await page.goto(HILEX.eaSeBoard, { waitUntil: 'commit' });
    await expect(axisLabel).toBeVisible({ timeout: TIMEOUTS.long });
    await reportLatency('selector', elapsed(), recordedLatencyMs);

    await collectPerfMetrics(page, {
      testName: 'EaSe-Admin Dashboard',
      browser: test.info().project.name,
    });
  });

  test('PDF opens in one of several viewers', async ({ page, recordedLatencyMs }) => {
    test.setTimeout(TIMEOUTS.long);

    await page.goto(
      'https://hilex.sruv.de/soep/documentHome.action?metaData.siteID=49329&metaData.parentFolderID=595944',
      { waitUntil: 'domcontentloaded' }, // WHY domcontentloaded: we wait for a
      // static link that's in the initial DOM; no need to wait on the doc-list's
      // thumbnails. 'commit' would also work, 'load' would over-wait.
    );

    const docLink = page.locator('a#docid_757901');
    await expect(docLink).toBeVisible({ timeout: TIMEOUTS.medium });

    // WHY locator.or(): the original used Promise.race over four
    // waitForSelector calls with 20-minute timeouts. After the race resolved,
    // the three losers kept polling the page via CDP every ~50ms for the
    // remaining 19 minutes 59 seconds, burning CPU and polluting the
    // subsequent perf-metric reading. locator.or() is one Playwright wait
    // that resolves on the first match and *cancels the others cleanly*.
    const viewer = page
      .locator('#FILE_MODULE_ADEPTOL svg rect[fill="#FFFFFF"]')
      .or(page.locator('canvas[aria-label="Page 1"]'))
      .or(page.locator('iframe[src*="pdf"]'))
      .first(); // WHY .first(): or() can match multiple; .first() avoids a
                // strict-mode violation when two viewers race to appear.

    const elapsed = startTimer();
    await docLink.click();
    // WHY navigation kind here: this is wall-clock from user click to viewer
    // visible — what the user actually feels. Selector kind is for tests
    // that measure post-navigation render only.
    await expect(viewer).toBeVisible({ timeout: TIMEOUTS.long });
    await reportLatency('navigation', elapsed(), recordedLatencyMs);

    await collectPerfMetrics(page, {
      testName: 'PDF öffnen',
      browser: test.info().project.name,
    });
  });
} );*/
