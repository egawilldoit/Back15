import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { utc } from '../../tests/support/fixtures';
import { FakeReminderPort } from '../../tests/support/fakeReminders';
import { createHarness } from '../../tests/support/harness';
import type { Harness } from '../../tests/support/harness';
import type { SqlDatabase, SqlExecutor, SqlParams, SqlRunResult } from '../storage/types';
import { setRemindersEnabled } from '../storage/repositories/settings';
import { createEntry, deleteEntry, skipRange } from './entries';
import { exportJournal, importJournal } from './backup';
import { startSession, stopSession } from './sessions';

const T = utc(2026, 9, 22, 10);
const MIN = 60_000;

/** Wraps a database and fails a chosen write, to prove import atomicity. */
function failAfterWrites(db: SqlDatabase, allowed: number): SqlDatabase {
  let writes = 0;
  const guard = (executor: SqlExecutor): SqlExecutor => ({
    async runAsync(sql: string, params?: SqlParams): Promise<SqlRunResult> {
      writes += 1;
      if (writes > allowed) throw new Error('simulated storage failure');
      return executor.runAsync(sql, params);
    },
    getFirstAsync: executor.getFirstAsync.bind(executor),
    getAllAsync: executor.getAllAsync.bind(executor),
    execAsync: executor.execAsync.bind(executor),
  });
  return {
    ...guard(db),
    async withExclusiveTransactionAsync(task) {
      return db.withExclusiveTransactionAsync(async (txn) => task(guard(txn)));
    },
    closeAsync: () => db.closeAsync(),
  };
}

