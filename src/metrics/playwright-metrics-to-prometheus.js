// Skript: playwright-metrics-to-prometheus.js
// Führt export-playwright-latency.mjs aus und kopiert die Metriken ins Prometheus-Textfile-Collector-Verzeichnis (mit LF-Zeilenenden)


import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const clientTestsDir = path.resolve(__dirname, '..', 'tests');
const serverCollectorDir = path.resolve(__dirname, '../../grafana/textfile-collector');
const metricsTxt = path.join(clientTestsDir, 'prometheus-metrics.txt');
const metricsProm = path.join(serverCollectorDir, 'prometheus-metrics.prom');
const extraJson = path.join(clientTestsDir, 'extra-metrics.json');

function promLine(name, labelsObj, value) {
  const labels = Object.entries(labelsObj)
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`)
    .join(',');
  return `${name}{${labels}} ${value}\n`;
}

try {
  // 1. Playwright-Metriken exportieren
  execSync('node export-playwright-latency.mjs > prometheus-metrics.txt', { cwd: clientTestsDir, stdio: 'inherit', shell: true });

  // 2. Inhalt mit kleinen Retries einlesen und auf LF konvertieren
  let content = '';
  const maxRetries = 5;
  for (let i = 0; i < maxRetries; i++) {
    if (fs.existsSync(metricsTxt)) {
      content = fs.readFileSync(metricsTxt, 'utf-8');
      if (content && content.trim().length > 0) break;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200); // 200ms warten
  }
  if (!content || content.trim().length === 0) {
    throw new Error('prometheus-metrics.txt ist leer oder fehlt.');
  }
  // Entferne evtl. Debug-Zeile
  content = content.split('\n').filter(line => !line.startsWith('Nutze Report:')).join('\n');
  // Windows-Zeilenenden zu LF
  content = content.replace(/\r\n?/g, '\n');

  // 3. Zusätzliche Metriken aus extra-metrics.json anhängen
  let extra = '';
  if (fs.existsSync(extraJson)) {
    try {
      const arr = JSON.parse(fs.readFileSync(extraJson, 'utf-8'));
      const last = Array.isArray(arr) ? arr.slice(-60) : [];
      for (const m of last) {
        const base = { test: m.test, browser: m.browser };
        if (m.ttfb != null) extra += promLine('playwright_ttfb_ms', base, Math.round(m.ttfb));
        if (m.domContentLoaded != null) extra += promLine('playwright_domcontentloaded_ms', base, Math.round(m.domContentLoaded));
        if (m.loadEvent != null) extra += promLine('playwright_load_ms', base, Math.round(m.loadEvent));
        if (m.interactive != null) extra += promLine('playwright_interactive_ms', base, Math.round(m.interactive));
        if (m.fcp != null) extra += promLine('playwright_fcp_ms', base, Math.round(m.fcp));
        if (m.lcp != null) extra += promLine('playwright_lcp_ms', base, Math.round(m.lcp));
        extra += promLine('playwright_cls', base, Number(m.cls || 0));
        extra += promLine('playwright_total_requests', base, Number(m.totalRequests || 0));
        extra += promLine('playwright_total_transfer_bytes', base, Number(m.totalTransferSize || 0));
        extra += promLine('playwright_total_encoded_bytes', base, Number(m.totalEncodedBodySize || 0));
        extra += promLine('playwright_console_errors', base, Number(m.consoleErrors || 0));
        extra += promLine('playwright_js_errors', base, Number(m.jsErrors || 0));
        extra += promLine('playwright_failed_requests', base, Number(m.failedRequests || 0));
        extra += promLine('playwright_last_run_timestamp', base, Number(m.timestamp || Math.floor(Date.now() / 1000)));
      }
    } catch {}
  }

  // 4. Atomisch in prometheus-metrics.prom schreiben (Textfile Collector Best Practice)
  fs.mkdirSync(serverCollectorDir, { recursive: true });
  const tmpPath = metricsProm + '.tmp';
  const finalContent = content + (content.endsWith('\n') ? '' : '\n') + extra;
  fs.writeFileSync(tmpPath, finalContent, { encoding: 'utf-8' });
  fs.renameSync(tmpPath, metricsProm);
  console.log('Metriken erfolgreich nach', metricsProm, 'kopiert!');
} catch (err) {
  console.error('Fehler beim Exportieren oder Kopieren:', err);
  // Zusatzdiagnose
  try {
    console.error('Arbeitsverzeichnis Tests:', clientTestsDir, 'Inhalt:', fs.readdirSync(clientTestsDir));
    console.error('Collector-Verzeichnis:', serverCollectorDir, 'Zugriff:', fs.existsSync(serverCollectorDir));
  } catch {}
  process.exit(1);
}
