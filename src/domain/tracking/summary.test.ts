import { describe, expect, it } from 'vitest';
import { makeEntry, makeSession, utc } from '../../../tests/support/fixtures';
import { localDayWindow, roundToDisplayMinutes } from '../time/day';
import { buildTimeline, summarizeDay, summarizeSession } from './summary';

const t = (hour: number, minute = 0, second = 0) =>
  utc(2026, 9, 22, hour, minute, second);
const MIN = 60_000;

function assertBalance(summary: {
  elapsedMs: number;
  recordedMs: number;
  skippedMs: number;
  unresolvedMs: number;
}) {
  expect(summary.recordedMs + summary.skippedMs + summary.unresolvedMs).toBe(
    summary.elapsedMs,
  );
}

describe('session totals', () => {
  it('keeps recorded + skipped + unresolved equal to elapsed', () => {
    const session = makeSession({ startedAt: t(9, 3, 20) });
    const entries = [
      makeEntry({ sessionId: session.id, startAt: t(9, 3, 20), endAt: t(9, 18, 20) }),
      makeEntry({
        sessionId: session.id,
        startAt: t(9, 18, 20),
        endAt: t(9, 33, 20),
        kind: 'skipped',
      }),
      makeEntry({ sessionId: session.id, startAt: t(9, 33, 20), endAt: t(10, 0) }),
    ];
    const summary = summarizeSession(
      session,
      entries,
      t(11),
      localDayWindow('2026-09-22', 'UTC'),
    );
    expect(summary).not.toBeNull();
    assertBalance(summary!);
    expect(summary!.recordedMs).toBe(41 * MIN + 40_000);
    expect(summary!.skippedMs).toBe(15 * MIN);
    expect(summary!.unresolvedMs).toBe(60 * MIN);
  });

  it('returns a deleted entry to unresolved without changing elapsed', () => {
    const session = makeSession({ startedAt: t(10) });
    const live = makeEntry({
      sessionId: session.id,
      startAt: t(10),
      endAt: t(10, 15),
    });
    const before = summarizeSession(
      session,
      [live],
      t(10, 30),
      localDayWindow('2026-09-22', 'UTC'),
    )!;
    const after = summarizeSession(
      session,
      [{ ...live, deletedAt: t(10, 20) }],
      t(10, 30),
      localDayWindow('2026-09-22', 'UTC'),
    )!;
    assertBalance(after);
    expect(after.elapsedMs).toBe(before.elapsedMs);
    expect(after.recordedMs).toBe(before.recordedMs - 15 * MIN);
    expect(after.unresolvedMs).toBe(before.unresolvedMs + 15 * MIN);
  });

  it('partitions recorded time by category', () => {
    const session = makeSession({ startedAt: t(10) });
    const entries = [
      makeEntry({
        sessionId: session.id,
        startAt: t(10),
        endAt: t(10, 15),
        category: 'work',
      }),
      makeEntry({
        sessionId: session.id,
        startAt: t(10, 15),
        endAt: t(10, 30),
        category: 'learning',
      }),
      makeEntry({
        sessionId: session.id,
        startAt: t(10, 30),
        endAt: t(10, 40),
        category: null,
      }),
    ];
    const summary = summarizeSession(
      session,
      entries,
      t(11),
      localDayWindow('2026-09-22', 'UTC'),
    )!;
    expect(summary.categories.work).toBe(15 * MIN);
    expect(summary.categories.learning).toBe(15 * MIN);
    expect(summary.categories.uncategorized).toBe(10 * MIN);
    expect(summary.recordedMs).toBe(40 * MIN);
  });

  it('excludes off-session time between two sessions on one day', () => {
    const morning = makeSession({ startedAt: t(9), endedAt: t(10) });
    const afternoon = makeSession({ startedAt: t(11), endedAt: t(12) });
    const entries = [
      makeEntry({ sessionId: morning.id, startAt: t(9), endAt: t(9, 30) }),
      makeEntry({ sessionId: afternoon.id, startAt: t(11), endAt: t(11, 30) }),
    ];
    const day = summarizeDay(
      '2026-09-22',
      localDayWindow('2026-09-22', 'UTC'),
      [morning, afternoon],
      entries,
      t(13),
    );
    expect(day.elapsedMs).toBe(2 * 60 * MIN);
    expect(day.recordedMs).toBe(60 * MIN);
    expect(day.unresolvedMs).toBe(60 * MIN);
    assertBalance(day);
  });
});

