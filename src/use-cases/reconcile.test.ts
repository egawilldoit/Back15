import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { REMINDER_WINDOW_MS } from '../domain/time/boundaries';
import { utc } from '../../tests/support/fixtures';
import { FakeReminderPort } from '../../tests/support/fakeReminders';
import { createHarness } from '../../tests/support/harness';
import type { Harness } from '../../tests/support/harness';
import { REMINDER_PAYLOAD_VERSION } from '../reminders/types';
import { listReminderRequests } from '../storage/repositories/reminderRequests';
import {
  getLastObservedWallAt,
  setLastObservedWallAt,
  setRemindersEnabled,
} from '../storage/repositories/settings';
import { getActiveSession } from '../storage/repositories/sessions';
import { reconcile } from './reconcile';
import { startSession, stopSession } from './sessions';

const T = utc(2026, 9, 22, 10);

describe('reminder reconciliation', () => {
  let harness: Harness;
  let reminders: FakeReminderPort;

  beforeEach(async () => {
    reminders = new FakeReminderPort();
    harness = await createHarness({ now: T, reminders });
  });

  afterEach(async () => {
    await harness.close();
  });

  it('schedules each future boundary exactly once', async () => {
    const started = await startSession(harness.deps, { timezone: 'UTC' });
    expect(started.ok).toBe(true);
    expect(reminders.scheduled).toHaveLength(48);
    const dueAts = reminders.scheduled.map((payload) => payload.dueAt);
    expect(new Set(dueAts).size).toBe(48);
    expect(dueAts[0]).toBe(T + 15 * 60 * 1000);
    expect(dueAts[47]).toBe(T + REMINDER_WINDOW_MS);

    const again = await reconcile(harness.deps);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.value.reminder.scheduled).toBe(0);
    expect(again.value.reminder.pendingCount).toBe(48);
  });

  it('does not duplicate an OS request when its metadata write was lost', async () => {
    await startSession(harness.deps, { timezone: 'UTC' });
    const stored = await listReminderRequests(harness.db);
    expect(stored).toHaveLength(48);
    await harness.db.execAsync('DELETE FROM reminder_requests');
    const result = await reconcile(harness.deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.reminder.scheduled).toBe(0);
    expect(reminders.pending.size).toBe(48);
    expect(await listReminderRequests(harness.db)).toHaveLength(48);
  });

  it('cancels stale requests scheduled by an older payload version', async () => {
    const started = await startSession(harness.deps, { timezone: 'UTC' });
    if (!started.ok) throw new Error('start failed');
    const sessionId = started.value.session.id;
    const staleSameSession = reminders.addOrphan({
      version: REMINDER_PAYLOAD_VERSION - 1,
      sessionId,
      dueAt: T + 15 * 60 * 1000,
    });
    const staleForeignSession = reminders.addOrphan({
      version: REMINDER_PAYLOAD_VERSION - 1,
      sessionId: 'session-from-a-previous-install',
      dueAt: T + 30 * 60 * 1000,
    });
    const result = await reconcile(harness.deps);
    expect(result.ok).toBe(true);
    expect(reminders.pending.has(staleSameSession)).toBe(false);
    expect(reminders.pending.has(staleForeignSession)).toBe(false);
    expect(reminders.cancelled).toEqual(
      expect.arrayContaining([staleSameSession, staleForeignSession]),
    );
    if (!result.ok) return;
    // The current-format request for the same boundary is reused, not duplicated.
    expect(result.value.reminder.scheduled).toBe(0);
    expect(result.value.reminder.pendingCount).toBe(48);
  });

  it('cancels older payload versions even when no session is active', async () => {
    const staleId = reminders.addOrphan({
      version: REMINDER_PAYLOAD_VERSION - 1,
      sessionId: 'session-from-a-previous-install',
      dueAt: T + 30 * 60 * 1000,
    });
    const result = await reconcile(harness.deps);
    expect(result.ok).toBe(true);
    expect(reminders.pending.has(staleId)).toBe(false);
    if (!result.ok) return;
    expect(result.value.reminder.cancelled).toBe(1);
  });

  it('cancels everything when permission is denied and reschedules when restored', async () => {
    await startSession(harness.deps, { timezone: 'UTC' });
    reminders.permission = 'denied';
    const denied = await reconcile(harness.deps);
    expect(denied.ok).toBe(true);
    if (!denied.ok) return;
    expect(denied.value.reminder.scheduled).toBe(0);
    expect(reminders.pending.size).toBe(0);
    reminders.permission = 'granted';
    const restored = await reconcile(harness.deps);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.value.reminder.scheduled).toBe(48);
  });

  it('schedules nothing while permission is undetermined', async () => {
    reminders.permission = 'undetermined';
    const started = await startSession(harness.deps, { timezone: 'UTC' });
    expect(started.ok).toBe(true);
    expect(reminders.scheduled).toHaveLength(0);
    expect(reminders.pending.size).toBe(0);
    if (!started.ok) return;
    expect(started.value.reminder.permission).toBe('undetermined');
    expect(started.value.reminder.scheduled).toBe(0);
  });

  it('cancels pending requests when reminders are switched off', async () => {
    await startSession(harness.deps, { timezone: 'UTC' });
    await setRemindersEnabled(harness.db, false);
    const result = await reconcile(harness.deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.reminder.remindersEnabled).toBe(false);
    expect(reminders.pending.size).toBe(0);
    expect((await getActiveSession(harness.db))?.status).toBe('active');
  });

  it('closes an expired session at the cutoff and cancels its prompts', async () => {
    const started = await startSession(harness.deps, { timezone: 'UTC' });
    if (!started.ok) throw new Error('start failed');
    harness.setNow(T + 13 * 60 * 60 * 1000);
    const result = await reconcile(harness.deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.closedExpired).toBe(true);
    expect(result.value.activeSession).toBeNull();
    expect(reminders.pending.size).toBe(0);
    const session = await getActiveSession(harness.db);
    expect(session).toBeNull();
  });

  it('cleans up an orphan request left by a Stop crash', async () => {
    const started = await startSession(harness.deps, { timezone: 'UTC' });
    if (!started.ok) throw new Error('start failed');
    const sessionId = started.value.session.id;
    await stopSession(harness.deps, { sessionId });
    reminders.addOrphan({
      version: REMINDER_PAYLOAD_VERSION,
      sessionId,
      dueAt: T + 15 * 60 * 1000,
    });
    const result = await reconcile(harness.deps);
    expect(result.ok).toBe(true);
    expect(reminders.pending.size).toBe(0);
    expect(await getActiveSession(harness.db)).toBeNull();
  });

  it('does not close an expired session when the clock moved backward', async () => {
    const started = await startSession(harness.deps, { timezone: 'UTC' });
    if (!started.ok) throw new Error('start failed');
    await setLastObservedWallAt(harness.db, T + 14 * 60 * 60 * 1000);
    harness.setNow(T + 13 * 60 * 60 * 1000);
    const result = await reconcile(harness.deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.clockAnomaly?.kind).toBe('backward');
    expect(result.value.closedExpired).toBe(false);
    expect((await getActiveSession(harness.db))?.status).toBe('active');
    harness.setNow(T + 14 * 60 * 60 * 1000);
    const later = await reconcile(harness.deps);
    expect(later.ok).toBe(true);
    if (!later.ok) return;
    expect(later.value.closedExpired).toBe(true);
    expect(await getActiveSession(harness.db)).toBeNull();
  });

  it('records the observed wall time on every reconcile', async () => {
    await reconcile(harness.deps);
    expect(await getLastObservedWallAt(harness.db)).toBe(T);
  });

  it('reports native scheduling failures without touching committed sessions', async () => {
    reminders.failSchedule = true;
    const started = await startSession(harness.deps, { timezone: 'UTC' });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.value.reminder.error).toBeTruthy();
    expect((await getActiveSession(harness.db))?.id).toBe(started.value.session.id);
  });
});
