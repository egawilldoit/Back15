import { MINUTE_MS, intersectRanges } from './interval';
import type { DayKey, LocalDay, Millis, TimeRange } from './types';

const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function partsToDayKey(year: number, month: number, day: number): DayKey {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(
    day,
    ).padStart(2, '0')}`;
}

export function parseDayKey(dayKey: DayKey): { year: number; month: number; day: number } {
  const match = DAY_KEY_PATTERN.exec(dayKey);
  if (!match) throw new Error(`Invalid day key: ${dayKey}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function addDaysToDayKey(dayKey: DayKey, delta: number): DayKey {
  const { year, month, day } = parseDayKey(dayKey);
  const shifted = new Date(Date.UTC(year, month - 1, day + delta));
  return partsToDayKey(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

export function compareDayKeys(a: DayKey, b: DayKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function zonedParts(timeZone: string, utcMs: number): Record<string, number> {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(new Date(utcMs))) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return parts;
}

/** Offset of `timeZone` from UTC at `utcMs`, in milliseconds. */
export function timeZoneOffsetMs(timeZone: string, utcMs: number): number {
  const whole = Math.floor(utcMs / 1000) * 1000;
  const parts = zonedParts(timeZone, whole);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour % 24,
    parts.minute,
    parts.second,
  );
  return asUtc - whole;
}

export function localDayKey(instant: Millis, timeZone: string): DayKey {
  const parts = zonedParts(timeZone, instant);
  return partsToDayKey(parts.year, parts.month, parts.day);
}

/** UTC instant of local midnight for `dayKey` in `timeZone`. */
export function localMidnightUtc(dayKey: DayKey, timeZone: string): Millis {
  const { year, month, day } = parseDayKey(dayKey);
  const wallClock = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  let guess = wallClock;
  for (let i = 0; i < 3; i += 1) {
    const next = wallClock - timeZoneOffsetMs(timeZone, guess);
    if (next === guess) break;
    guess = next;
  }
  return guess;
}

export function localDayWindow(dayKey: DayKey, timeZone: string): TimeRange {
  return {
    startAt: localMidnightUtc(dayKey, timeZone),
    endAt: localMidnightUtc(addDaysToDayKey(dayKey, 1), timeZone),
  };
}

/** Splits a range into per-local-day intersections, in chronological order. */
export function splitRangeByLocalDay(
  range: TimeRange,
  timeZone: string,
): LocalDay[] {
  if (range.endAt <= range.startAt) return [];
  const slices: LocalDay[] = [];
  let cursorDay = localDayKey(range.startAt, timeZone);
  const lastDay = localDayKey(range.endAt - 1, timeZone);
  for (let i = 0; i < 400; i += 1) {
    const window = localDayWindow(cursorDay, timeZone);
    const clipped = intersectRanges(range, window);
    if (clipped) slices.push({ key: cursorDay, range: clipped });
    if (cursorDay === lastDay) break;
    cursorDay = addDaysToDayKey(cursorDay, 1);
  }
  return slices;
}

function formatParts(
  instant: Millis,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, ...options }).format(
    new Date(instant),
  );
}

/** 24-hour `HH:MM` in the display zone; the UI adds any seconds detail. */
export function formatClockTime(instant: Millis, timeZone: string): string {
  const parts = zonedParts(timeZone, instant);
  const hour = parts.hour % 24;
  return `${String(hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

export function formatClockTimeWithSeconds(instant: Millis, timeZone: string): string {
  const parts = zonedParts(timeZone, instant);
  const hour = parts.hour % 24;
  return `${String(hour).padStart(2, '0')}:${String(parts.minute).padStart(
    2,
    '0',
  )}:${String(parts.second).padStart(2, '0')}`;
}

export function formatWeekday(instant: Millis, timeZone: string): string {
  return formatParts(instant, timeZone, { weekday: 'long' });
}

export function formatFullDate(instant: Millis, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(instant));
}

export function formatDayKeyLabel(dayKey: DayKey, timeZone: string): string {
  const window = localDayWindow(dayKey, timeZone);
  return formatParts(window.startAt, timeZone, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Whole display minutes, rounded once after summing. */
export function roundToDisplayMinutes(ms: Millis): number {
  return Math.round(ms / MINUTE_MS);
}

export function formatDurationLabel(ms: Millis): string {
  const minutes = roundToDisplayMinutes(ms);
  if (minutes <= 0) return '0 min';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${String(rest).padStart(2, '0')} min`;
}

/** Compact ledger value: 45m, 1h, 1h 05m. Rounds once, after summing. */
export function formatCompactDurationLabel(ms: Millis): string {
  const minutes = roundToDisplayMinutes(ms);
  if (minutes <= 0) return '0m';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${String(rest).padStart(2, '0')}m`;
}

export function formatRangeLabel(range: TimeRange, timeZone: string): string {
  return `${formatClockTime(range.startAt, timeZone)}–${formatClockTime(
    range.endAt,
    timeZone,
  )}`;
}

export function timeZoneLabel(instant: Millis, timeZone: string): string {
  const short = formatParts(instant, timeZone, { timeZoneName: 'short' });
  return short;
}

export function currentTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