describe('day projections', () => {
  it('clips a midnight-crossing session into both local days', () => {
    const session = makeSession({
      startedAt: utc(2026, 9, 22, 23),
      endedAt: utc(2026, 9, 23, 1),
    });
    const dayOne = summarizeDay(
      '2026-09-22',
      localDayWindow('2026-09-22', 'UTC'),
      [session],
      [],
      utc(2026, 9, 23, 2),
    );
    const dayTwo = summarizeDay(
      '2026-09-23',
      localDayWindow('2026-09-23', 'UTC'),
      [session],
      [],
      utc(2026, 9, 23, 2),
    );
    expect(dayOne.elapsedMs).toBe(60 * MIN);
    expect(dayTwo.elapsedMs).toBe(60 * MIN);
    expect(dayOne.elapsedMs + dayTwo.elapsedMs).toBe(
      session.endedAt! - session.startedAt,
    );
    assertBalance(dayOne);
    assertBalance(dayTwo);
  });

  it('preserves elapsed time across a spring-forward DST day', () => {
    const session = makeSession({
      startedAt: utc(2026, 3, 8, 5, 30),
      endedAt: utc(2026, 3, 8, 7, 30),
      startTimezone: 'America/New_York',
    });
    const day = summarizeDay(
      '2026-03-08',
      localDayWindow('2026-03-08', 'America/New_York'),
      [session],
      [],
      utc(2026, 3, 8, 12),
    );
    expect(day.elapsedMs).toBe(2 * 60 * MIN);
    assertBalance(day);
  });

  it('sums two sessions and reports the session count', () => {
    const first = makeSession({ startedAt: t(9), endedAt: t(9, 30) });
    const second = makeSession({ startedAt: t(10), endedAt: t(10, 15) });
    const day = summarizeDay(
      '2026-09-22',
      localDayWindow('2026-09-22', 'UTC'),
      [first, second],
      [],
      t(12),
    );
    expect(day.sessions).toHaveLength(2);
    expect(day.elapsedMs).toBe(45 * MIN);
    expect(day.unresolvedMs).toBe(45 * MIN);
  });
});

describe('timeline', () => {
  it('splits the missed and current portions at the latest boundary', () => {
    const session = makeSession({ startedAt: t(9, 3, 20) });
    const entries = [
      makeEntry({ sessionId: session.id, startAt: t(9, 3, 20), endAt: t(9, 18, 20) }),
      makeEntry({ sessionId: session.id, startAt: t(9, 18, 20), endAt: t(9, 33, 20) }),
      makeEntry({ sessionId: session.id, startAt: t(9, 33, 20), endAt: t(9, 48, 20) }),
      makeEntry({ sessionId: session.id, startAt: t(9, 48, 20), endAt: t(10, 3, 20) }),
    ];
    const now = t(10, 21);
    const day = summarizeDay(
      '2026-09-22',
      localDayWindow('2026-09-22', 'UTC'),
      [session],
      entries,
      now,
    );
    expect(day.recordedMs).toBe(60 * MIN);
    expect(day.completedUnresolvedMs).toBe(15 * MIN);
    expect(day.unresolvedMs).toBe(17 * MIN + 40_000);
    expect(roundToDisplayMinutes(day.unresolvedMs)).toBe(18);
    assertBalance(day);
    const unresolved = day.timeline.filter((item) => item.type === 'unresolved');
    expect(unresolved).toHaveLength(2);
    expect(unresolved[0]).toMatchObject({
      range: { startAt: t(10, 3, 20), endAt: t(10, 18, 20) },
      current: false,
      resolvable: true,
    });
    expect(unresolved[1]).toMatchObject({
      range: { startAt: t(10, 18, 20), endAt: now },
      current: true,
      resolvable: false,
    });
    const timeline = buildTimeline(
      localDayWindow('2026-09-22', 'UTC'),
      [session],
      entries,
      now,
    );
    expect(timeline[0]).toMatchObject({ type: 'entry' });
    expect(timeline[timeline.length - 1]).toMatchObject({ type: 'unresolved' });
  });

  it('clips timeline items to the selected local day', () => {
    const session = makeSession({
      startedAt: utc(2026, 9, 22, 23, 30),
      endedAt: utc(2026, 9, 23, 0, 30),
    });
    const dayTwo = buildTimeline(
      localDayWindow('2026-09-23', 'UTC'),
      [session],
      [],
      utc(2026, 9, 23, 1),
    );
    expect(dayTwo).toHaveLength(1);
    expect(dayTwo[0].clippedRange).toEqual({
      startAt: utc(2026, 9, 23, 0),
      endAt: utc(2026, 9, 23, 0, 30),
    });
  });
});
