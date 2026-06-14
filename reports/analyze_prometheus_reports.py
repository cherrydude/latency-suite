import os
import csv
from datetime import datetime
from statistics import mean, pstdev
from typing import Dict, List, Tuple, Optional

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SEARCH_DIRS = [
    os.path.join(ROOT, 'reports_nas'),
    os.path.join(ROOT, 'server', 'reports'),
]

CSV_COLUMNS = [
    'test','browser','view','date','weekday','runs','latency_avg_ms','latency_p95_ms',
    'ttfb_avg_ms','ttfb_p95_ms','lcp_avg_ms','lcp_p95_ms','cls_max','requests_avg',
    'requests_sum','failed_sum','transfer_bytes_sum','encoded_bytes_sum','first_ts','last_ts'
]


def find_latest_csv() -> Optional[str]:
    latest_path = None
    latest_mtime = -1
    for base in SEARCH_DIRS:
        if not os.path.isdir(base):
            continue
        for root, _, files in os.walk(base):
            for f in files:
                if not f.lower().endswith('.csv'):
                    continue
                path = os.path.join(root, f)
                try:
                    mtime = os.path.getmtime(path)
                except OSError:
                    continue
                if mtime > latest_mtime:
                    latest_mtime = mtime
                    latest_path = path
    return latest_path


def parse_csv(path: str) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    with open(path, 'r', newline='', encoding='utf-8') as fh:
        reader = csv.DictReader(fh)
        # Validate columns roughly
        missing = [c for c in CSV_COLUMNS if c not in reader.fieldnames]
        if missing:
            raise ValueError(f"CSV missing expected columns: {missing}")
        for row in reader:
            rows.append(row)
    return rows


def to_float(v: str) -> Optional[float]:
    if v is None:
        return None
    v = v.strip()
    if v == '' or v.lower() == 'nan':
        return None
    try:
        return float(v)
    except ValueError:
        return None


def summarize_by_test(rows: List[Dict[str, str]], view_filter: str = '24h') -> Dict[str, Dict[str, object]]:
    grouped: Dict[str, List[Dict[str, str]]] = {}
    for r in rows:
        if r.get('view') != view_filter:
            continue
        key = r.get('test')
        grouped.setdefault(key, []).append(r)

    summary: Dict[str, Dict[str, object]] = {}
    for test, items in grouped.items():
        lat_avg_list = [to_float(r.get('latency_avg_ms')) for r in items]
        lat_p95_list = [to_float(r.get('latency_p95_ms')) for r in items]
        ttfb_avg_list = [to_float(r.get('ttfb_avg_ms')) for r in items]
        lcp_avg_list = [to_float(r.get('lcp_avg_ms')) for r in items]
        failed_sum_list = [to_float(r.get('failed_sum')) for r in items]

        lat_avg = mean([x for x in lat_avg_list if x is not None]) if any(x is not None for x in lat_avg_list) else None
        lat_p95_avg = mean([x for x in lat_p95_list if x is not None]) if any(x is not None for x in lat_p95_list) else None
        lat_p95_std = pstdev([x for x in lat_p95_list if x is not None]) if sum(1 for x in lat_p95_list if x is not None) > 1 else 0.0
        ttfb_avg = mean([x for x in ttfb_avg_list if x is not None]) if any(x is not None for x in ttfb_avg_list) else None
        lcp_avg = mean([x for x in lcp_avg_list if x is not None]) if any(x is not None for x in lcp_avg_list) else None
        failed_total = sum([x for x in failed_sum_list if x is not None]) if any(x is not None for x in failed_sum_list) else 0

        # Latest day (max date)
        def parse_date(d: str) -> datetime:
            return datetime.strptime(d, '%Y-%m-%d')
        latest_item = max(items, key=lambda r: parse_date(r['date']))

        # Anomalies for p95 (greater than avg + 2*std)
        anomaly_threshold = (lat_p95_avg or 0) + 2 * (lat_p95_std or 0)
        anomalies: List[Tuple[str, float]] = []
        for r in items:
            v = to_float(r.get('latency_p95_ms'))
            if v is not None and v > anomaly_threshold and anomaly_threshold > 0:
                anomalies.append((r.get('date'), v))

        summary[test] = {
            'days': len(items),
            'latency_avg_ms_mean': lat_avg,
            'latency_p95_ms_mean': lat_p95_avg,
            'latency_p95_ms_std': lat_p95_std,
            'ttfb_avg_ms_mean': ttfb_avg,
            'lcp_avg_ms_mean': lcp_avg,
            'failed_sum_total': failed_total,
            'latest': {
                'date': latest_item['date'],
                'latency_avg_ms': to_float(latest_item.get('latency_avg_ms')),
                'latency_p95_ms': to_float(latest_item.get('latency_p95_ms')),
                'ttfb_avg_ms': to_float(latest_item.get('ttfb_avg_ms')),
                'ttfb_p95_ms': to_float(latest_item.get('ttfb_p95_ms')),
                'lcp_avg_ms': to_float(latest_item.get('lcp_avg_ms')),
                'lcp_p95_ms': to_float(latest_item.get('lcp_p95_ms')),
                'failed_sum': to_float(latest_item.get('failed_sum')) or 0,
            },
            'anomalies_p95': anomalies,
        }
    return summary


def render_markdown(latest_csv: str, summary: Dict[str, Dict[str, object]]) -> str:
    lines: List[str] = []
    lines.append(f"Prometheus Report Analysis\n")
    lines.append(f"Source CSV: {latest_csv}\n")
    lines.append("")
    for test, s in sorted(summary.items()):
        lines.append(f"### {test}")
        lines.append(f"- Days: {s['days']}")
        lines.append(f"- Latency avg (mean): {round(s['latency_avg_ms_mean'] or 0, 2)} ms")
        lines.append(f"- Latency p95 (mean): {round(s['latency_p95_ms_mean'] or 0, 2)} ms")
        lines.append(f"- TTFB avg (mean): {round(s['ttfb_avg_ms_mean'] or 0, 2)} ms")
        lines.append(f"- LCP avg (mean): {round(s['lcp_avg_ms_mean'] or 0, 2)} ms")
        lines.append(f"- Failed total: {int(s['failed_sum_total'] or 0)}")
        latest = s['latest']
        lines.append(f"- Latest ({latest['date']}): latency_avg={latest['latency_avg_ms']} ms, p95={latest['latency_p95_ms']} ms, ttfb_avg={latest['ttfb_avg_ms']} ms, lcp_avg={latest['lcp_avg_ms']} ms, failed={int(latest['failed_sum'])}")
        anomalies = s['anomalies_p95']
        if anomalies:
            joined = ", ".join([f"{d}: {int(v)} ms" for d, v in anomalies])
            lines.append(f"- p95 anomalies (> mean + 2σ): {joined}")
        else:
            lines.append(f"- p95 anomalies (> mean + 2σ): none")
        lines.append("")
    return "\n".join(lines)


def main():
    latest_csv = find_latest_csv()
    if not latest_csv:
        print("No CSV reports found.")
        return
    rows = parse_csv(latest_csv)
    summary = summarize_by_test(rows, view_filter='24h')
    md = render_markdown(latest_csv, summary)

    out_dir = os.path.join(ROOT, 'server', 'reports')
    os.makedirs(out_dir, exist_ok=True)
    md_path = os.path.join(out_dir, 'analysis_summary.md')
    with open(md_path, 'w', encoding='utf-8') as fh:
        fh.write(md)
    print(md)


if __name__ == '__main__':
    main()
