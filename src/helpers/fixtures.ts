import { test as base, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { AUTH_STATE_PATH } from './auth';
import { reportLatency as writeAttachment, type LatencyKind } from './latency';
import type { LatencyBudget } from '../tests/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function formatBerlinStamp(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '00';

  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}-${get('minute')}-${get('second')}`;
}

function sanitizeArchiveName(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

// WHY extend three custom test options:
//   - `latencyBudget` is read by the HAR-retention logic to decide if a run
//     was an outlier. It's a *test option*, so individual tests can override
//     it via test.use({ latencyBudget: { ... } }).
//   - `useAuthState` lets a spec opt out of loading the HighQ session cookie
//     (e.g. the public-SPA demo). Defaults to true; if the auth file is
//     missing the fixture also silently skips it, so demos work out of the box.
//   - `recordedLatencyMs` is *test-level mutable state*: reportLatency()
//     writes here so the context fixture can read it during teardown.
type Fixtures = {
  latencyBudget: LatencyBudget;
  useAuthState: boolean;
  recordedLatencyMs: { selector: number; navigation: number };
};

export const test = base.extend<Fixtures>({
  // WHY `[default, { option: true }]`: marks latencyBudget as a test-level
  // option so it shows up in the HTML report and can be overridden per test.
  latencyBudget: [
    { selectorMs: 8_000, navigationMs: 15_000 },
    { option: true },
  ],

  useAuthState: [true, { option: true }],

  // WHY mutable shared object: latency is recorded inside the test body, but
  // the HAR-retention decision happens in the `context` teardown. We need a
  // place both can see. A plain object passed by reference does the job
  // without storage gymnastics.
  recordedLatencyMs: async ({}, use) => {
    const slot = { selector: 0, navigation: 0 };
    await use(slot);
  },

  // WHY override the built-in `context` fixture: this is the idiomatic
  // Playwright pattern (see docs: "Create Automatic Fixture for Debug Log
  // Attachment"). It guarantees the HAR is started before the test and the
  // attach/cleanup runs after — even if the test throws.
  context: async ({ browser, latencyBudget, useAuthState, recordedLatencyMs }, use, testInfo) => {
    // WHY archive outside test-results: Playwright clears its outputDir per run.
    // A dedicated archive folder keeps HARs across runs like a proper history.
    const harRoot = path.resolve(__dirname, '..', '..', 'har-archive');
    const testName = sanitizeArchiveName(testInfo.title);
    const browserName = sanitizeArchiveName(testInfo.project.name);
    const harDir = path.join(harRoot, `${testName}__${browserName}`);
    const harStamp = formatBerlinStamp();
    //const harStamp = new Date().toISOString().replace(/[:.]/g, '-');
    const harPath = path.join(harDir, `${harStamp}.har.zip`);

    await fs.mkdir(harDir, { recursive: true });

    // Write HAR to the test's temporary output first. Only move it into the
    // persistent archive when the retention policy keeps it (failed || outlier).
    const tmpHarPath = testInfo.outputPath('network.har.zip');

    // WHY existsSync gate: the demo spec runs against a public SPA and the
    // auth file is absent in fresh checkouts. Silently skipping keeps the
    // demo path working without forcing every spec to remember the flag.
    const loadAuth = useAuthState && existsSync(AUTH_STATE_PATH);

    const ctx = await browser.newContext({
      // WHY conditional: HighQ requires this cookie; the TodoMVC demo does
      // not. The same fixture serves both surfaces.
      ...(loadAuth ? { storageState: AUTH_STATE_PATH } : {}),
      recordHar: {
        path: tmpHarPath,
        // WHY mode: 'full': we want timing breakdowns (DNS, connect, SSL,
        // wait, receive). 'minimal' drops timings, which is the whole point.
        mode: 'full',
        // WHY content: 'omit' as default: HighQ HARs would include
        // Authorization headers, session cookies, and request bodies with
        // case data (potentially PII). Timings + URLs + sizes are enough to
        // diagnose nearly every outlier. Override per-test only when actively
        // debugging a body-level issue.
        content: 'omit',
      },
    });

    await use(ctx);

    // WHY await ctx.close() BEFORE attach: Playwright flushes the HAR on
    // context close. Without this await, the file is 0 bytes. This is the
    // single most common mistake when wiring HAR into a fixture.
    await ctx.close();

    // WHY retention rule = failure OR outlier: keeping every HAR turns the
    // report into 100MB+ of noise and you stop opening it. Keep the ones
    // that explain something: failed tests, or runs that exceeded budget.
    const failed  = testInfo.status !== testInfo.expectedStatus;
    const selOver = recordedLatencyMs.selector   > latencyBudget.selectorMs;
    const navOver = recordedLatencyMs.navigation > latencyBudget.navigationMs;
    const outlier = selOver || navOver;

    if (failed || outlier) {
      // Ensure archive dir exists (mkdir earlier may race in some setups).
      await fs.mkdir(harDir, { recursive: true }).catch(() => {});

      // Try to move the temp HAR into the archive. If rename fails (e.g.
      // across filesystems), fall back to copy+unlink.
      try {
        await fs.rename(tmpHarPath, harPath);
      } catch (err) {
        try {
          await fs.copyFile(tmpHarPath, harPath);
          await fs.unlink(tmpHarPath).catch(() => {});
        } catch (err2) {
          // If moving failed, still attempt to attach the temp HAR if it exists.
          // The attach below will fail if the file is missing; swallow errors
          // so teardown doesn't crash the test harness.
        }
      }

      try {
        await testInfo.attach('har', {
          path: harPath,
          contentType: 'application/zip',
        });
      } catch (err) {
        // best-effort attach; ignore failures
      }
    } else {
      // Not retained — delete the temporary HAR if it exists.
      await fs.unlink(tmpHarPath).catch(() => {});
    }
  },
});

export { expect };

// WHY a slightly-different reportLatency on this surface: it writes the
// attachment AND mutates the shared slot so the fixture can read it during
// teardown to decide HAR retention.
export async function reportLatency(
  kind: LatencyKind,
  ms: number,
  slot: Fixtures['recordedLatencyMs'],
): Promise<void> {
  slot[kind] = ms;
  await writeAttachment(kind, ms);
}