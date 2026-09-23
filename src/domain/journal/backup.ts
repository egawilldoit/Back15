import { fail, ok } from '../tracking/errors';
import type { Result } from '../tracking/errors';
import type { Category, EntryKind, EntryOrigin, SessionStatus } from '../tracking/types';
import { isCategory } from '../tracking/types';
import type { Millis } from '../time/types';

export const JOURNAL_FORMAT = 'back15-journal';
export const EXPORT_VERSION = 1;

export interface JournalBackupSession {
  id: string;
  startedAt: Millis;
  endedAt: Millis | null;
  reminderWindowEndAt: Millis;
  intervalSeconds: number;
  startTimezone: string;
  status: SessionStatus;
  createdAt: Millis;
  updatedAt: Millis;
}

export interface JournalBackupEntry {
  id: string;
  sessionId: string;
  startAt: Millis;
  endAt: Millis;
  kind: EntryKind;
  description: string | null;
  category: Category | null;
  origin: EntryOrigin;
  clientActionId: string | null;
  revision: number;
  createdAt: Millis;
  updatedAt: Millis;
  deletedAt: Millis | null;
}

export interface JournalBackupSettings {
  /**
   * Device preference. A replace restore writes it back; a merge keeps the
   * phone's current value. No setting is required to interpret the journal:
   * every session stores its own start time zone.
   */
  remindersEnabled: boolean;
}

export interface JournalBackup {
  format: typeof JOURNAL_FORMAT;
  exportVersion: number;
  schemaVersion: number;
  createdAt: Millis;
  timeZone: string;
  appVersion: string | null;
  settings: JournalBackupSettings;
  sessions: JournalBackupSession[];
  entries: JournalBackupEntry[];
}

export interface BuildBackupInput {
  createdAt: Millis;
  timeZone: string;
  appVersion: string | null;
  schemaVersion: number;
  remindersEnabled: boolean;
  sessions: readonly JournalBackupSession[];
  entries: readonly JournalBackupEntry[];
}

export function buildJournalBackup(input: BuildBackupInput): JournalBackup {
  return {
    format: JOURNAL_FORMAT,
    exportVersion: EXPORT_VERSION,
    schemaVersion: input.schemaVersion,
    createdAt: input.createdAt,
    timeZone: input.timeZone,
    appVersion: input.appVersion,
    settings: { remindersEnabled: input.remindersEnabled },
    sessions: [...input.sessions],
    entries: [...input.entries],
  };
}

export function serializeJournalBackup(backup: JournalBackup): string {
  return JSON.stringify(backup, null, 2);
}

const SESSION_STATUSES: SessionStatus[] = ['active', 'closed'];
const ENTRY_KINDS: EntryKind[] = ['logged', 'skipped'];
const ENTRY_ORIGINS: EntryOrigin[] = ['typed', 'continued', 'backfilled', 'skipped'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMillis(value: unknown): value is Millis {
  return typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value);
}

function readSession(value: unknown, index: number): Result<JournalBackupSession> {
  if (!isRecord(value)) {
    return fail('BACKUP_INVALID', `Session ${index} is not an object.`);
  }
  const { id, startedAt, endedAt, reminderWindowEndAt, intervalSeconds, startTimezone, status } = value;
  if (typeof id !== 'string' || id.length === 0) {
    return fail('BACKUP_INVALID', `Session ${index} has no id.`);
  }
  if (!isMillis(startedAt) || !isMillis(reminderWindowEndAt) || !isMillis(value.createdAt) || !isMillis(value.updatedAt)) {
    return fail('BACKUP_INVALID', `Session ${id} has invalid timestamps.`);
  }
  if (endedAt !== null && !isMillis(endedAt)) {
    return fail('BACKUP_INVALID', `Session ${id} has an invalid end time.`);
  }
  if (typeof intervalSeconds !== 'number' || intervalSeconds <= 0) {
    return fail('BACKUP_INVALID', `Session ${id} has an invalid interval.`);
  }
  if (typeof startTimezone !== 'string' || startTimezone.length === 0) {
    return fail('BACKUP_INVALID', `Session ${id} has no start time zone.`);
  }
  if (typeof status !== 'string' || !SESSION_STATUSES.includes(status as SessionStatus)) {
    return fail('BACKUP_INVALID', `Session ${id} has an unknown status.`);
  }
  const typedStatus = status as SessionStatus;
  if (typedStatus === 'active' && endedAt !== null) {
    return fail('BACKUP_INVALID', `Session ${id} is active but has an end time.`);
  }
  if (typedStatus === 'closed' && endedAt === null) {
    return fail('BACKUP_INVALID', `Session ${id} is closed but has no end time.`);
  }
  if (endedAt !== null && endedAt < startedAt) {
    return fail('BACKUP_INVALID', `Session ${id} ends before it starts.`);
  }
  if (reminderWindowEndAt <= startedAt) {
    return fail('BACKUP_INVALID', `Session ${id} has an invalid reminder window.`);
  }
  return ok({
    id,
    startedAt,
    endedAt,
    reminderWindowEndAt,
    intervalSeconds,
    startTimezone,
    status: typedStatus,
    createdAt: value.createdAt as Millis,
    updatedAt: value.updatedAt as Millis,
  });
}

