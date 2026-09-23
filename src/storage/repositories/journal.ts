import type { Entry, Session } from '../../domain/tracking/types';
import { entryFromRow, sessionFromRow } from '../rows';
import type { EntryRow, SessionRow, SqlExecutor } from '../types';
import { ENTRY_COLUMNS } from './entries';
import { SESSION_COLUMNS } from './sessions';

export async function listAllEntries(db: SqlExecutor): Promise<Entry[]> {
  const rows = await db.getAllAsync<EntryRow>(
    `SELECT ${ENTRY_COLUMNS} FROM entries ORDER BY start_at ASC`,
  );
  return rows.map(entryFromRow);
}

export async function listAllSessionsForBackup(db: SqlExecutor): Promise<Session[]> {
  const rows = await db.getAllAsync<SessionRow>(
    `SELECT ${SESSION_COLUMNS} FROM tracking_sessions ORDER BY started_at ASC`,
  );
  return rows.map(sessionFromRow);
}

const SESSION_UPDATE = `started_at = excluded.started_at,
  ended_at = excluded.ended_at,
  reminder_window_end_at = excluded.reminder_window_end_at,
  interval_seconds = excluded.interval_seconds,
  start_timezone = excluded.start_timezone,
  status = excluded.status,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at`;

const ENTRY_UPDATE = `session_id = excluded.session_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  kind = excluded.kind,
  description = excluded.description,
  category = excluded.category,
  origin = excluded.origin,
  client_action_id = excluded.client_action_id,
  revision = excluded.revision,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  deleted_at = excluded.deleted_at`;

export async function upsertSessionRow(db: SqlExecutor, session: Session): Promise<void> {
  await db.runAsync(
    `INSERT INTO tracking_sessions (${SESSION_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET ${SESSION_UPDATE}`,
    [
      session.id,
      session.startedAt,
      session.endedAt,
      session.reminderWindowEndAt,
      session.intervalSeconds,
      session.startTimezone,
      session.status,
      session.createdAt,
      session.updatedAt,
    ],
  );
}

export async function upsertEntryRow(db: SqlExecutor, entry: Entry): Promise<void> {
  await db.runAsync(
    `INSERT INTO entries (${ENTRY_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET ${ENTRY_UPDATE}`,
    [
      entry.id,
      entry.sessionId,
      entry.startAt,
      entry.endAt,
      entry.kind,
      entry.description,
      entry.category,
      entry.origin,
      entry.clientActionId,
      entry.revision,
      entry.createdAt,
      entry.updatedAt,
      entry.deletedAt,
    ],
  );
}

/** Removes the whole journal; reminder metadata is rebuilt from the import. */
export async function clearJournal(db: SqlExecutor): Promise<void> {
  await db.runAsync('DELETE FROM reminder_requests');
  await db.runAsync('DELETE FROM entries');
  await db.runAsync('DELETE FROM tracking_sessions');
}
