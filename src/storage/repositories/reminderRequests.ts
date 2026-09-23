import type { SqlExecutor } from '../types';

export interface ReminderRequestRecord {
  sessionId: string;
  dueAt: number;
  nativeRequestId: string | null;
}

export async function listReminderRequests(
  db: SqlExecutor,
  sessionId?: string,
): Promise<ReminderRequestRecord[]> {
  const rows = sessionId
    ? await db.getAllAsync<{ session_id: string; due_at: number; native_request_id: string | null }>(
        'SELECT session_id, due_at, native_request_id FROM reminder_requests WHERE session_id = ? ORDER BY due_at ASC',
        [sessionId],
      )
    : await db.getAllAsync<{ session_id: string; due_at: number; native_request_id: string | null }>(
        'SELECT session_id, due_at, native_request_id FROM reminder_requests ORDER BY due_at ASC',
      );
  return rows.map((row) => ({
    sessionId: row.session_id,
    dueAt: row.due_at,
    nativeRequestId: row.native_request_id,
  }));
}

export async function upsertReminderRequest(
  db: SqlExecutor,
  record: ReminderRequestRecord,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO reminder_requests (session_id, due_at, native_request_id)
     VALUES (?, ?, ?)
     ON CONFLICT(session_id, due_at) DO UPDATE SET native_request_id = excluded.native_request_id`,
    [record.sessionId, record.dueAt, record.nativeRequestId],
  );
}

export async function deleteReminderRequest(
  db: SqlExecutor,
  sessionId: string,
  dueAt: number,
): Promise<void> {
  await db.runAsync(
    'DELETE FROM reminder_requests WHERE session_id = ? AND due_at = ?',
    [sessionId, dueAt],
  );
}

export async function deleteReminderRequestsForSession(
  db: SqlExecutor,
  sessionId: string,
): Promise<void> {
  await db.runAsync('DELETE FROM reminder_requests WHERE session_id = ?', [sessionId]);
}
