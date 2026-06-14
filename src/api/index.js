import express from 'express';
import { getLastLatencies } from '../metrics/latency.js';
import { metricsHandler } from '../metrics/prometheus.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// In-Memory-Speicher für Testergebnisse
const testResults = [];

// Beispiel-API-Endpunkt für Testergebnisse
app.post('/api/results', (req, res) => {
  // Testergebnisse speichern
  testResults.push(req.body);
  console.log('Empfangene Testergebnisse:', req.body);
  res.status(201).json({ message: 'Testergebnisse empfangen' });
});

// GET-Endpunkt für Testergebnisse
app.get('/api/results', (req, res) => {
  res.json({ results: testResults });
});

// Latenz-Endpunkt für aktuelle Latenzen aller Browser
app.get('/api/latency', (req, res) => {
  const latencies = getLastLatencies();
  res.json(latencies);
});

// Prometheus-Metrics-Endpunkt
app.get('/metrics', metricsHandler);

// Health-Check-Endpunkt
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`Server läuft auf Port ${port}`);
});
