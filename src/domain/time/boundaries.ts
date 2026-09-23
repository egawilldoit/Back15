import { MINUTE_MS, durationMs } from './interval';
import type { Millis, TimeRange } from './types';

export const DEFAULT_INTERVAL_SECONDS = 900;
export const REMINDER_WINDOW_MS = 12 * 60 * 60 * 1000;
export const MAX_REMINDER_REQUESTS = 48;

export interface BoundarySession {
  startedAt: Millis;
  endedAt: Millis | null;
  reminderWindowEndAt: Millis;
  intervalSeconds: number;
  status: 'active' | 'closed';
}

export function intervalMs(session: BoundarySession): Millis {
  return session.intervalSeconds * 1000;
}

export function isClosed(session: BoundarySession): boolean {
  return session.status === 'closed' && session.endedAt !== null;
}

/** Active sessions stop counting at `now`, bounded by the 12-hour window. */
export function effectiveEndMs(session: BoundarySession, now: Millis): Millis {
  if (session.status === 'closed') {
    return session.endedAt ?? session.startedAt;
  }
  return Math.min(now, session.reminderWindowEndAt);
}

export function effectiveRange(session: BoundarySession, now: Millis): TimeRange {
  return { startAt: session.startedAt, endAt: effectiveEndMs(session, now) };
}

export function isExpired(session: BoundarySession, now: Millis): boolean {
  return session.status === 'active' && now >= session.reminderWindowEndAt;
}

/** Boundary n is `startedAt + n * interval`, anchored to the session start. */
export function plannedBoundaryAt(session: BoundarySession, n: number): Millis {
  return session.startedAt + n * intervalMs(session);
}

export function maxBoundaryIndex(session: BoundarySession): number {
  return Math.floor(
    (session.reminderWindowEndAt - session.startedAt) / intervalMs(session),
  );
}

/** Largest n with boundary n at or before `now` and inside the window; 0 when none. */
export function boundaryIndexAtOrBefore(session: BoundarySession, now: Millis): number {
  const bounded = Math.min(now, session.reminderWindowEndAt);
  const raw = Math.floor((bounded - session.startedAt) / intervalMs(session));
  return Math.max(0, Math.min(raw, maxBoundaryIndex(session)));
}

export function latestCompletedBoundary(
  session: BoundarySession,
  now: Millis,
): Millis | null {
  const index = boundaryIndexAtOrBefore(session, now);
  return index >= 1 ? plannedBoundaryAt(session, index) : null;
}

/** First planned boundary strictly after `now`, or null past the window. */
export function nextPlannedBoundary(
  session: BoundarySession,
  now: Millis,
): Millis | null {
  if (session.status === 'closed') return null;
  const bounded = Math.max(now, session.startedAt);
  if (bounded >= session.reminderWindowEndAt) return null;
  const index = Math.floor((bounded - session.startedAt) / intervalMs(session)) + 1;
  const boundary = plannedBoundaryAt(session, index);
  return boundary <= session.reminderWindowEndAt ? boundary : null;
}

/** Time after the latest completed boundary and before `now`/window end. */
export function currentPartialInterval(
  session: BoundarySession,
  now: Millis,
): TimeRange | null {
  const end = effectiveEndMs(session, now);
  const boundary = latestCompletedBoundary(session, now);
  const start = boundary ?? session.startedAt;
  return end > start ? { startAt: start, endAt: end } : null;
}

/** Every future boundary still inside the reminder window, in order. */
export function futureBoundaries(session: BoundarySession, now: Millis): Millis[] {
  if (session.status === 'closed') return [];
  const bounded = Math.max(now, session.startedAt);
  if (bounded >= session.reminderWindowEndAt) return [];
  const first = Math.floor((bounded - session.startedAt) / intervalMs(session)) + 1;
  const last = maxBoundaryIndex(session);
  const boundaries: Millis[] = [];
  for (let n = first; n <= last && boundaries.length < MAX_REMINDER_REQUESTS; n += 1) {
    boundaries.push(plannedBoundaryAt(session, n));
  }
  return boundaries;
}

export function isCutoffReached(session: BoundarySession, now: Millis): boolean {
  return now >= session.reminderWindowEndAt;
}

/**
 * Latest instant a session may be stopped at: never in the future, never past
 * the 12-hour reminder window.
 */
export function latestAllowedSessionEnd(session: BoundarySession, now: Millis): Millis {
  return Math.min(now, session.reminderWindowEndAt);
}

export type ClockAnomalyKind = 'backward' | 'forward';

export interface ClockAnomaly {
  kind: ClockAnomalyKind;
  observedAt: Millis;
  previousObservedAt: Millis;
}

/**
 * Backward move beyond the one-minute tolerance, or a forward jump beyond the
 * 12-hour window, compared with the last persisted observed wall time.
 */
export function detectClockAnomaly(
  now: Millis,
  previousObservedAt: Millis | null,
): ClockAnomaly | null {
  if (previousObservedAt === null) return null;
  if (now < previousObservedAt - MINUTE_MS) {
    return { kind: 'backward', observedAt: now, previousObservedAt };
  }
  if (now > previousObservedAt + REMINDER_WINDOW_MS) {
    return { kind: 'forward', observedAt: now, previousObservedAt };
  }
  return null;
}

export function sessionWindowDuration(session: BoundarySession): Millis {
  return durationMs({
    startAt: session.startedAt,
    endAt: session.reminderWindowEndAt,
  });
}
