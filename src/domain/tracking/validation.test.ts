import { describe, expect, it } from 'vitest';
import { makeEntry, makeSession, utc } from '../../../tests/support/fixtures';
import {
  MAX_DESCRIPTION_LENGTH,
  findOverlappingEntry,
  validateDescription,
  validateNoOverlap,
  validateRangeInSession,
  validateSessionEnd,
} from './validation';

const t = (hour: number, minute = 0) => utc(2026, 9, 22, hour, minute);

describe('description validation', () => {
  it('trims surrounding whitespace', () => {
    const result = validateDescription('  wrote the report  ');
    expect(result.ok && result.value).toBe('wrote the report');
  });

  it('rejects blank descriptions', () => {
    const result = validateDescription('   ');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_TEXT');
  });

  it('counts Unicode characters, not UTF-16 units', () => {
    const emoji = '🕒'.repeat(MAX_DESCRIPTION_LENGTH);
    expect(emoji.length).toBeGreaterThan(MAX_DESCRIPTION_LENGTH);
    expect(validateDescription(emoji).ok).toBe(true);
    const tooLong = `${emoji}x`;
    const result = validateDescription(tooLong);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.details.length).toBe(MAX_DESCRIPTION_LENGTH + 1);
  });
});

describe('range validation', () => {
  const session = makeSession({ startedAt: t(10) });
  const now = t(11);

  it('accepts a span inside the session', () => {
    expect(validateRangeInSession(session, { startAt: t(10), endAt: t(10, 15) }, now).ok).toBe(
      true,
    );
  });

  it('rejects inverted and empty spans', () => {
    const result = validateRangeInSession(session, { startAt: t(10, 15), endAt: t(10) }, now);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_RANGE');
  });

  it('rejects a span before the session start', () => {
    const result = validateRangeInSession(
      session,
      { startAt: t(9, 55), endAt: t(10, 5) },
      now,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('RANGE_OUTSIDE_SESSION');
  });

  it('rejects a span past the effective end', () => {
    const result = validateRangeInSession(
      session,
      { startAt: t(10, 55), endAt: t(11, 5) },
      now,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('RANGE_OUTSIDE_SESSION');
  });

  it('allows adjacent entries but rejects a one-millisecond overlap', () => {
    const entries = [makeEntry({ sessionId: session.id, startAt: t(10), endAt: t(10, 15) })];
    expect(
      validateNoOverlap(entries, { startAt: t(10, 15), endAt: t(10, 30) }).ok,
    ).toBe(true);
    const overlap = validateNoOverlap(entries, {
      startAt: utc(2026, 9, 22, 10, 14, 59, 999),
      endAt: t(10, 30),
    });
    expect(overlap.ok).toBe(false);
    if (!overlap.ok) {
      expect(overlap.error.code).toBe('RANGE_OVERLAP');
      expect(overlap.error.details.conflictingRange).toEqual({
        startAt: t(10),
        endAt: t(10, 15),
      });
    }
  });

  it('ignores deleted entries and the entry being edited', () => {
    const live = makeEntry({ sessionId: session.id, startAt: t(10), endAt: t(10, 15) });
    const deleted = makeEntry({
      sessionId: session.id,
      startAt: t(10, 15),
      endAt: t(10, 30),
      deletedAt: t(10, 40),
    });
    expect(
      validateNoOverlap([live, deleted], { startAt: t(10, 15), endAt: t(10, 30) }).ok,
    ).toBe(true);
    expect(
      validateNoOverlap([live], { startAt: t(10), endAt: t(10, 20) }, live.id).ok,
    ).toBe(true);
    expect(findOverlappingEntry([live], { startAt: t(10), endAt: t(10, 20) })?.id).toBe(
      live.id,
    );
  });
});

describe('session end validation', () => {
  const session = makeSession({ startedAt: t(10) });

  it('accepts an end after every live entry', () => {
    const entries = [makeEntry({ sessionId: session.id, startAt: t(10), endAt: t(10, 15) })];
    expect(validateSessionEnd(entries, t(10, 30)).ok).toBe(true);
  });

  it('rejects an end before a live entry end', () => {
    const entries = [makeEntry({ sessionId: session.id, startAt: t(10), endAt: t(10, 30) })];
    const result = validateSessionEnd(entries, t(10, 15));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('SESSION_END_BEFORE_ENTRY');
  });

  it('ignores deleted entries', () => {
    const entries = [
      makeEntry({
        sessionId: session.id,
        startAt: t(10),
        endAt: t(10, 30),
        deletedAt: t(10, 40),
      }),
    ];
    expect(validateSessionEnd(entries, t(10, 15)).ok).toBe(true);
  });
});