function readEntry(value: unknown, index: number): Result<JournalBackupEntry> {
  if (!isRecord(value)) {
    return fail('BACKUP_INVALID', `Entry ${index} is not an object.`);
  }
  const { id, sessionId, startAt, endAt, kind, description, category, origin, clientActionId, revision, deletedAt } = value;
  if (typeof id !== 'string' || id.length === 0) {
    return fail('BACKUP_INVALID', `Entry ${index} has no id.`);
  }
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return fail('BACKUP_INVALID', `Entry ${id} has no session.`);
  }
  if (!isMillis(startAt) || !isMillis(endAt) || endAt <= startAt) {
    return fail('BACKUP_INVALID', `Entry ${id} has an invalid range.`);
  }
  if (typeof kind !== 'string' || !ENTRY_KINDS.includes(kind as EntryKind)) {
    return fail('BACKUP_INVALID', `Entry ${id} has an unknown kind.`);
  }
  if (typeof origin !== 'string' || !ENTRY_ORIGINS.includes(origin as EntryOrigin)) {
    return fail('BACKUP_INVALID', `Entry ${id} has an unknown origin.`);
  }
  if (description !== null && typeof description !== 'string') {
    return fail('BACKUP_INVALID', `Entry ${id} has an invalid description.`);
  }
  if (category !== null && !isCategory(category)) {
    return fail('BACKUP_INVALID', `Entry ${id} has an unknown category.`);
  }
  if (clientActionId !== null && typeof clientActionId !== 'string') {
    return fail('BACKUP_INVALID', `Entry ${id} has an invalid action id.`);
  }
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1) {
    return fail('BACKUP_INVALID', `Entry ${id} has an invalid revision.`);
  }
  if (deletedAt !== null && !isMillis(deletedAt)) {
    return fail('BACKUP_INVALID', `Entry ${id} has an invalid deletion time.`);
  }
  if (!isMillis(value.createdAt) || !isMillis(value.updatedAt)) {
    return fail('BACKUP_INVALID', `Entry ${id} has invalid timestamps.`);
  }
  if (kind === 'logged' && (description === null || description.trim().length === 0)) {
    return fail('BACKUP_INVALID', `Entry ${id} is recorded but has no description.`);
  }
  if (kind === 'skipped' && (description !== null || category !== null)) {
    return fail('BACKUP_INVALID', `Entry ${id} is skipped but carries text or a category.`);
  }
  return ok({
    id,
    sessionId,
    startAt,
    endAt,
    kind: kind as EntryKind,
    description: description === null ? null : description,
    category: (category as Category | null) ?? null,
    origin: origin as EntryOrigin,
    clientActionId: clientActionId === null ? null : clientActionId,
    revision,
    createdAt: value.createdAt as Millis,
    updatedAt: value.updatedAt as Millis,
    deletedAt: deletedAt === null ? null : (deletedAt as Millis),
  });
}

/**
 * Validates a backup file without touching storage. Every failure names the
 * row that is wrong so a user can fix or discard the file.
 */
