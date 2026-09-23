import type { Millis, TimeRange } from '../../domain/time/types';
import type { Session } from '../../domain/tracking/types';
import { sessionFromRow } from '../rows';
import type { SessionRow, SqlExecutor } from '../types';

const SESSION_COLUMNS = `id, started_at, ended_at, reminder_window_end_at,
  interval_seconds, start_timezone, status, created_at, updated_at`;

export async function getActiveSession(db: SqlExecutor): Promise<Session | null> {
  const row = await db.getFirstAsync<SessionRow>(
    `SELECT ${SESSION_COLUMNS} FROM tracking_sessions WHERE status = 'active' LIMIT 1`,
  );
  return row ? sessionFromRow(row) : null;
}

export async function getSessionById(
  db: SqlExecutor,
  sessionId: string,
): Promise<Session | null> {
  const row = await db.getFirstAsync<SessionRow>(
    `SELECT ${SESSION_COLUMNS} FROM tracking_sessions WHERE id = ?`,
    [sessionId],
  );
  return row ? sessionFromRow(row) : null;
}

export async function insertSession(db: SqlExecutor, session: Session): Promise<void> {
  await db.runAsync(
    `INSERT INTO tracking_sessions (${SESSION_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

export async function closeSessionRow(
  db: SqlExecutor,
  sessionId: string,
  endedAt: Millis,
  updatedAt: Millis,
): Promise<number> {
  const result = await db.runAsync(
    `UPDATE tracking_sessions
     SET ended_at = ?, status = 'closed', updated_at = ?
     WHERE id = ? AND status = 'active'`,
    [endedAt, updatedAt, sessionId],
  );
  return result.changes;
}

export async function listSessionsOverlapping(
  db: SqlExecutor,
  window: TimeRange,
): Promise<Session[]> {
  const rows = await db.getAllAsync<SessionRow>(
    `SELECT ${SESSION_COLUMNS} FROM tracking_sessions
     WHERE started_at < ? AND COALESCE(ended_at, reminder_window_end_at) > ?
     ORDER BY started_at ASC`,
    [window.endAt, window.startAt],
  );
  return rows.map(sessionFromRow);
}

export async function listAllSessions(db: SqlExecutor): Promise<Session[]> {
  const rows = await db.getAllAsync<SessionRow>(
    `SELECT ${SESSION_COLUMNS} FROM tracking_sessions ORDER BY started_at DESC`,
  );
  return rows.map(sessionFromRow);
}

export async function listTrackedSessionStarts(db: SqlExecutor): Promise<number[]> {
  const rows = await db.getAllAsync<{ started_at: number }>(
    'SELECT started_at FROM tracking_sessions ORDER BY started_at DESC',
  );
  return rows.map((row) => row.started_at);
}
