import { TrackingError } from '../domain/tracking/errors';
import type { Entry, Session } from '../domain/tracking/types';
import type { EntryRow, SessionRow } from './types';

function assertStatus(value: string): Session['status'] {
  if (value !== 'active' && value !== 'closed') {
    throw new TrackingError('STORAGE_FAILURE', `Unknown session status: ${value}`);
  }
  return value;
}

export function sessionFromRow(row: SessionRow): Session {
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    reminderWindowEndAt: row.reminder_window_end_at,
    intervalSeconds: row.interval_seconds,
    startTimezone: row.start_timezone,
    status: assertStatus(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function entryFromRow(row: EntryRow): Entry {
  const kind = row.kind === 'skipped' ? 'skipped' : 'logged';
  return {
    id: row.id,
    sessionId: row.session_id,
    startAt: row.start_at,
    endAt: row.end_at,
    kind,
    description: row.description,
    category: (row.category as Entry['category']) ?? null,
    origin: row.origin as Entry['origin'],
    clientActionId: row.client_action_id,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}
