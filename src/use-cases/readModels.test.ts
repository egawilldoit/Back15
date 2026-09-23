import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { utc } from '../../tests/support/fixtures';
import { createHarness } from '../../tests/support/harness';
import type { Harness } from '../../tests/support/harness';
import { plannedBoundaryAt } from '../domain/time/boundaries';
import { getSessionById } from '../storage/repositories/sessions';
import { createEntry, skipRange } from './entries';
import { getDayDetail, getHistory, getToday } from './readModels';
import { startSession, stopSession } from './sessions';

const T = utc(2026, 9, 22, 10);
const MIN = 60_000;

describe('today read model', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await createHarness({ now: T });
  });

  afterEach(async () => {
    await harness.close();
  });

  it('is honest on an empty database', async () => {
    const today = await getToday(harness.deps, { timezone: 'UTC' });
    expect(today.ok).toBe(true);
    if (!today.ok) return;
    expect(today.value.activeSession).toBeNull();
    expect(today.value.summary.elapsedMs).toBe(0);
    expect(today.value.summary.recordedMs).toBe(0);
    expect(today.value.nextBoundaryAt).toBeNull();
    expect(today.value.checkInTarget).toBeNull();
  });

  it('derives totals, targets and the next planned boundary from stored rows', async () => {
    const started = await startSession(harness.deps, { timezone: 'UTC' });
    if (!started.ok) throw new Error('start failed');
    const sessionId = started.value.session.id;
    harness.setNow(T + 50 * MIN);
    await createEntry(harness.deps, {
      sessionId,
      range: { startAt: T, endAt: T + 15 * MIN },
      description: 'First task',
      category: 'work',
      actionId: 'action-1',
    });
    await skipRange(harness.deps, {
      sessionId,
      range: { startAt: T + 15 * MIN, endAt: T + 30 * MIN },
      actionId: 'action-2',
    });
    const today = await getToday(harness.deps, { timezone: 'UTC' });
    expect(today.ok).toBe(true);
    if (!today.ok) return;
    const value = today.value;
    expect(value.summary.recordedMs).toBe(15 * MIN);
    expect(value.summary.skippedMs).toBe(15 * MIN);
    expect(value.summary.unresolvedMs).toBe(20 * MIN);
    expect(value.summary.elapsedMs).toBe(50 * MIN);
    expect(value.summary.completedUnresolvedMs).toBe(15 * MIN);
    expect(value.nextBoundaryAt).toBe(T + 60 * MIN);
    expect(value.checkInTarget?.range).toEqual({
      startAt: T + 30 * MIN,
      endAt: T + 45 * MIN,
    });
    expect(value.logNowTarget?.range).toEqual({
      startAt: T + 45 * MIN,
      endAt: T + 50 * MIN,
    });
    expect(value.remindersEnabled).toBe(true);
  });

  it('recomputes at a boundary without moving the planned schedule', async () => {
    const started = await startSession(harness.deps, { timezone: 'UTC' });
    if (!started.ok) throw new Error('start failed');
    const sessionId = started.value.session.id;
    const before = await getToday(harness.deps, { timezone: 'UTC' });
    if (!before.ok) throw new Error('read failed');
    expect(before.value.nextBoundaryAt).toBe(T + 15 * MIN);
    expect(before.value.checkInTarget).toBeNull();

    harness.setNow(T + 20 * MIN);
    const after = await getToday(harness.deps, { timezone: 'UTC' });
    if (!after.ok) throw new Error('read failed');
    expect(after.value.nextBoundaryAt).toBe(T + 30 * MIN);
    expect(after.value.checkInTarget?.range).toEqual({
      startAt: T,
      endAt: T + 15 * MIN,
    });
    expect(after.value.logNowTarget?.range).toEqual({
      startAt: T + 15 * MIN,
      endAt: T + 20 * MIN,
    });
    expect(after.value.summary.unresolvedMs).toBe(20 * MIN);
    expect(after.value.summary.completedUnresolvedMs).toBe(15 * MIN);

    const stored = await getSessionById(harness.db, sessionId);
    expect(stored?.startedAt).toBe(T);
    expect(stored?.reminderWindowEndAt).toBe(T + 12 * 60 * MIN);
    expect(plannedBoundaryAt(stored!, 1)).toBe(T + 15 * MIN);
    expect(plannedBoundaryAt(stored!, 2)).toBe(T + 30 * MIN);
  });

  it('switches to the new local day across midnight', async () => {
    const start = utc(2026, 9, 22, 23, 50);
    harness.setNow(start);
    const started = await startSession(harness.deps, { timezone: 'UTC' });
    if (!started.ok) throw new Error('start failed');
    harness.setNow(utc(2026, 9, 22, 23, 55));
    const entry = await createEntry(harness.deps, {
      sessionId: started.value.session.id,
      range: { startAt: start, endAt: utc(2026, 9, 22, 23, 55) },
      description: 'Late task',
      actionId: 'action-1',
    });
    expect(entry.ok).toBe(true);

    harness.setNow(utc(2026, 9, 23, 0, 10));
    const today = await getToday(harness.deps, { timezone: 'UTC' });
    if (!today.ok) throw new Error('read failed');
    expect(today.value.dayKey).toBe('2026-09-23');
    expect(today.value.summary.elapsedMs).toBe(10 * MIN);
    expect(today.value.summary.recordedMs).toBe(0);
    expect(today.value.summary.unresolvedMs).toBe(10 * MIN);
    expect(today.value.nextBoundaryAt).toBe(utc(2026, 9, 23, 0, 20));

    const yesterday = await getDayDetail(harness.deps, {
      dayKey: '2026-09-22',
      timezone: 'UTC',
    });
    if (!yesterday.ok) throw new Error('detail failed');
    expect(yesterday.value.summary.elapsedMs).toBe(10 * MIN);
    expect(yesterday.value.summary.recordedMs).toBe(5 * MIN);
    expect(yesterday.value.summary.unresolvedMs).toBe(5 * MIN);
  });

  it('collapses two missed boundaries into one gap after resume', async () => {
    const started = await startSession(harness.deps, { timezone: 'UTC' });
    if (!started.ok) throw new Error('start failed');
    const sessionId = started.value.session.id;

    harness.setNow(T + 40 * MIN);
    const resumed = await getToday(harness.deps, { timezone: 'UTC' });
    if (!resumed.ok) throw new Error('read failed');
    expect(resumed.value.checkInTarget?.range).toEqual({
      startAt: T,
      endAt: T + 30 * MIN,
    });
    expect(resumed.value.checkInTarget?.olderGaps).toEqual([]);
    expect(resumed.value.logNowTarget?.range).toEqual({
      startAt: T + 30 * MIN,
      endAt: T + 40 * MIN,
    });

    const saved = await createEntry(harness.deps, {
      sessionId,
      range: resumed.value.checkInTarget!.range,
      description: 'Recorded after resume',
      origin: 'backfilled',
      actionId: 'action-1',
    });
    expect(saved.ok).toBe(true);
    const after = await getToday(harness.deps, { timezone: 'UTC' });
    if (!after.ok) throw new Error('read failed');
    expect(after.value.summary.recordedMs).toBe(30 * MIN);
    expect(after.value.summary.unresolvedMs).toBe(10 * MIN);
    expect(after.value.checkInTarget).toBeNull();
    const live = await import('../storage/repositories/entries').then((mod) =>
      mod.listLiveEntriesForSession(harness.db, sessionId),
    );
    expect(live).toHaveLength(1);
  });

  it('keeps the balance after an edit and a delete', async () => {
    const started = await startSession(harness.deps, { timezone: 'UTC' });
    if (!started.ok) throw new Error('start failed');
    const sessionId = started.value.session.id;
    harness.setNow(T + 40 * MIN);
    await createEntry(harness.deps, {
      sessionId,
      range: { startAt: T, endAt: T + 20 * MIN },
      description: 'First task',
      actionId: 'action-1',
    });
    const before = await getToday(harness.deps, { timezone: 'UTC' });
    if (!before.ok) throw new Error('read failed');
    expect(before.value.summary.recordedMs).toBe(20 * MIN);
    expect(before.value.summary.unresolvedMs).toBe(20 * MIN);
    expect(before.value.summary.elapsedMs).toBe(40 * MIN);
  });
});

