import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrackingError } from '../domain/tracking/errors';
import { createTestDatabase } from '../../tests/support/nodeDatabase';
import type { TestDatabase } from '../../tests/support/nodeDatabase';
import { migrate, readSchemaVersion } from './migrations';
import { SCHEMA_VERSION } from './sql';

describe('schema migration', () => {
  let db: TestDatabase;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  it('creates the full schema on a fresh database', async () => {
    await migrate(db);
    expect(await readSchemaVersion(db)).toBe(SCHEMA_VERSION);
    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    const names = tables.map((row) => row.name);
    expect(names).toContain('tracking_sessions');
    expect(names).toContain('entries');
    expect(names).toContain('reminder_requests');
    expect(names).toContain('app_settings');
  });

  it('is idempotent when run twice', async () => {
    await migrate(db);
    await migrate(db);
    expect(await readSchemaVersion(db)).toBe(SCHEMA_VERSION);
  });

  it('refuses a database written by a newer version without touching it', async () => {
    await migrate(db);
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION + 5}`);
    await expect(migrate(db)).rejects.toBeInstanceOf(TrackingError);
    expect(await readSchemaVersion(db)).toBe(SCHEMA_VERSION + 5);
  });

  it('enforces foreign keys on every connection', async () => {
    await migrate(db);
    await expect(
      db.runAsync(
        `INSERT INTO entries (id, session_id, start_at, end_at, kind, description, origin, created_at, updated_at)
         VALUES ('e1', 'missing', 0, 10, 'logged', 'x', 'typed', 0, 0)`,
      ),
    ).rejects.toThrow();
  });

  it('allows only one active session', async () => {
    await migrate(db);
    const insert = (id: string, status: string, endedAt: number | null) =>
      db.runAsync(
        `INSERT INTO tracking_sessions
           (id, started_at, ended_at, reminder_window_end_at, interval_seconds, start_timezone, status, created_at, updated_at)
         VALUES (?, 0, ?, 1000, 900, 'UTC', ?, 0, 0)`,
        [id, endedAt, status],
      );
    await insert('s1', 'active', null);
    await expect(insert('s2', 'active', null)).rejects.toThrow();
    await insert('s2', 'closed', 10);
  });

  it('enforces entry range and text constraints', async () => {
    await migrate(db);
    await db.runAsync(
      `INSERT INTO tracking_sessions
         (id, started_at, ended_at, reminder_window_end_at, interval_seconds, start_timezone, status, created_at, updated_at)
       VALUES ('s1', 0, NULL, 43200000, 900, 'UTC', 'active', 0, 0)`,
    );
    const insertEntry = (id: string, startAt: number, endAt: number, kind: string, description: string | null) =>
      db.runAsync(
        `INSERT INTO entries (id, session_id, start_at, end_at, kind, description, origin, created_at, updated_at)
         VALUES (?, 's1', ?, ?, ?, ?, 'typed', 0, 0)`,
        [id, startAt, endAt, kind, description],
      );
    await expect(insertEntry('e1', 10, 10, 'logged', 'x')).rejects.toThrow();
    await expect(insertEntry('e2', 10, 20, 'logged', '   ')).rejects.toThrow();
    await expect(insertEntry('e3', 10, 20, 'skipped', 'text')).rejects.toThrow();
    await insertEntry('e4', 10, 20, 'skipped', null);
  });

  it('enforces the unique client action id but allows many nulls', async () => {
    await migrate(db);
    await db.runAsync(
      `INSERT INTO tracking_sessions
         (id, started_at, ended_at, reminder_window_end_at, interval_seconds, start_timezone, status, created_at, updated_at)
       VALUES ('s1', 0, NULL, 43200000, 900, 'UTC', 'active', 0, 0)`,
    );
    const insertEntry = (id: string, actionId: string | null, startAt: number) =>
      db.runAsync(
        `INSERT INTO entries (id, session_id, start_at, end_at, kind, description, origin, client_action_id, created_at, updated_at)
         VALUES (?, 's1', ?, ?, 'logged', 'x', 'typed', ?, 0, 0)`,
        [id, startAt, startAt + 10, actionId],
      );
    await insertEntry('e1', 'action-1', 0);
    await expect(insertEntry('e2', 'action-1', 100)).rejects.toThrow();
    await insertEntry('e3', null, 200);
    await insertEntry('e4', null, 300);
  });
});