export function parseJournalBackup(
  text: string,
  supportedSchemaVersion: number,
): Result<JournalBackup> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('BACKUP_INVALID', 'This file is not valid JSON.');
  }
  if (!isRecord(raw)) {
    return fail('BACKUP_INVALID', 'This file does not contain a journal backup.');
  }
  if (raw.format !== JOURNAL_FORMAT) {
    return fail('BACKUP_INVALID', 'This file is not a Back15 journal backup.');
  }
  if (typeof raw.exportVersion !== 'number' || !Number.isInteger(raw.exportVersion)) {
    return fail('BACKUP_INVALID', 'The backup has no export version.');
  }
  if (raw.exportVersion > EXPORT_VERSION) {
    return fail(
      'BACKUP_VERSION_UNSUPPORTED',
      'This backup was written by a newer Back15 version. Update the app first.',
      { exportVersion: raw.exportVersion, supportedVersion: EXPORT_VERSION },
    );
  }
  if (typeof raw.schemaVersion !== 'number' || !Number.isInteger(raw.schemaVersion)) {
    return fail('BACKUP_INVALID', 'The backup has no schema version.');
  }
  if (raw.schemaVersion > supportedSchemaVersion) {
    return fail(
      'BACKUP_VERSION_UNSUPPORTED',
      'This backup uses a newer storage schema. Update the app first.',
      { schemaVersion: raw.schemaVersion, supportedVersion: supportedSchemaVersion },
    );
  }
  if (!isMillis(raw.createdAt)) {
    return fail('BACKUP_INVALID', 'The backup has no creation timestamp.');
  }
  if (typeof raw.timeZone !== 'string' || raw.timeZone.length === 0) {
    return fail('BACKUP_INVALID', 'The backup has no time zone.');
  }
  if (!Array.isArray(raw.sessions) || !Array.isArray(raw.entries)) {
    return fail('BACKUP_INVALID', 'The backup is missing its sessions or entries.');
  }

  const sessions: JournalBackupSession[] = [];
  const sessionIds = new Set<string>();
  for (let index = 0; index < raw.sessions.length; index += 1) {
    const parsed = readSession(raw.sessions[index], index);
    if (!parsed.ok) return parsed;
    if (sessionIds.has(parsed.value.id)) {
      return fail('BACKUP_INVALID', `Session ${parsed.value.id} appears twice.`);
    }
    sessionIds.add(parsed.value.id);
    sessions.push(parsed.value);
  }
  const activeSessions = sessions.filter((session) => session.status === 'active');
  if (activeSessions.length > 1) {
    return fail('BACKUP_INVALID', 'The backup contains more than one active session.');
  }

  const entries: JournalBackupEntry[] = [];
  const entryIds = new Set<string>();
  const actionIds = new Set<string>();
  for (let index = 0; index < raw.entries.length; index += 1) {
    const parsed = readEntry(raw.entries[index], index);
    if (!parsed.ok) return parsed;
    const entry = parsed.value;
    if (entryIds.has(entry.id)) {
      return fail('BACKUP_INVALID', `Entry ${entry.id} appears twice.`);
    }
    entryIds.add(entry.id);
    if (entry.clientActionId !== null) {
      if (actionIds.has(entry.clientActionId)) {
        return fail('BACKUP_INVALID', 'Two entries share the same client action id.');
      }
      actionIds.add(entry.clientActionId);
    }
    entries.push(entry);
  }

  const settings = isRecord(raw.settings) ? raw.settings : {};
  const remindersEnabled =
    typeof settings.remindersEnabled === 'boolean' ? settings.remindersEnabled : true;

  // Relationship and range checks per session, then overlap checks.
  for (const session of sessions) {
    const live = entries
      .filter((entry) => entry.sessionId === session.id && entry.deletedAt === null)
      .sort((a, b) => a.startAt - b.startAt);
    const effectiveEnd = session.endedAt ?? session.reminderWindowEndAt;
    for (const entry of live) {
      if (entry.startAt < session.startedAt || entry.endAt > effectiveEnd) {
        return fail(
          'BACKUP_INVALID',
          `Entry ${entry.id} falls outside its session.`,
          { entryId: entry.id, sessionId: session.id },
        );
      }
    }
    for (let index = 1; index < live.length; index += 1) {
      if (live[index - 1].endAt > live[index].startAt) {
        return fail(
          'BACKUP_INVALID',
          `Entries ${live[index - 1].id} and ${live[index].id} overlap.`,
          { sessionId: session.id },
        );
      }
    }
  }
  const unknownSession = entries.find((entry) => !sessionIds.has(entry.sessionId));
  if (unknownSession) {
    return fail(
      'BACKUP_INVALID',
      `Entry ${unknownSession.id} belongs to a session that is not in the file.`,
      { entryId: unknownSession.id },
    );
  }

  return ok({
    format: JOURNAL_FORMAT,
    exportVersion: raw.exportVersion,
    schemaVersion: raw.schemaVersion,
    createdAt: raw.createdAt,
    timeZone: raw.timeZone,
    appVersion: typeof raw.appVersion === 'string' ? raw.appVersion : null,
    settings: { remindersEnabled },
    sessions,
    entries,
  });
}
