import {
  effectiveEndMs,
  latestCompletedBoundary,
} from '../time/boundaries';
import type { BoundarySession } from '../time/boundaries';
import { clipRange, mergeRanges, subtractRanges } from '../time/interval';
import type { Millis, TimeRange } from '../time/types';
import type { Entry, PromptTarget } from './types';

function toBoundarySession(session: {
  startedAt: Millis;
  endedAt: Millis | null;
  reminderWindowEndAt: Millis;
  intervalSeconds: number;
  status: 'active' | 'closed';
}): BoundarySession {
  return session;
}

export function liveEntries(entries: readonly Entry[]): Entry[] {
  return entries.filter((entry) => entry.deletedAt === null);
}

/** Live entry ranges clipped to the session's effective bounds. */
export function coveredRanges(
  session: Parameters<typeof toBoundarySession>[0],
  entries: readonly Entry[],
  now: Millis,
): TimeRange[] {
  const effective = { startAt: session.startedAt, endAt: effectiveEndMs(session, now) };
  const clipped = liveEntries(entries)
    .map((entry) => clipRange({ startAt: entry.startAt, endAt: entry.endAt }, effective))
    .filter((range): range is TimeRange => range !== null);
  return mergeRanges(clipped);
}

/**
 * Completed-time cutoff: the latest completed boundary for an active session,
 * or the session's effective end for a closed one.
 */
export function completedCutoff(
  session: Parameters<typeof toBoundarySession>[0],
  now: Millis,
): Millis {
  const effective = effectiveEndMs(session, now);
  if (session.status === 'closed') return effective;
  const boundary = latestCompletedBoundary(toBoundarySession(session), now);
  if (boundary === null) return session.startedAt;
  return Math.min(boundary, effective);
}

/** Contiguous components of uncovered session time, oldest first. */
export function unresolvedComponents(
  session: Parameters<typeof toBoundarySession>[0],
  entries: readonly Entry[],
  now: Millis,
): TimeRange[] {
  const effective = effectiveEndMs(session, now);
  if (effective <= session.startedAt) return [];
  return subtractRanges(
    { startAt: session.startedAt, endAt: effective },
    coveredRanges(session, entries, now),
  );
}

/** Uncovered components that sit entirely before the completed cutoff. */
export function completedUnresolvedComponents(
  session: Parameters<typeof toBoundarySession>[0],
  entries: readonly Entry[],
  now: Millis,
): TimeRange[] {
  const cutoff = completedCutoff(session, now);
  if (cutoff <= session.startedAt) return [];
  return subtractRanges(
    { startAt: session.startedAt, endAt: cutoff },
    coveredRanges(session, entries, now),
  );
}

/**
 * Check-in target: the newest contiguous completed unresolved span. Older
 * separate gaps are reported for navigation but never forced into one dialog.
 */
export function checkInTarget(
  session: Parameters<typeof toBoundarySession>[0],
  entries: readonly Entry[],
  now: Millis,
): PromptTarget | null {
  const gaps = completedUnresolvedComponents(session, entries, now);
  if (gaps.length === 0) return null;
  const target = gaps[gaps.length - 1];
  const olderGaps = gaps.slice(0, -1).reverse();
  return { range: target, olderGaps };
}

/**
 * Log Now target: the uncovered component ending at the effective end (now),
 * clipped to the current partial interval when older missed time exists.
 */
export function logNowTarget(
  session: Parameters<typeof toBoundarySession>[0],
  entries: readonly Entry[],
  now: Millis,
): PromptTarget | null {
  if (session.status === 'closed') return null;
  const effective = effectiveEndMs(session, now);
  if (effective <= session.startedAt) return null;
  const components = subtractRanges(
    { startAt: session.startedAt, endAt: effective },
    coveredRanges(session, entries, now),
  );
  const ending = components.find((component) => component.endAt === effective);
  if (!ending) return null;
  const cutoff = completedCutoff(session, now);
  const startAt = Math.max(ending.startAt, cutoff);
  if (effective <= startAt) return null;
  const olderGaps =
    ending.startAt < cutoff
      ? subtractRanges(
          { startAt: session.startedAt, endAt: cutoff },
          coveredRanges(session, entries, now),
        ).reverse()
      : [];
  return { range: { startAt, endAt: effective }, olderGaps };
}

/** The unresolved component that contains `instant`, if any. */
export function unresolvedAt(
  session: Parameters<typeof toBoundarySession>[0],
  entries: readonly Entry[],
  now: Millis,
  instant: Millis,
): TimeRange | null {
  for (const component of unresolvedComponents(session, entries, now)) {
    if (instant >= component.startAt && instant < component.endAt) return component;
  }
  return null;
}
