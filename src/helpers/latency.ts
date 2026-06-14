import { test } from '@playwright/test';
import { performance } from 'node:perf_hooks';
import fs from 'node:fs';

// WHY one helper, two kinds: the review's #1 issue was that the doc-comment
// promised `playwright_latency` from three tests that emitted nothing. By
// centralising the contract here, every test that calls reportLatency() is
// guaranteed to produce exactly one attachment with a predictable name.
export type LatencyKind = 'selector' | 'navigation';

const ATTACHMENT_NAME: Record<LatencyKind, string> = {
  selector:   'selector_latency_ms',
  navigation: 'playwright_latency_ms',
};

export async function reportLatency(kind: LatencyKind, ms: number): Promise<void> {
  const name = ATTACHMENT_NAME[kind];
  const file = test.info().outputPath(`${name}.txt`);
  // WHY Math.round: keeps the file format integer-millisecond, matching
  // Prometheus's preference and the existing exporter contract.
  fs.writeFileSync(file, String(Math.round(ms)));
  await test.info().attach(name, { path: file, contentType: 'text/plain' });
}

// WHY a tiny wrapper around performance.now(): every measurement goes through
// the same monotonic clock. Date.now() is wall-clock — on a VM CI runner an
// NTP step during a long await can produce negative deltas that poison P95s.
// performance.now() is monotonic by spec.
export function startTimer(): () => number {
  const t0 = performance.now();
  return () => performance.now() - t0;
}
