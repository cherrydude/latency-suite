# Playwright Server & Latency Testing Suite

Ein umfassendes Playwright-basiertes Test- und Performance-Monitoring-System mit Prometheus-Metriken, Grafana-Dashboards und detaillierten Latenz-Analysen.

## 📋 Übersicht

Dieses Projekt führt automatisierte Browser-Tests durch und erfasst Performance-Metriken in Echtzeit:
- **Latenz-Messungen**: Detaillierte Response-Zeit-Analysen
- **Prometheus-Integration**: Metriken-Collection und -Export
- **Grafana-Dashboards**: Visualisierung der Performance-Daten
- **Automated Testing**: Playwright-basierte End-to-End-Tests
- **Reports**: JSON und CSV-basierte Auswertungen

## 🚀 Quick Start

### Voraussetzungen
- Node.js >= 18
- Docker (optional, für Grafana/Prometheus)
- PowerShell (für Windows-Skripte)

### Installation

```bash
# Abhängigkeiten installieren
npm install

# Umgebungsvariablen konfigurieren
cp src/config/server.env.example src/config/server.env
# Dann server.env anpassen (URLs, Credentials, etc.)
```

### Tests ausführen

```bash
# Alle Tests ausführen
npm run test

# Oder mit bash-Skript
./run-tests.sh

# Latenz-Report generieren
npm run avg:latency
```

### Server starten

```bash
npm start
```

## 📁 Projektstruktur

```
src/
├── api/                      # API-Endpoints
├── auth/                     # Authentifizierung & Login-Tests
│   ├── login.js
│   ├── portal-login.js
│   └── login-state.spec.js
├── config/                   # Konfigurationsdateien
│   └── server.env           # Umgebungsvariablen (nicht gepusht)
├── helpers/                  # Hilfsfunktionen
│   ├── auth.ts              # Auth-Utilities
│   ├── fixtures.ts          # Playwright Fixtures
│   ├── global-setup.ts      # Globale Test-Setup
│   ├── latency.ts           # Latenz-Messungen
│   └── perf-collector.ts    # Performance Collection
├── metrics/                  # Prometheus-Integration
│   ├── prometheus.js
│   └── playwright-metrics-to-prometheus.js
└── tests/                    # Test-Suites
    ├── latency-suite.Optimized.spec.ts  # Haupttest-Suite
    ├── playwright.config.mjs             # Playwright-Konfiguration
    ├── types.d.ts
    └── test-results/        # Generierte Test-Reports (nicht gepusht)

reports/                       # Report-Generierung
├── generate-report.js        # Haupt-Report-Generator
├── average-playwright-latency.js
├── analyze_prometheus_reports.py
└── detailed reports/         # Generierte Reports (nicht gepusht)

grafana/                       # Monitoring & Dashboards
├── docker-compose.yml        # Grafana + Prometheus Stack
├── prometheus.yml            # Prometheus-Konfiguration
├── dashboards/               # Vordefinierte Dashboards
│   ├── latency-dashboard.json
│   ├── performance-views-dashboard.json
│   ├── sruv-trends.json
│   └── ... weitere Dashboards
└── textfile-collector/       # Metriken-Dateien

Dockerfile                     # Container-Image
docker-entrypoint.sh          # Container-Einstiegspunkt
```

## 🔧 Konfiguration

### Umgebungsvariablen (server.env)

```env
# Test-Ziele
TARGET_URL=https://example.com
PORTAL_URL=https://portal.example.com

# Authentifizierung
TEST_USERNAME=your_username
TEST_PASSWORD=your_password

# Performance-Schwellenwerte
LATENCY_THRESHOLD_MS=3000
TIMEOUT_MS=30000

# Prometheus
PROMETHEUS_PUSHGATEWAY=http://localhost:9091
```

## 🧪 Tests ausführen

### Alle Tests
```bash
npm run test
```

### Spezifische Test-Suite
```bash
npx playwright test latency-suite.Optimized.spec.ts
```

### Mit Report
```bash
npx playwright test --reporter=html
```

## 📊 Monitoring & Reports

### Grafana/Prometheus Stack starten

```bash
cd grafana
docker-compose up -d
```

Dann im Browser:
- **Grafana**: http://localhost:3000
- **Prometheus**: http://localhost:9090

### Reports generieren

```bash
# Durchschnittliche Latenz berechnen
npm run avg:latency

# Kompletter Report
npm run report
```

Reports werden in `reports/` gespeichert (JSON + CSV).

## 📈 Verfügbare Dashboards

- **latency-dashboard.json** - Latenz-Trends und Statistiken
- **performance-views-dashboard.json** - Performance-Übersicht
- **sruv-trends.json** - Spezifische Trend-Analysen
- **playwright-vs-database-comparison.json** - Vergleiche
- **browser-ranking.json** - Browser-Performance-Vergleich
- **kw-heatmap.json** - Zeitbasierte Heatmaps

## 🐳 Docker

### Image bauen
```bash
docker build -t playwright-server:latest .
```

### Container ausführen
```bash
docker run -it --rm \
  -e TARGET_URL=https://example.com \
  -e TEST_USERNAME=user \
  -e TEST_PASSWORD=pass \
  -v $(pwd)/reports:/app/reports \
  playwright-server:latest
```

## 📝 Skripte

| Skript | Zweck |
|--------|-------|
| `npm run test` | Tests ausführen |
| `npm run start` | Server starten |
| `npm run report` | Detaillierte Reports generieren |
| `npm run avg:latency` | Durchschnittliche Latenz berechnen |
| `./run-tests.sh` | Tests mit Bash ausführen |
| `homeoffice-loop.ps1` | Endlosschleife für Homeoffice-Tests |

## 🔒 Sicherheit

- **Credentials**: `server.env` ist in `.gitignore` und wird nicht gepusht
- **Reports**: Generierte Daten sind lokal
- **Docker**: Image kann mit privaten Secrets gebaut werden

## 🛠️ Entwicklung

### Dependencies aktualisieren
```bash
npm update
```

### TypeScript kompilieren
```bash
npx tsc
```

### Linting (falls konfiguriert)
```bash
npm run lint
```

## 📚 Weitere Ressourcen

- [Playwright Dokumentation](https://playwright.dev)
- [Prometheus Docs](https://prometheus.io/docs/)
- [Grafana Dashboards](https://grafana.com/grafana/dashboards)

## 📝 Lizenz

Proprietär - Alle Rechte vorbehalten

## 👤 Support

Für Fragen oder Probleme: Issues im Repository erstellen
