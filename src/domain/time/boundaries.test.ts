import { describe, expect, it } from 'vitest';
import { makeSession, utc } from '../../../tests/support/fixtures';
import {
  currentPartialInterval,
  detectClockAnomaly,
  effectiveEndMs,
  futureBoundaries,
  isExpired,
  latestCompletedBoundary,
  maxBoundaryIndex,
  nextPlannedBoundary,
  plannedBoundaryAt,
  REMINDER_WINDOW_MS,
} from './boundaries';

const START = utc(2026, 9, 22, 9, 3, 20);

function activeSession(nowStart = START) {
  return makeSession({ startedAt: nowStart });
}

describe('anchored boundaries', () => {
  it('keeps boundaries anchored to the session start with seconds intact', () => {
    const session = activeSession();
    expect(plannedBoundaryAt(session, 1)).toBe(utc(2026, 9, 22, 9, 18, 20));
    expect(plannedBoundaryAt(session, 2)).toBe(utc(2026, 9, 22, 9, 33, 20));
    expect(latestCompletedBoundary(session, utc(2026, 9, 22, 9, 22))).toBe(
      utc(2026, 9, 22, 9, 18, 20),
    );
    expect(nextPlannedBoundary(session, utc(2026, 9, 22, 9, 22))).toBe(
      utc(2026, 9, 22, 9, 33, 20),
    );
  });

  it('counts a boundary as completed exactly at its instant', () => {
    const session = activeSession();
    const boundary = utc(2026, 9, 22, 9, 18, 20);
    expect(latestCompletedBoundary(session, boundary - 1)).toBeNull();
    expect(latestCompletedBoundary(session, boundary)).toBe(boundary);
  });

  it('reports no next boundary past the 12-hour window', () => {
    const session = activeSession();
    const windowEnd = START + REMINDER_WINDOW_MS;
    expect(maxBoundaryIndex(session)).toBe(48);
    expect(nextPlannedBoundary(session, windowEnd)).toBeNull();
    expect(futureBoundaries(session, windowEnd)).toEqual([]);
    expect(isExpired(session, windowEnd)).toBe(true);
  });

  it('lists every future boundary in order, bounded to 48', () => {
    const session = activeSession();
    const boundaries = futureBoundaries(session, START);
    expect(boundaries).toHaveLength(48);
    expect(boundaries[0]).toBe(utc(2026, 9, 22, 9, 18, 20));
    expect(boundaries[47]).toBe(START + REMINDER_WINDOW_MS);
  });

  it('never returns a boundary at or before now', () => {
    const session = activeSession();
    const now = utc(2026, 9, 22, 9, 18, 20);
    expect(futureBoundaries(session, now)[0]).toBe(utc(2026, 9, 22, 9, 33, 20));
  });

  it('computes the current partial interval after the latest boundary', () => {
    const session = activeSession();
    const now = utc(2026, 9, 22, 10, 21);
    expect(currentPartialInterval(session, now)).toEqual({
      startAt: utc(2026, 9, 22, 10, 18, 20),
      endAt: now,
    });
  });

  it('uses the session start before the first boundary', () => {
    const session = activeSession();
    const now = utc(2026, 9, 22, 9, 10);
    expect(currentPartialInterval(session, now)).toEqual({ startAt: START, endAt: now });
  });

  it('caps an expired active session at the reminder window', () => {
    const session = activeSession();
    const late = START + 13 * 60 * 60 * 1000;
    expect(effectiveEndMs(session, late)).toBe(START + REMINDER_WINDOW_MS);
    expect(isExpired(session, late)).toBe(true);
  });

  it('uses endedAt for closed sessions regardless of now', () => {
    const endedAt = START + 30 * 60 * 1000;
    const session = makeSession({ startedAt: START, endedAt });
    expect(effectiveEndMs(session, START + 5 * 60 * 60 * 1000)).toBe(endedAt);
    expect(nextPlannedBoundary(session, START)).toBeNull();
    expect(futureBoundaries(session, START)).toEqual([]);
  });
});

describe('clock anomaly detection', () => {
  const now = utc(2026, 9, 22, 10, 0);

  it('ignores normal progress and small jitter', () => {
    expect(detectClockAnomaly(now, now - 30 * 1000)).toBeNull();
    expect(detectClockAnomaly(now, now - 5 * 60 * 60 * 1000)).toBeNull();
  });

  it('flags a backward move beyond one minute', () => {
    const anomaly = detectClockAnomaly(now, now + 2 * 60 * 1000);
    expect(anomaly?.kind).toBe('backward');
  });

  it('allows a backward move inside the tolerance', () => {
    expect(detectClockAnomaly(now, now + 30 * 1000)).toBeNull();
  });

  it('flags a forward jump beyond the 12-hour window', () => {
    const anomaly = detectClockAnomaly(now, now - 13 * 60 * 60 * 1000);
    expect(anomaly?.kind).toBe('forward');
  });

  it('has nothing to compare on first observation', () => {
    expect(detectClockAnomaly(now, null)).toBeNull();
  });
});
