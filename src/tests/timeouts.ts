// WHY a single constants block: the review flagged five different magic timeouts
// (60_000 / 90_000 / 120_000 / 180_000 / 1_200_000). 20-minute waits hide real
// perf regressions because the test still "passes" after 18 minutes.
export const TIMEOUTS = {
  short:  30_000,    // dialog / menu appearances
  medium: 60_000,    // typical selector wait
  long:   120_000,   // dashboards and HighQ multi-panel pages
  xl:     180_000,   // iSheet (Wijmo grids are slow on cold cache)
};