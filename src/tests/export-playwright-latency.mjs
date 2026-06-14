import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Stelle sicher, dass wir immer den Ordner neben dieser Datei nutzen
const reportsDir = path.join(__dirname, 'test-results');
const files = fs.readdirSync(reportsDir)
  .filter(f => f.startsWith('playwright-report_') && f.endsWith('.json'))
  .map(f => ({ file: f, mtime: fs.statSync(path.join(reportsDir, f)).mtime }))
  .sort((a, b) => b.mtime - a.mtime);

if (files.length === 0) {
  console.error('Kein Playwright-Report gefunden!');
  process.exit(1);
}

const latestReport = path.join(reportsDir, files[0].file);
console.log('Nutze Report:', latestReport);

const report = JSON.parse(fs.readFileSync(latestReport, 'utf-8'));

function readSelectorLatencyFromAttachments(result, baseDir) {
  if (!result.attachments) return undefined;
  for (const a of result.attachments) {
    if (a.name === 'selector_latency_ms') {
      if (a.path) {
        const p = path.isAbsolute(a.path) ? a.path : path.join(baseDir, a.path);
        try {
          const v = parseFloat(fs.readFileSync(p, 'utf-8').trim());
          if (!Number.isNaN(v)) return v;
        } catch {}
      }
      if (a.body) {
        try {
          const content = typeof a.body === 'string' ? a.body : a.body.toString('utf-8');
          const v = parseFloat(String(content).trim());
          if (!Number.isNaN(v)) return v;
        } catch {}
      }
    }
  }
  return undefined;
}


function extractMetrics(suite, baseDir) {
  if (suite.specs && suite.specs.length > 0) {
    for (const spec of suite.specs) {
      const testName = spec.title;
      for (const test of spec.tests) {
        const browser = test.projectName;
        const result = test.results && test.results[0];
        if (!result) continue;
        const value = result.status === 'passed' ? result.duration : -1;
        console.log(`playwright_latency{test="${testName}",browser="${browser}"} ${value}`);

        const sel = result.status === 'passed'
          ? readSelectorLatencyFromAttachments(result, baseDir)
          : -1;
        const selectorValue = sel == null ? -1 : sel;
        console.log(`playwright_selector_latency_ms{test="${testName}",browser="${browser}"} ${selectorValue}`);
      }
    }
  }
  if (suite.suites && suite.suites.length > 0) {
    for (const subSuite of suite.suites) {
      extractMetrics(subSuite, baseDir);
    }
  }
}

for (const suite of report.suites) {
  extractMetrics(suite, path.dirname(latestReport));
}
