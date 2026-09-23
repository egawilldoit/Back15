import type { Millis, TimeRange } from './types';

export const MINUTE_MS = 60_000;

export function isValidRange(range: TimeRange): boolean {
  return (
    Number.isFinite(range.startAt) &&
    Number.isFinite(range.endAt) &&
    range.endAt > range.startAt
  );
}

export function durationMs(range: TimeRange): Millis {
  return Math.max(0, range.endAt - range.startAt);
}

export function containsInstant(range: TimeRange, instant: Millis): boolean {
  return instant >= range.startAt && instant < range.endAt;
}

export function rangesIntersect(a: TimeRange, b: TimeRange): boolean {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}

export function rangesEqual(a: TimeRange, b: TimeRange): boolean {
  return a.startAt === b.startAt && a.endAt === b.endAt;
}

export function intersectRanges(a: TimeRange, b: TimeRange): TimeRange | null {
  const startAt = Math.max(a.startAt, b.startAt);
  const endAt = Math.min(a.endAt, b.endAt);
  return endAt > startAt ? { startAt, endAt } : null;
}

export function clipRange(range: TimeRange, bounds: TimeRange): TimeRange | null {
  return intersectRanges(range, bounds);
}

export function clampInstant(range: TimeRange, instant: Millis): Millis {
  if (instant < range.startAt) return range.startAt;
  if (instant > range.endAt) return range.endAt;
  return instant;
}

/** Sorts and merges overlapping or touching ranges into disjoint components. */
export function mergeRanges(ranges: readonly TimeRange[]): TimeRange[] {
  const sorted = [...ranges].filter(isValidRange).sort((a, b) => a.startAt - b.startAt);
  const merged: TimeRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.startAt <= last.endAt) {
      if (range.endAt > last.endAt) last.endAt = range.endAt;
    } else {
      merged.push({ startAt: range.startAt, endAt: range.endAt });
    }
  }
  return merged;
}

export function totalDuration(ranges: readonly TimeRange[]): Millis {
  return ranges.reduce((sum, range) => sum + durationMs(range), 0);
}

export function unionDuration(ranges: readonly TimeRange[]): Millis {
  return totalDuration(mergeRanges(ranges));
}

/** Clips every cover to `base`, merges them, and returns uncovered components. */
export function subtractRanges(base: TimeRange, covers: readonly TimeRange[]): TimeRange[] {
  if (!isValidRange(base)) return [];
  const merged = mergeRanges(
    covers
      .map((cover) => intersectRanges(cover, base))
      .filter((cover): cover is TimeRange => cover !== null),
  );
  const gaps: TimeRange[] = [];
  let cursor = base.startAt;
  for (const cover of merged) {
    if (cover.startAt > cursor) gaps.push({ startAt: cursor, endAt: cover.startAt });
    cursor = Math.max(cursor, cover.endAt);
  }
  if (cursor < base.endAt) gaps.push({ startAt: cursor, endAt: base.endAt });
  return gaps;
}

/** The component of `ranges` that contains `instant`, when one exists. */
export function rangeContaining(
  ranges: readonly TimeRange[],
  instant: Millis,
): TimeRange | null {
  for (const range of ranges) {
    if (containsInstant(range, instant)) return range;
  }
  return null;
}
