import client from 'prom-client';
import { getLastLatencies, getLastTTFBs } from './latency.js';

const register = new client.Registry();

// Latenz-Metriken für Chrome, Edge, Firefox definieren
const latencyChrome = new client.Gauge({
  name: 'webapp_latency_chrome_ms',
  help: 'Latenz zur Ziel-Webseite in Millisekunden (Google Chrome)',
});
const latencyMsedge = new client.Gauge({
  name: 'webapp_latency_msedge_ms',
  help: 'Latenz zur Ziel-Webseite in Millisekunden (Microsoft Edge)',
});
const latencyFirefox = new client.Gauge({
  name: 'webapp_latency_firefox_ms',
  help: 'Latenz zur Ziel-Webseite in Millisekunden (Mozilla Firefox)',
});
register.registerMetric(latencyChrome);
register.registerMetric(latencyMsedge);
register.registerMetric(latencyFirefox);

// TTFB-Metriken für Chrome, Edge, Firefox definieren
const ttfbChrome = new client.Gauge({
  name: 'webapp_ttfb_chrome_ms',
  help: 'TTFB zur Ziel-Webseite in Millisekunden (Google Chrome)',
});
const ttfbMsedge = new client.Gauge({
  name: 'webapp_ttfb_msedge_ms',
  help: 'TTFB zur Ziel-Webseite in Millisekunden (Microsoft Edge)',
});
const ttfbFirefox = new client.Gauge({
  name: 'webapp_ttfb_firefox_ms',
  help: 'TTFB zur Ziel-Webseite in Millisekunden (Mozilla Firefox)',
});
register.registerMetric(ttfbChrome);
register.registerMetric(ttfbMsedge);
register.registerMetric(ttfbFirefox);

// Metriken regelmäßig aktualisieren
setInterval(() => {
  const latencies = getLastLatencies();
  if (latencies.chrome !== null) latencyChrome.set(latencies.chrome);
  if (latencies.msedge !== null) latencyMsedge.set(latencies.msedge);
  if (latencies.firefox !== null) latencyFirefox.set(latencies.firefox);

  const ttfbs = getLastTTFBs();
  if (ttfbs.chrome !== null) ttfbChrome.set(ttfbs.chrome);
  if (ttfbs.msedge !== null) ttfbMsedge.set(ttfbs.msedge);
  if (ttfbs.firefox !== null) ttfbFirefox.set(ttfbs.firefox);
}, 10000); // alle 10 Sekunden

export function metricsHandler(req, res) {
  res.set('Content-Type', register.contentType);
  register.metrics().then(metrics => res.end(metrics));
}
