import { describe, expect, it } from 'vitest';
import { utc } from '../../../tests/support/fixtures';
import { makeEntry, makeSession } from '../../../tests/support/fixtures';
import { REMINDER_WINDOW_MS } from '../time/boundaries';
import {
  checkInTarget,
  completedCutoff,
  completedUnresolvedComponents,
  coveredRanges,
  logNowTarget,
  unresolvedComponents,
} from './proposals';

const DAY = utc(2026, 9, 22);
const t = (hour: number, minute = 0) => utc(2026, 9, 22, hour, minute);

describe('unresolved time', () => {
  it('returns the whole effective range when nothing is recorded', () => {
    const session = makeSession({ startedAt: t(10) });
    expect(unresolvedComponents(session, [], t(10, 50))).toEqual([
      { startAt: t(10), endAt: t(10, 50) },
    ]);
  });

  it('treats logged and skipped entries as covered', () => {
    const session = makeSession({ startedAt: t(10) });
    const entries = [
      makeEntry({ sessionId: session.id, startAt: t(10), endAt: t(10, 15) }),
      makeEntry({
        sessionId: session.id,
        startAt: t(10, 15),
        endAt: t(10, 30),
        kind: 'skipped',
      }),
    ];
    expect(unresolvedComponents(session, entries, t(10, 50))).toEqual([
      { startAt: t(10, 30), endAt: t(10, 50) },
    ]);
  });

  it('returns deleted time to unresolved', () => {
    const session = makeSession({ startedAt: t(10) });
    const entries = [
      makeEntry({
        sessionId: session.id,
        startAt: t(10),
        endAt: t(10, 15),
        deletedAt: t(10, 20),
      }),
    ];
    expect(coveredRanges(session, entries, t(10, 50))).toEqual([]);
    expect(unresolvedComponents(session, entries, t(10, 50))).toEqual([
      { startAt: t(10), endAt: t(10, 50) },
    ]);
  });

  it('splits separate gaps into separate components', () => {
    const session = makeSession({ startedAt: t(10) });
    const entries = [
      makeEntry({ sessionId: session.id, startAt: t(10), endAt: t(10, 15) }),
      makeEntry({ sessionId: session.id, startAt: t(10, 30), endAt: t(10, 45) }),
    ];
    expect(unresolvedComponents(session, entries, t(11))).toEqual([
      { startAt: t(10, 15), endAt: t(10, 30) },
      { startAt: t(10, 45), endAt: t(11) },
    ]);
  });
});

describe('completed gaps', () => {
  it('offers one consolidated proposal for several ignored reminders', () => {
    const session = makeSession({ startedAt: t(10) });
    const target = checkInTarget(session, [], t(10, 50));
    expect(target?.range).toEqual({ startAt: t(10), endAt: t(10, 45) });
    expect(target?.olderGaps).toEqual([]);
  });

  it('never includes the current partial interval', () => {
    const session = makeSession({ startedAt: t(10) });
    const target = checkInTarget(session, [], t(10, 50));
    expect(target?.range.endAt).toBe(t(10, 45));
    const logNow = logNowTarget(session, [], t(10, 50));
    expect(logNow?.range).toEqual({ startAt: t(10, 45), endAt: t(10, 50) });
    expect(logNow?.olderGaps).toEqual([{ startAt: t(10), endAt: t(10, 45) }]);
  });

  it('offers only the contiguous uncovered component', () => {
    const session = makeSession({ startedAt: t(10) });
    const entries = [makeEntry({ sessionId: session.id, startAt: t(10), endAt: t(10, 20) })];
    const target = checkInTarget(session, entries, t(10, 50));
    expect(target?.range).toEqual({ startAt: t(10, 20), endAt: t(10, 45) });
  });

  it('returns the newest gap first with older gaps counted', () => {
    const session = makeSession({ startedAt: t(10) });
    const entries = [
      makeEntry({ sessionId: session.id, startAt: t(10), endAt: t(10, 15) }),
      makeEntry({ sessionId: session.id, startAt: t(10, 30), endAt: t(10, 45) }),
    ];
    const target = checkInTarget(session, entries, t(11));
    expect(target?.range).toEqual({ startAt: t(10, 45), endAt: t(11) });
    expect(target?.olderGaps).toEqual([{ startAt: t(10, 15), endAt: t(10, 30) }]);
  });

  it('has no completed target before the first boundary', () => {
    const session = makeSession({ startedAt: t(10) });
    expect(checkInTarget(session, [], t(10, 10))).toBeNull();
    expect(completedCutoff(session, t(10, 10))).toBe(t(10));
  });

  it('uses the full closed session as completed time', () => {
    const session = makeSession({ startedAt: t(9), endedAt: t(10) });
    const target = checkInTarget(session, [], t(12));
    expect(target?.range).toEqual({ startAt: t(9), endAt: t(10) });
    expect(logNowTarget(session, [], t(12))).toBeNull();
  });

  it('caps completed time at the 12-hour window', () => {
    const startedAt = utc(2026, 9, 21, 20);
    const session = makeSession({ startedAt });
    const now = utc(2026, 9, 22, 12);
    const gaps = completedUnresolvedComponents(session, [], now);
    expect(gaps).toEqual([
      { startAt: startedAt, endAt: startedAt + REMINDER_WINDOW_MS },
    ]);
    expect(unresolvedComponents(session, [], now)).toEqual(gaps);
  });
});

describe('log now target', () => {
  it('proposes the exact partial span from the last entry to now', () => {
    const session = makeSession({ startedAt: t(10) });
    const entries = [makeEntry({ sessionId: session.id, startAt: t(10), endAt: t(10, 15) })];
    const target = logNowTarget(session, entries, t(10, 22));
    expect(target?.range).toEqual({ startAt: t(10, 15), endAt: t(10, 22) });
    expect(target!.range.endAt - target!.range.startAt).toBe(7 * 60 * 1000);
  });

  it('clips to the current partial interval when older missed time exists', () => {
    const session = makeSession({ startedAt: t(10) });
    const entries = [makeEntry({ sessionId: session.id, startAt: t(10), endAt: t(10, 10) })];
    const target = logNowTarget(session, entries, t(10, 22));
    expect(target?.range).toEqual({ startAt: t(10, 15), endAt: t(10, 22) });
    expect(target?.olderGaps).toEqual([{ startAt: t(10, 10), endAt: t(10, 15) }]);
  });

  it('works before the first boundary', () => {
    const session = makeSession({ startedAt: t(9, 3) });
    const target = logNowTarget(session, [], t(9, 10));
    expect(target?.range).toEqual({ startAt: t(9, 3), endAt: t(9, 10) });
  });

  it('returns nothing when the last entry already covers now', () => {
    const session = makeSession({ startedAt: t(10) });
    const entries = [makeEntry({ sessionId: session.id, startAt: t(10), endAt: t(10, 30) })];
    expect(logNowTarget(session, entries, t(10, 22))).toBeNull();
  });
});
