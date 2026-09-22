import { describe, expect, it } from 'vitest';
import {
  clipRange,
  containsInstant,
  durationMs,
  intersectRanges,
  isValidRange,
  mergeRanges,
  rangesIntersect,
  subtractRanges,
  totalDuration,
  unionDuration,
} from './interval';

describe('interval primitives', () => {
  it('treats ranges as half-open [start, end)', () => {
    const range = { startAt: 100, endAt: 200 };
    expect(containsInstant(range, 99)).toBe(false);
    expect(containsInstant(range, 100)).toBe(true);
    expect(containsInstant(range, 199)).toBe(true);
    expect(containsInstant(range, 200)).toBe(false);
  });

  it('rejects empty and inverted ranges', () => {
    expect(isValidRange({ startAt: 5, endAt: 5 })).toBe(false);
    expect(isValidRange({ startAt: 5, endAt: 4 })).toBe(false);
    expect(isValidRange({ startAt: 5, endAt: 6 })).toBe(true);
  });

  it('adjacent ranges touch without overlapping', () => {
    const first = { startAt: 0, endAt: 900_000 };
    const second = { startAt: 900_000, endAt: 1_800_000 };
    expect(rangesIntersect(first, second)).toBe(false);
    expect(unionDuration([first, second])).toBe(1_800_000);
    expect(mergeRanges([first, second])).toEqual([{ startAt: 0, endAt: 1_800_000 }]);
  });

  it('detects a one-millisecond overlap', () => {
    const first = { startAt: 0, endAt: 900_000 };
    const second = { startAt: 899_999, endAt: 1_800_000 };
    expect(rangesIntersect(first, second)).toBe(true);
    expect(mergeRanges([first, second])).toEqual([{ startAt: 0, endAt: 1_800_000 }]);
  });

  it('clips to bounds and intersects', () => {
    expect(clipRange({ startAt: 0, endAt: 100 }, { startAt: 50, endAt: 200 })).toEqual({
      startAt: 50,
      endAt: 100,
    });
    expect(intersectRanges({ startAt: 0, endAt: 50 }, { startAt: 50, endAt: 100 })).toBeNull();
  });

  it('subtracts covers and returns contiguous uncovered components', () => {
    const base = { startAt: 0, endAt: 1_000 };
    expect(subtractRanges(base, [])).toEqual([base]);
    expect(subtractRanges(base, [{ startAt: 200, endAt: 300 }])).toEqual([
      { startAt: 0, endAt: 200 },
      { startAt: 300, endAt: 1_000 },
    ]);
    expect(
      subtractRanges(base, [
        { startAt: 200, endAt: 300 },
        { startAt: 250, endAt: 400 },
      ]),
    ).toEqual([
      { startAt: 0, endAt: 200 },
      { startAt: 400, endAt: 1_000 },
    ]);
    expect(subtractRanges(base, [{ startAt: -100, endAt: 100 }])).toEqual([
      { startAt: 100, endAt: 1_000 },
    ]);
    expect(subtractRanges(base, [base])).toEqual([]);
  });

  it('merges covers before subtracting so overlap is not double counted', () => {
    const base = { startAt: 0, endAt: 900 };
    const gaps = subtractRanges(base, [
      { startAt: 0, endAt: 300 },
      { startAt: 100, endAt: 600 },
    ]);
    expect(gaps).toEqual([{ startAt: 600, endAt: 900 }]);
  });

  it('sums durations without double counting', () => {
    expect(totalDuration([{ startAt: 0, endAt: 100 }])).toBe(100);
    expect(durationMs({ startAt: 100, endAt: 100 })).toBe(0);
    expect(
      unionDuration([
        { startAt: 0, endAt: 100 },
        { startAt: 50, endAt: 150 },
      ]),
    ).toBe(150);
  });
});
