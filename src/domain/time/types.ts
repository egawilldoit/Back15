/**
 * Shared time primitives. All instants are UTC epoch milliseconds and every
 * range is half-open: [startAt, endAt).
 */

export type Millis = number;

export interface TimeRange {
  startAt: Millis;
  endAt: Millis;
}

export type DayKey = string;

export interface LocalDay {
  key: DayKey;
  range: TimeRange;
}