describe('journal export and restore', () => {
  let source: Harness;
  let target: Harness;

  beforeEach(async () => {
    source = await createHarness({ now: T });
    target = await createHarness({ now: T + 30 * MIN });
  });

  afterEach(async () => {
    await source.close();
    await target.close();
  });

  async function seedSource() {
    const morning = await startSession(source.deps, { timezone: 'Europe/Berlin' });
    if (!morning.ok) throw new Error('start failed');
    const sessionId = morning.value.session.id;
    source.setNow(T + 15 * MIN);
    const first = await createEntry(source.deps, {
      sessionId,
      range: { startAt: T, endAt: T + 15 * MIN },
      description: 'Deep work',
      category: 'work',
      actionId: 'action-1',
    });
    if (!first.ok) throw new Error('create failed');
    source.setNow(T + 30 * MIN);
    await skipRange(source.deps, {
      sessionId,
      range: { startAt: T + 15 * MIN, endAt: T + 30 * MIN },
      actionId: 'action-2',
    });
    source.setNow(T + 45 * MIN);
    const tombstoned = await createEntry(source.deps, {
      sessionId,
      range: { startAt: T + 30 * MIN, endAt: T + 45 * MIN },
      description: 'Mistake',
      actionId: 'action-3',
    });
    if (!tombstoned.ok) throw new Error('create failed');
    source.setNow(T + 50 * MIN);
    await deleteEntry(source.deps, {
      entryId: tombstoned.value.id,
      expectedRevision: 1,
    });
    await setRemindersEnabled(source.db, false);
    return { sessionId, firstEntryId: first.value.id };
  }

  it('round-trips sessions, entries, tombstones and settings through replace', async () => {
    const { firstEntryId } = await seedSource();
    const exported = await exportJournal(source.deps, { appVersion: '0.1.0' });
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value.backup.sessions).toHaveLength(1);
    expect(exported.value.backup.entries).toHaveLength(3);
    expect(
      exported.value.backup.entries.filter((entry) => entry.deletedAt !== null),
    ).toHaveLength(1);

    const restored = await importJournal(target.deps, {
      text: exported.value.json,
      mode: 'replace',
    });
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.value.sessions).toBe(1);
    expect(restored.value.entries).toBe(3);
    expect(restored.value.tombstones).toBe(1);

    const reExported = await exportJournal(target.deps);
    if (!reExported.ok) throw new Error(reExported.error.message);
    expect(reExported.value.backup.sessions).toEqual(exported.value.backup.sessions);
    expect(reExported.value.backup.entries).toEqual(exported.value.backup.entries);
    expect(reExported.value.backup.settings).toEqual({ remindersEnabled: false });

    const restoredEntry = reExported.value.backup.entries.find(
      (entry) => entry.id === firstEntryId,
    );
    expect(restoredEntry?.clientActionId).toBe('action-1');
    expect(restoredEntry?.revision).toBe(1);
    expect(restoredEntry?.category).toBe('work');
  });

  it('never exports native reminder ids or device observation metadata', async () => {
    const { sessionId } = await seedSource();
    const reminders = new FakeReminderPort();
    const withReminders = await createHarness({ now: T + 60 * MIN, reminders });
    try {
      const started = await startSession(withReminders.deps, { timezone: 'UTC' });
      if (!started.ok) throw new Error('start failed');
      const exported = await exportJournal(withReminders.deps);
      if (!exported.ok) throw new Error(exported.error.message);
      const json = exported.value.json;
      expect(json).not.toContain('native_request_id');
      expect(json).not.toContain('nativeRequestId');
      expect(json).not.toContain('reminder_requests');
      expect(json).not.toContain('last_observed_wall_at');
      expect(json).not.toContain('permission_explainer_shown');
      expect(json).not.toContain('access_token');
      expect(json).not.toContain('refresh_token');
      expect(exported.value.backup.sessions[0].id).toBe(started.value.session.id);
      expect(sessionId).toBeTruthy();
    } finally {
      await withReminders.close();
    }
  });

  it('is idempotent when the same backup is merged twice', async () => {
    await seedSource();
    const exported = await exportJournal(source.deps);
    if (!exported.ok) throw new Error(exported.error.message);
    const first = await importJournal(target.deps, {
      text: exported.value.json,
      mode: 'merge',
    });
    const second = await importJournal(target.deps, {
      text: exported.value.json,
      mode: 'merge',
    });
    expect(first.ok && second.ok).toBe(true);
    const reExported = await exportJournal(target.deps);
    if (!reExported.ok) throw new Error(reExported.error.message);
    expect(reExported.value.backup.sessions).toHaveLength(1);
    expect(reExported.value.backup.entries).toHaveLength(3);
  });

  it('keeps the device reminder preference on merge', async () => {
    await seedSource();
    const exported = await exportJournal(source.deps);
    if (!exported.ok) throw new Error(exported.error.message);
    await setRemindersEnabled(target.db, true);
    const merged = await importJournal(target.deps, {
      text: exported.value.json,
      mode: 'merge',
    });
    expect(merged.ok).toBe(true);
    const reExported = await exportJournal(target.deps);
    if (!reExported.ok) throw new Error(reExported.error.message);
    expect(reExported.value.backup.settings.remindersEnabled).toBe(true);
  });

  it('rejects malformed JSON without touching the journal', async () => {
    await seedSource();
    const before = await exportJournal(source.deps);
    if (!before.ok) throw new Error(before.error.message);
    const result = await importJournal(source.deps, {
      text: '{ not json',
      mode: 'replace',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('BACKUP_INVALID');
    const after = await exportJournal(source.deps);
    if (!after.ok) throw new Error(after.error.message);
    expect(after.value.backup.sessions).toEqual(before.value.backup.sessions);
    expect(after.value.backup.entries).toEqual(before.value.backup.entries);
  });

  it('rejects an unsupported export version', async () => {
    const exported = await exportJournal(source.deps);
    if (!exported.ok) throw new Error(exported.error.message);
    const newer = JSON.parse(exported.value.json);
    newer.exportVersion = 99;
    const result = await importJournal(source.deps, {
      text: JSON.stringify(newer),
      mode: 'replace',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('BACKUP_VERSION_UNSUPPORTED');
  });

  it('rejects overlapping entries and leaves the journal untouched', async () => {
    const { firstEntryId } = await seedSource();
    const before = await exportJournal(source.deps);
    if (!before.ok) throw new Error(before.error.message);
    const payload = JSON.parse(before.value.json);
    const entry = payload.entries.find(
      (candidate: { id: string }) => candidate.id === firstEntryId,
    );
    entry.endAt = entry.endAt + 5 * MIN;
    const result = await importJournal(source.deps, {
      text: JSON.stringify(payload),
      mode: 'replace',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('BACKUP_INVALID');
    const after = await exportJournal(source.deps);
    if (!after.ok) throw new Error(after.error.message);
    expect(after.value.backup.entries).toEqual(before.value.backup.entries);
  });

  it('rejects an entry that references a missing session', async () => {
    await seedSource();
    const exported = await exportJournal(source.deps);
    if (!exported.ok) throw new Error(exported.error.message);
    const payload = JSON.parse(exported.value.json);
    payload.entries[0].sessionId = 'missing-session';
    const result = await importJournal(target.deps, {
      text: JSON.stringify(payload),
      mode: 'replace',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('BACKUP_INVALID');
  });

  it('rolls the whole replace back when a write fails mid-import', async () => {
    await seedSource();
    const exported = await exportJournal(source.deps);
    if (!exported.ok) throw new Error(exported.error.message);
    const survivor = await startSession(target.deps, { timezone: 'UTC' });
    if (!survivor.ok) throw new Error('start failed');
    target.setNow(T + 45 * MIN);
    const existing = await createEntry(target.deps, {
      sessionId: survivor.value.session.id,
      range: { startAt: T + 30 * MIN, endAt: T + 45 * MIN },
      description: 'Existing row',
      actionId: 'existing-action',
    });
    expect(existing.ok).toBe(true);

    const failingDeps = { ...target.deps, db: failAfterWrites(target.deps.db, 2) };
    const result = await importJournal(failingDeps, {
      text: exported.value.json,
      mode: 'replace',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('BACKUP_IMPORT_FAILED');

    const after = await exportJournal(target.deps);
    if (!after.ok) throw new Error(after.error.message);
    expect(after.value.backup.sessions).toHaveLength(1);
    expect(after.value.backup.sessions[0].id).toBe(survivor.value.session.id);
    expect(after.value.backup.entries).toHaveLength(1);
    expect(after.value.backup.entries[0].description).toBe('Existing row');
  });

  it('rebuilds reminders from the restored state instead of importing ids', async () => {
    const reminders = new FakeReminderPort();
    const restoring = await createHarness({ now: T + 5 * MIN, reminders });
    try {
      const exported = await exportJournal(source.deps);
      if (!exported.ok) throw new Error(exported.error.message);
      // Import a closed journal: no pending reminders afterwards.
      const closed = await importJournal(restoring.deps, {
        text: exported.value.json,
        mode: 'replace',
      });
      expect(closed.ok).toBe(true);
      expect(reminders.pending.size).toBe(0);
      expect(reminders.scheduled).toHaveLength(0);

      // Import a journal with a live active session: reminders are scheduled
      // from SQLite, never from the file.
      const live = await startSession(source.deps, { timezone: 'UTC' });
      if (!live.ok) throw new Error('start failed');
      const liveExport = await exportJournal(source.deps);
      if (!liveExport.ok) throw new Error(liveExport.error.message);
      const importedLive = await importJournal(restoring.deps, {
        text: liveExport.value.json,
        mode: 'replace',
      });
      expect(importedLive.ok).toBe(true);
      expect(reminders.scheduled).toHaveLength(48);
      expect(reminders.pending.size).toBe(48);
    } finally {
      await restoring.close();
    }
  });

  it('refuses to merge an active session over a different running session', async () => {
    await target.close();
    target = await createHarness({ now: T + 30 * MIN, idPrefix: 'target' });
    const live = await startSession(source.deps, { timezone: 'UTC' });
    if (!live.ok) throw new Error('start failed');
    const exported = await exportJournal(source.deps);
    if (!exported.ok) throw new Error(exported.error.message);
    const running = await startSession(target.deps, { timezone: 'UTC' });
    expect(running.ok).toBe(true);
    expect(running.ok && running.value.session.id).not.toBe(live.value.session.id);
    const result = await importJournal(target.deps, {
      text: exported.value.json,
      mode: 'merge',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('BACKUP_CONFLICT');
  });
});
