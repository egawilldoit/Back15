import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { REMINDER_WINDOW_MS } from '../domain/time/boundaries';
import { REMINDER_PAYLOAD_VERSION } from '../reminders/types';
import { utc } from '../../tests/support/fixtures';
import { FakeReminderPort } from '../../tests/support/fakeReminders';
import { createHarness } from '../../tests/support/harness';
import type { Harness } from '../../tests/support/harness';
import { getActiveSession, getSessionById } from '../storage/repositories/sessions';
import { createEntry } from './entries';
import { startSession, stopSession } from './sessions';

const T = utc(2026, 9, 22, 10);

describe('startSession', () => {
  let harness: Harness;
  let reminders: FakeReminderPort;

  beforeEach(async () => {
    reminders = new FakeReminderPort();
    harness = await createHarness({ now: T, reminders });
  });

  afterEach(async () => {
    await harness.close();
  });

  it('creates exactly one active session with a 12-hour window', async () => {
    const result = await startSession(harness.deps, { timezone: 'Europe/Berlin' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.created).toBe(true);
    expect(result.value.session.startedAt).toBe(T);
    expect(result.value.session.reminderWindowEndAt).toBe(T + REMINDER_WINDOW_MS);
    expect(result.value.session.intervalSeconds).toBe(900);
    expect(result.value.session.startTimezone).toBe('Europe/Berlin');
    const active = await getActiveSession(harness.db);
    expect(active?.id).toBe(result.value.session.id);
  });

  it('returns the existing active session on a repeated Start', async () => {
    const first = await startSession(harness.deps, { timezone: 'UTC' });
    harness.advance(60_000);
    const second = await startSession(harness.deps, { timezone: 'UTC' });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.created).toBe(false);
    expect(second.value.session.id).toBe(first.value.session.id);
  });

  it('closes an expired session at the cutoff and starts a fresh one', async () => {
    const first = await startSession(harness.deps, { timezone: 'UTC' });
    if (!first.ok) throw new Error('start failed');
    harness.setNow(T + 13 * 60 * 60 * 1000);
    const second = await startSession(harness.deps, { timezone: 'UTC' });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.created).toBe(true);
    expect(second.value.session.id).not.toBe(first.value.session.id);
    const closed = await getSessionById(harness.db, first.value.session.id);
    expect(closed?.status).toBe('closed');
    expect(closed?.endedAt).toBe(T + REMINDER_WINDOW_MS);
  });

  it('schedules bounded reminders after the database commit', async () => {
    await startSession(harness.deps, { timezone: 'UTC' });
    expect(reminders.scheduled).toHaveLength(48);
    expect(reminders.scheduled[0].dueAt).toBe(T + 15 * 60 * 1000);
  });

  it('keeps tracking active when scheduling fails', async () => {
    reminders.failSchedule = true;
    const result = await startSession(harness.deps, { timezone: 'UTC' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.reminder.error).not.toBeNull();
    expect(await getActiveSession(harness.db)).not.toBeNull();
  });

  it('tracks without reminders when permission is denied', async () => {
    reminders.permission = 'denied';
    const result = await startSession(harness.deps, { timezone: 'UTC' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.reminder.scheduled).toBe(0);
    expect(reminders.scheduled).toHaveLength(0);
  });
});

describe('stopSession', () => {
  let harness: Harness;
  let reminders: FakeReminderPort;

  beforeEach(async () => {
    reminders = new FakeReminderPort();
    harness = await createHarness({ now: T, reminders });
  });

  afterEach(async () => {
    await harness.close();
  });

  it('closes at now and keeps the final partial span unresolved', async () => {
    const started = await startSession(harness.deps, { timezone: 'UTC' });
    if (!started.ok) throw new Error('start failed');
    const sessionId = started.value.session.id;
    harness.advance(15 * 60 * 1000);
    const entry = await createEntry(harness.deps, {
      sessionId,
      range: { startAt: T, endAt: T + 15 * 60 * 1000 },
      description: 'First task',
      actionId: 'action-1',
    });
    expect(entry.ok).toBe(true);
    harness.advance(15 * 60 * 1000);
    const stopped = await stopSession(harness.deps, { sessionId });
    expect(stopped.ok).toBe(true);
    if (!stopped.ok) return;
    expect(stopped.value.session.endedAt).toBe(T + 30 * 60 * 1000);
    expect(stopped.value.finalUnresolvedMs).toBe(15 * 60 * 1000);
    expect(stopped.value.reminder.cancelled).toBe(48);
    expect(reminders.pending.size).toBe(0);
  });

  it('cancels pending reminders and dismisses presented ones', async () => {
    const started = await startSession(harness.deps, { timezone: 'UTC' });
    if (!started.ok) throw new Error('start failed');
    const [nativeId] = [...reminders.pending.keys()];
    reminders.presented.push({
      nativeId,
      payload: reminders.pending.get(nativeId)!.payload,
    });
    const stopped = await stopSession(harness.deps, { sessionId: started.value.session.id });
    expect(stopped.ok).toBe(true);
    expect(reminders.dismissed).toContain(nativeId);
  });

  it('rejects an end that falls before a live entry end', async () => {
    const started = await startSession(harness.deps, { timezone: 'UTC' });
    if (!started.ok) throw new Error('start failed');
    const sessionId = started.value.session.id;
    harness.setNow(T + 30 * 60 * 1000);
    await createEntry(harness.deps, {
      sessionId,
      range: { startAt: T, endAt: T + 30 * 60 * 1000 },
      description: 'Long task',
      actionId: 'action-1',
    });
    harness.advance(60 * 60 * 1000);
    const stopped = await stopSession(harness.deps, {
      sessionId,
      endedAt: T + 15 * 60 * 1000,
    });
    expect(stopped.ok).toBe(false);
    if (!stopped.ok) expect(stopped.error.code).toBe('SESSION_END_BEFORE_ENTRY');
    const session = await getSessionById(harness.db, sessionId);
    expect(session?.status).toBe('active');
  });

  it('accepts an explicit earlier correction after entries are resolved', async () => {
    const started = await startSession(harness.deps, { timezone: 'UTC' });
    if (!started.ok) throw new Error('start failed');
    const sessionId = started.value.session.id;
    harness.setNow(T + 15 * 60 * 1000);
    await createEntry(harness.deps, {
      sessionId,
      range: { startAt: T, endAt: T + 15 * 60 * 1000 },
      description: 'First task',
      actionId: 'action-1',
    });
    harness.advance(2 * 60 * 60 * 1000);
    const stopped = await stopSession(harness.deps, {
      sessionId,
      endedAt: T + 60 * 60 * 1000,
    });
    expect(stopped.ok).toBe(true);
    if (!stopped.ok) return;
    expect(stopped.value.session.endedAt).toBe(T + 60 * 60 * 1000);
    expect(stopped.value.finalUnresolvedMs).toBe(45 * 60 * 1000);
  });

  it('rejects an end in the future and keeps the session active', async () => {
    const started = await startSession(harness.deps, { timezone: 'UTC' });
    if (!started.ok) throw new Error('start failed');
    harness.setNow(T + 30 * 60 * 1000);
    const stopped = await stopSession(harness.deps, {
      sessionId: started.value.session.id,
      endedAt: T + 60 * 60 * 1000,
    });
    expect(stopped.ok).toBe(false);
    if (!stopped.ok) expect(stopped.error.code).toBe('SESSION_END_IN_FUTURE');
    expect((await getSessionById(harness.db, started.value.session.id))?.status).toBe(
      'active',
    );
    expect((await getSessionById(harness.db, started.value.session.id))?.endedAt).toBeNull();
  });

  it('accepts an end exactly at now', async () => {
    const started = await startSession(harness.deps, { timezone: 'UTC' });
    if (!started.ok) throw new Error('start failed');
    harness.setNow(T + 30 * 60 * 1000);
    const stopped = await stopSession(harness.deps, {
      sessionId: started.value.session.id,
      endedAt: T + 30 * 60 * 1000,
    });
    expect(stopped.ok).toBe(true);
    if (!stopped.ok) return;
    expect(stopped.value.session.endedAt).toBe(T + 30 * 60 * 1000);
  });

  it('cancels reminders left by an older payload version when stopped', async () => {
    const started = await startSession(harness.deps, { timezone: 'UTC' });
    if (!started.ok) throw new Error('start failed');
    const staleId = reminders.addOrphan({
      version: REMINDER_PAYLOAD_VERSION - 1,
      sessionId: started.value.session.id,
      dueAt: T + 15 * 60 * 1000,
    });
    const stopped = await stopSession(harness.deps, {
      sessionId: started.value.session.id,
    });
    expect(stopped.ok).toBe(true);
    expect(reminders.pending.has(staleId)).toBe(false);
    expect(reminders.cancelled).toContain(staleId);
  });

  it('rejects an end past the reminder window', async () => {
    const started = await startSession(harness.deps, { timezone: 'UTC' });
    if (!started.ok) throw new Error('start failed');
    const stopped = await stopSession(harness.deps, {
      sessionId: started.value.session.id,
      endedAt: T + REMINDER_WINDOW_MS + 1,
    });
    expect(stopped.ok).toBe(false);
    if (!stopped.ok) expect(stopped.error.code).toBe('INVALID_RANGE');
  });

  it('rejects a second Stop on the same session', async () => {
    const started = await startSession(harness.deps, { timezone: 'UTC' });
    if (!started.ok) throw new Error('start failed');
    await stopSession(harness.deps, { sessionId: started.value.session.id });
    const again = await stopSession(harness.deps, { sessionId: started.value.session.id });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe('SESSION_CLOSED');
  });

  it('rejects a stop before the session start as a clock anomaly', async () => {
    const started = await startSession(harness.deps, { timezone: 'UTC' });
    if (!started.ok) throw new Error('start failed');
    const stopped = await stopSession(harness.deps, {
      sessionId: started.value.session.id,
      endedAt: T - 1000,
    });
    expect(stopped.ok).toBe(false);
    if (!stopped.ok) expect(stopped.error.code).toBe('CLOCK_ANOMALY');
  });
});
