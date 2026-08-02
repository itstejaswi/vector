// Status of the live aircraft feed, surfaced in the HUD.

import type { DataSource } from "./config.js";

export interface SourceStatus {
  source: DataSource;
  /** Whether the most recent poll succeeded. */
  ok: boolean;
  /** Number of aircraft in the last snapshot. */
  count: number;
  /** Last successful poll (ms epoch), or null. */
  lastOk: number | null;
  /** Human-readable note (e.g. the upstream name, or the last error). */
  message?: string;
}
