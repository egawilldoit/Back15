import { effectiveEndMs } from '../time/boundaries';
import { isValidRange, rangesIntersect } from '../time/interval';
import type { Millis, TimeRange } from '../time/types';
import { fail, ok } from './errors';
import type { Result } from './errors';
import type { Entry, Session } from './types';

export const MAX_DESCRIPTION_LENGTH = 500;

export function normalizeDescription(raw: string): string {
  return raw.trim();
}

/** Trims and enforces the 500-Unicode-character limit. */
export function validateDescription(raw: string): Result<string> {
  const description = normalizeDescription(raw);
  const length = Array.from(description).length;
  if (length === 0) {
    return fail('INVALID_TEXT', 'Add a short description before saving.');
  }
  if (length > MAX_DESCRIPTION_LENGTH) {
    return fail(
      'INVALID_TEXT',
      `Descriptions can be at most ${MAX_DESCRIPTION_LENGTH} characters.`,
      { length },
    );
  }
  return ok(description);
}

export function sessionBounds(session: Session, now: Millis): TimeRange {
  return { startAt: session.startedAt, endAt: effectiveEndMs(session, now) };
}

export function validateRangeInSession(
  session: Session,
  range: TimeRange,
  now: Millis,
): Result<TimeRange> {
  if (!isValidRange(range)) {
    return fail('INVALID_RANGE', 'The end of a span must come after its start.');
  }
  const bounds = sessionBounds(session, now);
  if (range.startAt < bounds.startAt || range.endAt > bounds.endAt) {
    return fail('RANGE_OUTSIDE_SESSION', 'That span falls outside the session.', {
      sessionId: session.id,
      sessionRange: bounds,
      proposedRange: range,
    });
  }
  return ok(range);
}

export function findOverlappingEntry(
  entries: readonly Entry[],
  range: TimeRange,
  excludeEntryId?: string,
): Entry | null {
  for (const entry of entries) {
    if (entry.deletedAt !== null) continue;
    if (excludeEntryId && entry.id === excludeEntryId) continue;
    if (rangesIntersect({ startAt: entry.startAt, endAt: entry.endAt }, range)) {
      return entry;
    }
  }
  return null;
}

export function validateNoOverlap(
  entries: readonly Entry[],
  range: TimeRange,
  excludeEntryId?: string,
): Result<null> {
  const conflict = findOverlappingEntry(entries, range, excludeEntryId);
  if (conflict) {
    return fail('RANGE_OVERLAP', 'This time already has an entry.', {
      conflictingRange: { startAt: conflict.startAt, endAt: conflict.endAt },
      conflictingEntryId: conflict.id,
    });
  }
  return ok(null);
}

/** Session end cannot move earlier than a live entry's end. */
export function validateSessionEnd(
  entries: readonly Entry[],
  endedAt: Millis,
): Result<Millis> {
  const live = entries.filter((entry) => entry.deletedAt === null);
  const latestEntryEnd = live.reduce(
    (max, entry) => (entry.endAt > max ? entry.endAt : max),
    0,
  );
  if (latestEntryEnd > endedAt) {
    const blocking = live.find((entry) => entry.endAt === latestEntryEnd) ?? null;
    return fail(
      'SESSION_END_BEFORE_ENTRY',
      'An entry ends after the proposed session end.',
      {
        entryEndAt: latestEntryEnd,
        entryId: blocking?.id,
      },
    );
  }
  return ok(endedAt);
}
