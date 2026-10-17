type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE";

/** Counts per severity bucket, as returned by the dashboard and scan summaries. */
interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  none: number;
}

/**
 * Sums items into severity buckets.
 * @param items One entry per item, or per group when `count` is given (e.g. a Prisma groupBy row)
 */
export function countBySeverity(
  items: Iterable<{ severity: Severity | null; count?: number }>,
): SeverityCounts {
  const counts: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0, none: 0 };
  for (const { severity, count = 1 } of items) {
    if (severity) {
      counts[severity.toLowerCase() as keyof SeverityCounts] += count;
    }
  }
  return counts;
}
