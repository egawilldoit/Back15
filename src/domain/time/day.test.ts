import { describe, expect, it } from 'vitest';
import { utc } from '../../../tests/support/fixtures';
import {
  addDaysToDayKey,
  formatClockTime,
  formatCompactDurationLabel,
  formatDurationLabel,
  formatFullDate,
  formatWeekday,
  localDayKey,
  localDayWindow,
  localMidnightUtc,
  roundToDisplayMinutes,
  splitRangeByLocalDay,
  timeZoneOffsetMs,
} from './day';

describe('local day windows', () => {
  it('finds UTC midnight for a UTC day', () => {
    expect(localDayWindow('2026-09-22', 'UTC')).toEqual({
      startAt: utc(2026, 9, 22),
      endAt: utc(2026, 9, 23),
    });
  });

  it('maps a local day to UTC instants', () => {
    expect(localDayWindow('2026-09-22', 'America/New_York')).toEqual({
      startAt: utc(2026, 9, 22, 4),
      endAt: utc(2026, 9, 23, 4),
    });
  });

  it('handles the 23-hour spring-forward day', () => {
    const window = localDayWindow('2026-03-08', 'America/New_York');
    expect(window.endAt - window.startAt).toBe(23 * 60 * 60 * 1000);
    expect(window.startAt).toBe(utc(2026, 3, 8, 5));
    expect(window.endAt).toBe(utc(2026, 3, 9, 4));
  });

  it('handles the 25-hour fall-back day', () => {
    const window = localDayWindow('2026-11-01', 'America/New_York');
    expect(window.endAt - window.startAt).toBe(25 * 60 * 60 * 1000);
  });

  it('handles half-hour offsets', () => {
    const window = localDayWindow('2026-09-22', 'Asia/Kolkata');
    expect(window.startAt).toBe(utc(2026, 9, 21, 18, 30));
    expect(window.endAt - window.startAt).toBe(24 * 60 * 60 * 1000);
  });

  it('computes the offset for an instant', () => {
    expect(timeZoneOffsetMs('UTC', utc(2026, 9, 22, 12))).toBe(0);
    expect(timeZoneOffsetMs('America/New_York', utc(2026, 9, 22, 12))).toBe(
      -4 * 60 * 60 * 1000,
    );
    expect(timeZoneOffsetMs('America/New_York', utc(2026, 1, 15, 12))).toBe(
      -5 * 60 * 60 * 1000,
    );
  });

  it('derives a day key from an instant', () => {
    expect(localDayKey(utc(2026, 9, 22, 23, 30), 'UTC')).toBe('2026-09-22');
    expect(localDayKey(utc(2026, 9, 23, 1, 30), 'America/New_York')).toBe('2026-09-22');
    expect(localDayKey(utc(2026, 9, 23, 5, 30), 'America/New_York')).toBe('2026-09-23');
  });

  it('adds days across month and year boundaries', () => {
    expect(addDaysToDayKey('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDaysToDayKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToDayKey('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('splits a midnight-crossing range into per-day slices', () => {
    const range = { startAt: utc(2026, 9, 22, 23), endAt: utc(2026, 9, 23, 1) };
    const slices = splitRangeByLocalDay(range, 'UTC');
    expect(slices.map((slice) => slice.key)).toEqual(['2026-09-22', '2026-09-23']);
    const total = slices.reduce((sum, slice) => sum + (slice.range.endAt - slice.range.startAt), 0);
    expect(total).toBe(2 * 60 * 60 * 1000);
  });

  it('keeps a DST fall-back hour inside one local day', () => {
    const range = { startAt: utc(2026, 11, 1, 4), endAt: utc(2026, 11, 1, 6) };
    const slices = splitRangeByLocalDay(range, 'America/New_York');
    expect(slices).toHaveLength(1);
    expect(slices[0].range.endAt - slices[0].range.startAt).toBe(2 * 60 * 60 * 1000);
  });
});

describe('display formatting', () => {
  it('formats clock times without seconds', () => {
    expect(formatClockTime(utc(2026, 9, 22, 9, 3, 20), 'UTC')).toBe('09:03');
    expect(formatClockTime(utc(2026, 9, 22, 0, 5), 'UTC')).toBe('00:05');
    expect(formatClockTime(utc(2026, 9, 22, 12, 0), 'America/New_York')).toBe('08:00');
  });

  it('rounds totals once, after summing', () => {
    const threeEntries = 3 * (7 * 60_000 + 40_000);
    expect(roundToDisplayMinutes(threeEntries)).toBe(23);
    expect(roundToDisplayMinutes(60_000 * 7.5)).toBe(8);
  });

  it('labels durations for the ledger', () => {
    expect(formatDurationLabel(45 * 60_000)).toBe('45 min');
    expect(formatDurationLabel(60 * 60_000)).toBe('1 h');
    expect(formatDurationLabel(65 * 60_000)).toBe('1 h 05 min');
    expect(formatDurationLabel(0)).toBe('0 min');
  });

  it('splits the weekday from the full date for the editorial heading', () => {
    const instant = utc(2026, 9, 23, 10, 28);
    expect(formatWeekday(instant, 'UTC')).toBe('Wednesday');
    expect(formatFullDate(instant, 'UTC')).toBe('23 September 2026');
  });

  it('labels compact ledger durations', () => {
    expect(formatCompactDurationLabel(45 * 60_000)).toBe('45m');
    expect(formatCompactDurationLabel(60 * 60_000)).toBe('1h');
    expect(formatCompactDurationLabel(65 * 60_000)).toBe('1h 05m');
    expect(formatCompactDurationLabel(0)).toBe('0m');
  });

  it('returns local midnight for a day key', () => {
    expect(localMidnightUtc('2026-09-22', 'UTC')).toBe(utc(2026, 9, 22));
  });
});
