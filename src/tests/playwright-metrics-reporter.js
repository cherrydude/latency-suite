// playwright-metrics-reporter.js
// Playwright Reporter, der nach dem Testlauf ein externes Skript ausführt

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

export default class PlaywrightMetricsReporter {
  async onEnd() {
    try {
      // Führe das Export-Skript mit absolutem Pfad aus, unabhängig vom CWD
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const scriptPath = path.resolve(__dirname, '../metrics/playwright-metrics-to-prometheus.js');
      execSync(`node "${scriptPath}"`, { stdio: 'inherit' });
    } catch (err) {
      console.error('[PlaywrightMetricsReporter] Fehler beim Ausführen von playwright-metrics-to-prometheus.js:', err);
    }
  }
}
