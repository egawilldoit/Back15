import type { Millis, TimeRange } from '../../domain/time/types';
import type { Entry } from '../../domain/tracking/types';
import { entryFromRow } from '../rows';
import type { EntryRow, SqlExecutor } from '../types';

export const ENTRY_COLUMNS = `id, session_id, start_at, end_at, kind, description, category,
  origin, client_action_id, revision, created_at, updated_at, deleted_at`;

export async function listEntriesForSession(
  db: SqlExecutor,
  sessionId: string,
): Promise<Entry[]> {
  const rows = await db.getAllAsync<EntryRow>(
    `SELECT ${ENTRY_COLUMNS} FROM entries WHERE session_id = ? ORDER BY start_at ASC`,
    [sessionId],
  );
  return rows.map(entryFromRow);
}

export async function listLiveEntriesForSession(
  db: SqlExecutor,
  sessionId: string,
): Promise<Entry[]> {
  const rows = await db.getAllAsync<EntryRow>(
    `SELECT ${ENTRY_COLUMNS} FROM entries
     WHERE session_id = ? AND deleted_at IS NULL ORDER BY start_at ASC`,
    [sessionId],
  );
  return rows.map(entryFromRow);
}

export async function listLiveEntriesOverlapping(
  db: SqlExecutor,
  window: TimeRange,
): Promise<Entry[]> {
  const rows = await db.getAllAsync<EntryRow>(
    `SELECT ${ENTRY_COLUMNS} FROM entries
     WHERE deleted_at IS NULL AND start_at < ? AND end_at > ?
     ORDER BY start_at ASC`,
    [window.endAt, window.startAt],
  );
  return rows.map(entryFromRow);
}

export async function getEntryById(db: SqlExecutor, entryId: string): Promise<Entry | null> {
  const row = await db.getFirstAsync<EntryRow>(
    `SELECT ${ENTRY_COLUMNS} FROM entries WHERE id = ?`,
    [entryId],
  );
  return row ? entryFromRow(row) : null;
}

export async function findEntryByActionId(
  db: SqlExecutor,
  actionId: string,
): Promise<Entry | null> {
  const row = await db.getFirstAsync<EntryRow>(
    `SELECT ${ENTRY_COLUMNS} FROM entries WHERE client_action_id = ?`,
    [actionId],
  );
  return row ? entryFromRow(row) : null;
}

export async function findOverlappingEntryRow(
  db: SqlExecutor,
  sessionId: string,
  range: TimeRange,
  excludeEntryId?: string,
): Promise<Entry | null> {
  const row = await db.getFirstAsync<EntryRow>(
    `SELECT ${ENTRY_COLUMNS} FROM entries
     WHERE session_id = ? AND deleted_at IS NULL
       AND start_at < ? AND end_at > ?
       AND (? IS NULL OR id != ?)
     ORDER BY start_at ASC LIMIT 1`,
    [sessionId, range.endAt, range.startAt, excludeEntryId ?? null, excludeEntryId ?? null],
  );
  return row ? entryFromRow(row) : null;
}

export async function insertEntry(db: SqlExecutor, entry: Entry): Promise<void> {
  await db.runAsync(
    `INSERT INTO entries (${ENTRY_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

export interface EntryUpdateRow {
  id: string;
  startAt: Millis;
  endAt: Millis;
  kind: Entry['kind'];
  description: string | null;
  category: Entry['category'];
  origin: Entry['origin'];
  updatedAt: Millis;
}

/** Optimistic update; returns 0 changes when the revision is stale. */
export async function updateEntryRow(
  db: SqlExecutor,
  update: EntryUpdateRow,
  expectedRevision: number,
): Promise<number> {
  const result = await db.runAsync(
    `UPDATE entries
     SET start_at = ?, end_at = ?, kind = ?, description = ?, category = ?,
         origin = ?, updated_at = ?, revision = revision + 1
     WHERE id = ? AND revision = ? AND deleted_at IS NULL`,
    [
      update.startAt,
      update.endAt,
      update.kind,
      update.description,
      update.category,
      update.origin,
      update.updatedAt,
      update.id,
      expectedRevision,
    ],
  );
  return result.changes;
}

export async function tombstoneEntryRow(
  db: SqlExecutor,
  entryId: string,
  expectedRevision: number,
  deletedAt: Millis,
): Promise<number> {
  const result = await db.runAsync(
    `UPDATE entries
     SET deleted_at = ?, updated_at = ?, revision = revision + 1
     WHERE id = ? AND revision = ? AND deleted_at IS NULL`,
    [deletedAt, deletedAt, entryId, expectedRevision],
  );
  return result.changes;
}

export async function latestLiveLoggedEntry(
  db: SqlExecutor,
  sessionId: string,
  beforeAt: Millis,
): Promise<Entry | null> {
  const row = await db.getFirstAsync<EntryRow>(
    `SELECT ${ENTRY_COLUMNS} FROM entries
     WHERE session_id = ? AND kind = 'logged' AND deleted_at IS NULL AND end_at <= ?
     ORDER BY end_at DESC, created_at DESC LIMIT 1`,
    [sessionId, beforeAt],
  );
  return row ? entryFromRow(row) : null;
}

export async function countLiveEntriesForSession(
  db: SqlExecutor,
  sessionId: string,
): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM entries WHERE session_id = ? AND deleted_at IS NULL',
    [sessionId],
  );
  return row?.count ?? 0;
}
