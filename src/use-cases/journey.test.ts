import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatDurationLabel, localDayKey } from '../domain/time/day';
import { utc } from '../../tests/support/fixtures';
import { FakeReminderPort } from '../../tests/support/fakeReminders';
import { createHarness } from '../../tests/support/harness';
import type { Harness } from '../../tests/support/harness';
import { checkInTarget, logNowTarget } from '../domain/tracking/proposals';
import { listLiveEntriesForSession } from '../storage/repositories/entries';
import { continuePrevious, createEntry, deleteEntry, skipRange, updateEntry } from './entries';
import { getDayDetail, getHistory, getToday } from './readModels';
import { startSession, stopSession } from './sessions';

const MIN = 60_000;
const START = utc(2026, 9, 22, 9, 3, 20);
const t = (hour: number, minute = 0, second = 0) => utc(2026, 9, 22, hour, minute, second);

/**
 * The offline journey from the E2E script as far as it can be exercised
 * without a device: every mutation must keep
 * elapsed = recorded + skipped + unresolved and never overlap live entries.
 */
describe('offline journey arithmetic', () => {
  let harness: Harness;
  let reminders: FakeReminderPort;
  let sessionId: string;

  beforeEach(async () => {
    reminders = new FakeReminderPort();
    harness = await createHarness({ now: START, reminders });
    const started = await startSession(harness.deps, { timezone: 'UTC' });
    if (!started.ok) throw new Error('start failed');
    sessionId = started.value.session.id;
  });

  afterEach(async () => {
    await harness.close();
  });

  async function assertBalance() {
    const today = await getToday(harness.deps, { timezone: 'UTC' });
    if (!today.ok) throw new Error(today.error.message);
    const summary = today.value.summary;
    expect(summary.recordedMs + summary.skippedMs + summary.unresolvedMs).toBe(
      summary.elapsedMs,
    );
    const entries = await listLiveEntriesForSession(harness.db, sessionId);
    const sorted = [...entries].sort((a, b) => a.startAt - b.startAt);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i - 1].endAt).toBeLessThanOrEqual(sorted[i].startAt);
    }
    return summary;
  }

  it('supports the full start → gap → log now → continue → skip → edit → delete → stop loop', async () => {
    // Ignore reminders for a long stretch.
    harness.setNow(t(10, 50));
    const first = await assertBalance();
    expect(first.elapsedMs).toBe(t(10, 50) - START);

    const today = await getToday(harness.deps, { timezone: 'UTC' });
    if (!today.ok) throw new Error('read failed');
    expect(today.value.checkInTarget?.range).toEqual({
      startAt: START,
      endAt: t(10, 48, 20),
    });
    expect(today.value.logNowTarget?.range).toEqual({
      startAt: t(10, 48, 20),
      endAt: t(10, 50),
    });

    // Record the consolidated completed gap.
    const gap = await createEntry(harness.deps, {
      sessionId,
      range: { startAt: START, endAt: t(10, 48, 20) },
      description: 'Deep work block',
      category: 'work',
      origin: 'backfilled',
      actionId: 'gap-1',
    });
    expect(gap.ok).toBe(true);

    // Log Now a partial span without rounding: 7 minutes at 10:57.
    harness.setNow(t(10, 57));
    const partial = await createEntry(harness.deps, {
      sessionId,
      range: { startAt: t(10, 50), endAt: t(10, 57) },
      description: 'Standup notes',
      category: 'work',
      actionId: 'partial-1',
    });
    expect(partial.ok).toBe(true);
    if (!partial.ok) return;
    expect(partial.value.endAt - partial.value.startAt).toBe(7 * MIN);

    // Continue previous creates a new row with the copied description.
    harness.setNow(t(11, 12));
    const continued = await continuePrevious(harness.deps, {
      sessionId,
      range: { startAt: t(10, 57), endAt: t(11, 12) },
      actionId: 'continue-1',
    });
    expect(continued.ok).toBe(true);
    if (!continued.ok) return;
    expect(continued.value.description).toBe('Standup notes');
    expect(continued.value.id).not.toBe(partial.value.id);

    // Explicitly skip one interval.
    harness.setNow(t(11, 27));
    const skipped = await skipRange(harness.deps, {
      sessionId,
      range: { startAt: t(11, 12), endAt: t(11, 27) },
      actionId: 'skip-1',
    });
    expect(skipped.ok).toBe(true);

    let summary = await assertBalance();
    expect(summary.skippedMs).toBe(15 * MIN);

    // Edit the continued entry to cover only part of its span.
    const edited = await updateEntry(harness.deps, {
      entryId: continued.value.id,
      expectedRevision: 1,
      changes: {
        startAt: t(10, 57),
        endAt: t(11, 7),
        kind: 'logged',
        description: 'Standup notes and follow-ups',
        category: 'work',
      },
    });
    expect(edited.ok).toBe(true);
    summary = await assertBalance();

    // Delete the partial entry: its time returns to unresolved.
    const beforeDelete = summary;
    const deleted = await deleteEntry(harness.deps, {
      entryId: partial.value.id,
      expectedRevision: 1,
    });
    expect(deleted.ok).toBe(true);
    summary = await assertBalance();
    expect(summary.recordedMs).toBe(beforeDelete.recordedMs - 7 * MIN);
    expect(summary.unresolvedMs).toBe(beforeDelete.unresolvedMs + 7 * MIN);
    expect(summary.elapsedMs).toBe(beforeDelete.elapsedMs);

    // Stop: reminders are cancelled and a stale tap cannot restart anything.
    harness.setNow(t(11, 30));
    const stopped = await stopSession(harness.deps, { sessionId });
    expect(stopped.ok).toBe(true);
    if (!stopped.ok) return;
    expect(stopped.value.session.status).toBe('closed');
    expect(reminders.pending.size).toBe(0);

    const readAfterStop = await getToday(harness.deps, { timezone: 'UTC' });
    if (!readAfterStop.ok) throw new Error('read failed');
    expect(readAfterStop.value.activeSession).toBeNull();
    expect(readAfterStop.value.logNowTarget).toBeNull();

    // Historical unresolved time remains reachable inside the closed bounds.
    const closedSession = readAfterStop.value.sessions[0];
    const entries = await listLiveEntriesForSession(harness.db, closedSession.id);
    const historicalTarget = checkInTarget(closedSession, entries, t(12));
    expect(historicalTarget).not.toBeNull();
    expect(historicalTarget!.range.endAt).toBeLessThanOrEqual(
      stopped.value.session.endedAt ?? 0,
    );
    void logNowTarget(closedSession, entries, t(12));

    // History and day detail show the same story.
    const history = await getHistory(harness.deps, { timezone: 'UTC' });
    expect(history.ok).toBe(true);
    if (!history.ok) return;
    expect(history.value).toHaveLength(1);
    expect(history.value[0].dayKey).toBe(localDayKey(START, 'UTC'));
    const detail = await getDayDetail(harness.deps, {
      dayKey: history.value[0].dayKey,
      timezone: 'UTC',
    });
    if (!detail.ok) throw new Error('detail failed');
    expect(detail.value.summary.recordedMs).toBe(summary.recordedMs);
    const labels = detail.value.summary.timeline
      .filter((item) => item.type === 'entry')
      .map((item) => formatDurationLabel(item.clippedRange.endAt - item.clippedRange.startAt));
    expect(labels.length).toBeGreaterThan(0);
  });
});