describe('history read model', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await createHarness({ now: T });
  });

  afterEach(async () => {
    await harness.close();
  });

  it('omits empty days and sums multiple sessions per day', async () => {
    const empty = await getHistory(harness.deps, { timezone: 'UTC' });
    expect(empty.ok).toBe(true);
    if (!empty.ok) return;
    expect(empty.value).toEqual([]);

    const first = await startSession(harness.deps, { timezone: 'UTC' });
    if (!first.ok) throw new Error('start failed');
    harness.setNow(T + 30 * MIN);
    await createEntry(harness.deps, {
      sessionId: first.value.session.id,
      range: { startAt: T, endAt: T + 15 * MIN },
      description: 'Morning task',
      actionId: 'action-1',
    });
    await stopSession(harness.deps, {
      sessionId: first.value.session.id,
      endedAt: T + 30 * MIN,
    });

    const secondStart = utc(2026, 9, 22, 14);
    harness.setNow(secondStart);
    const second = await startSession(harness.deps, { timezone: 'UTC' });
    if (!second.ok) throw new Error('second start failed');
    harness.setNow(secondStart + 20 * MIN);
    await createEntry(harness.deps, {
      sessionId: second.value.session.id,
      range: { startAt: secondStart, endAt: secondStart + 15 * MIN },
      description: 'Afternoon task',
      actionId: 'action-2',
    });
    await stopSession(harness.deps, {
      sessionId: second.value.session.id,
      endedAt: secondStart + 15 * MIN,
    });

    harness.setNow(utc(2026, 9, 23, 9));
    const history = await getHistory(harness.deps, { timezone: 'UTC' });
    expect(history.ok).toBe(true);
    if (!history.ok) return;
    expect(history.value).toHaveLength(1);
    expect(history.value[0].dayKey).toBe('2026-09-22');
    expect(history.value[0].sessionCount).toBe(2);
    expect(history.value[0].elapsedMs).toBe(45 * MIN);
    expect(history.value[0].recordedMs).toBe(30 * MIN);
    expect(history.value[0].unresolvedMs).toBe(15 * MIN);
  });

  it('shows a midnight-crossing session on both local days', async () => {
    const start = utc(2026, 9, 22, 23);
    harness.setNow(start);
    const started = await startSession(harness.deps, { timezone: 'UTC' });
    if (!started.ok) throw new Error('start failed');
    harness.setNow(start + 30 * MIN);
    await createEntry(harness.deps, {
      sessionId: started.value.session.id,
      range: { startAt: start, endAt: start + 30 * MIN },
      description: 'Late task',
      actionId: 'action-1',
    });
    harness.setNow(utc(2026, 9, 23, 1));
    await stopSession(harness.deps, {
      sessionId: started.value.session.id,
      endedAt: utc(2026, 9, 23, 1),
    });
    const history = await getHistory(harness.deps, { timezone: 'UTC' });
    expect(history.ok).toBe(true);
    if (!history.ok) return;
    const days = history.value.map((day) => day.dayKey);
    expect(days).toContain('2026-09-22');
    expect(days).toContain('2026-09-23');
    const firstDay = history.value.find((day) => day.dayKey === '2026-09-22')!;
    expect(firstDay.recordedMs).toBe(30 * MIN);
    expect(firstDay.elapsedMs).toBe(60 * MIN);
  });

  it('clips day detail to the selected day', async () => {
    const start = utc(2026, 9, 22, 23, 30);
    harness.setNow(start);
    const started = await startSession(harness.deps, { timezone: 'UTC' });
    if (!started.ok) throw new Error('start failed');
    harness.setNow(utc(2026, 9, 23, 1));
    await stopSession(harness.deps, {
      sessionId: started.value.session.id,
      endedAt: utc(2026, 9, 23, 1),
    });
    const detail = await getDayDetail(harness.deps, {
      dayKey: '2026-09-23',
      timezone: 'UTC',
    });
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(detail.value.summary.elapsedMs).toBe(60 * MIN);
    expect(detail.value.summary.timeline[0].clippedRange).toEqual({
      startAt: utc(2026, 9, 23, 0),
      endAt: utc(2026, 9, 23, 1),
    });
  });
});
