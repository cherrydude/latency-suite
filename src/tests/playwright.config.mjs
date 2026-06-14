import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Dynamischer Zeitstempel für Report-Dateinamen
const now = new Date();
const pad = (n) => n.toString().padStart(2, '0');
const timestamp = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

export default defineConfig({
  // WHY globalSetup: the original spec called `execSync('node login.js')` at
  // top level. Playwright imports each spec once per worker, so with 4
  // workers you get 4 racing logins overwriting the same .auth-state.json.
  // globalSetup runs exactly once, before any worker is spawned.
  // WHY a string path (not require.resolve): the package is ESM
  // ("type": "module"), so the CJS `require` global is unavailable.
  // Playwright resolves the string relative to the config file.
  globalSetup: '../helpers/global-setup.ts',

  testDir: '.',
  // WHY low retries on perf suites: a retry hides a flake but it also hides
  // a real outlier. Prefer 0 retries and investigate every fail.
  retries: 0,

  workers: 1, // Stelle sicher, dass alle Tests/separate Projekte sequenziell laufen
  fullyParallel: false,
  outputDir: path.join(__dirname, 'test-results'),
  use: {
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  reporter: [
    ['list'], // Fügt den List-Reporter hinzu, um die Konsolenausgabe sichtbar zu machen
    // Schreibe den JSON-Report deterministisch neben diese Config-Datei
    ['json', { outputFile: path.join(__dirname, 'test-results', `playwright-report_${timestamp}.json`) }],
    ['./playwright-metrics-reporter.js'], // Metric Reporter wieder eingebunden
  ],
// WHY chromium-only: the original suite skipped Firefox in every test body.
  // Moving the decision into projects deletes 8 duplicated `test.skip` lines
  // and centralises browser policy.
  projects: [
    {
      name: 'Google Chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
    {
      name: 'Microsoft Edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
    // Firefox project deliberately omitted: HighQ's Wijmo grid times out on FF.
  ],

  use: {
    // WHY trace 'retain-on-failure': complements the HAR. Trace shows the
    // Playwright timeline (clicks, asserts, screenshots); HAR shows the
    // network. Together they explain almost any outlier without a re-run.
    trace: 'retain-on-failure',
    // WHY no global recordHar here: each test needs its own path (parallel
    // workers would otherwise overwrite a shared file). The path is set
    // per-test in the `context` fixture override — see helpers/fixtures.ts.
  },
});
