import type { Millis, TimeRange } from '../domain/time/types';
import { TrackingError, fail, ok } from '../domain/tracking/errors';
import type { Result } from '../domain/tracking/errors';
import type { Category, Entry, EntryKind, EntryOrigin } from '../domain/tracking/types';
import { isCategory } from '../domain/tracking/types';
import {
  normalizeDescription,
  validateDescription,
  validateNoOverlap,
  validateRangeInSession,
} from '../domain/tracking/validation';
import {
  findEntryByActionId,
  findOverlappingEntryRow,
  getEntryById,
  insertEntry,
  latestLiveLoggedEntry,
  listLiveEntriesForSession,
  tombstoneEntryRow,
  updateEntryRow,
} from '../storage/repositories/entries';
import { getSessionById } from '../storage/repositories/sessions';
import type { SqlExecutor } from '../storage/types';
import type { UseCaseDeps } from './deps';

function toTrackingError(error: unknown): TrackingError {
  if (error instanceof TrackingError) return error;
  return new TrackingError('STORAGE_FAILURE', 'Local storage could not complete that action.', {
    cause: error instanceof Error ? error.message : String(error),
  });
}

function isUniqueViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed|constraint failed/i.test(message);
}

export interface InsertEntryInput {
  sessionId: string;
  range: TimeRange;
  kind: EntryKind;
  description?: string | null;
  category?: Category | null;
  origin: EntryOrigin;
  actionId: string;
}

/**
 * One exclusive transaction: idempotency key, session bounds, text and overlap
 * are all checked against the same snapshot before a single row is inserted.
 */
async function insertEntryTransactional(
  deps: UseCaseDeps,
  txn: SqlExecutor,
  input: InsertEntryInput,
): Promise<Result<Entry>> {
  const existing = await findEntryByActionId(txn, input.actionId);
  if (existing) return ok(existing);

  const session = await getSessionById(txn, input.sessionId);
  if (!session) {
    return fail('SESSION_NOT_FOUND', 'That session no longer exists.', {
      sessionId: input.sessionId,
    });
  }
  const now = deps.now();
  const rangeCheck = validateRangeInSession(session, input.range, now);
  if (!rangeCheck.ok) return rangeCheck;

  let description: string | null = null;
  let category: Category | null = null;
  if (input.kind === 'logged') {
    const text = validateDescription(input.description ?? '');
    if (!text.ok) return text;
    description = text.value;
    if (input.category !== null && input.category !== undefined) {
      if (!isCategory(input.category)) {
        return fail('INVALID_TEXT', 'Unknown category.');
      }
      category = input.category;
    }
  }

  const overlap = await findOverlappingEntryRow(txn, session.id, input.range);
  if (overlap) {
    return fail('RANGE_OVERLAP', 'This time already has an entry.', {
      conflictingRange: { startAt: overlap.startAt, endAt: overlap.endAt },
      conflictingEntryId: overlap.id,
    });
  }

  const entry: Entry = {
    id: deps.newId(),
    sessionId: session.id,
    startAt: input.range.startAt,
    endAt: input.range.endAt,
    kind: input.kind,
    description,
    category,
    origin: input.origin,
    clientActionId: input.actionId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await insertEntry(txn, entry);
  return ok(entry);
}

export interface CreateEntryInput {
  sessionId: string;
  range: TimeRange;
  description: string;
  category?: Category | null;
  origin?: Extract<EntryOrigin, 'typed' | 'backfilled'>;
  actionId: string;
}

export async function createEntry(
  deps: UseCaseDeps,
  input: CreateEntryInput,
): Promise<Result<Entry>> {
  try {
    let result: Result<Entry> = fail('STORAGE_FAILURE', 'The entry could not be saved.');
    await deps.db.withExclusiveTransactionAsync(async (txn) => {
      result = await insertEntryTransactional(deps, txn, {
        sessionId: input.sessionId,
        range: input.range,
        kind: 'logged',
        description: input.description,
        category: input.category ?? null,
        origin: input.origin ?? 'typed',
        actionId: input.actionId,
      });
    });
    return result;
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existing = await findEntryByActionId(deps.db, input.actionId);
      if (existing) return ok(existing);
    }
    return { ok: false, error: toTrackingError(error) };
  }
}

export interface ContinuePreviousInput {
  sessionId: string;
  range: TimeRange;
  actionId: string;
}

/** Continue copies the previous description/category into a new row. */
export async function continuePrevious(
  deps: UseCaseDeps,
  input: ContinuePreviousInput,
): Promise<Result<Entry>> {
  try {
    let result: Result<Entry> = fail('STORAGE_FAILURE', 'The entry could not be saved.');
    await deps.db.withExclusiveTransactionAsync(async (txn) => {
      const existing = await findEntryByActionId(txn, input.actionId);
      if (existing) {
        result = ok(existing);
        return;
      }
      const session = await getSessionById(txn, input.sessionId);
      if (!session) {
        result = fail('SESSION_NOT_FOUND', 'That session no longer exists.');
        return;
      }
      const previous = await latestLiveLoggedEntry(txn, session.id, input.range.startAt);
      if (!previous) {
        result = fail(
          'NO_PREVIOUS_ENTRY',
          'There is no earlier description to continue.',
          { sessionId: session.id },
        );
        return;
      }
      result = await insertEntryTransactional(deps, txn, {
        sessionId: session.id,
        range: input.range,
        kind: 'logged',
        description: previous.description,
        category: previous.category,
        origin: 'continued',
        actionId: input.actionId,
      });
    });
    return result;
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existing = await findEntryByActionId(deps.db, input.actionId);
      if (existing) return ok(existing);
    }
    return { ok: false, error: toTrackingError(error) };
  }
}

export interface SkipRangeInput {
  sessionId: string;
  range: TimeRange;
  actionId: string;
}

export async function skipRange(
  deps: UseCaseDeps,
  input: SkipRangeInput,
): Promise<Result<Entry>> {
  try {
    let result: Result<Entry> = fail('STORAGE_FAILURE', 'The span could not be skipped.');
    await deps.db.withExclusiveTransactionAsync(async (txn) => {
      result = await insertEntryTransactional(deps, txn, {
        sessionId: input.sessionId,
        range: input.range,
        kind: 'skipped',
        origin: 'skipped',
        actionId: input.actionId,
      });
    });
    return result;
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existing = await findEntryByActionId(deps.db, input.actionId);
      if (existing) return ok(existing);
    }
    return { ok: false, error: toTrackingError(error) };
  }
}

export interface UpdateEntryChanges {
  startAt: Millis;
  endAt: Millis;
  kind: EntryKind;
  description?: string | null;
  category?: Category | null;
}

export interface UpdateEntryInput {
  entryId: string;
  expectedRevision: number;
  changes: UpdateEntryChanges;
}

export async function updateEntry(
  deps: UseCaseDeps,
  input: UpdateEntryInput,
): Promise<Result<Entry>> {
  try {
    let result: Result<Entry> = fail('STORAGE_FAILURE', 'The entry could not be updated.');
    await deps.db.withExclusiveTransactionAsync(async (txn) => {
      const entry = await getEntryById(txn, input.entryId);
      if (!entry) {
        result = fail('ENTRY_NOT_FOUND', 'That entry no longer exists.');
        return;
      }
      if (entry.deletedAt !== null) {
        result = fail('ENTRY_DELETED', 'That entry was deleted.');
        return;
      }
      if (entry.revision !== input.expectedRevision) {
        result = fail(
          'REVISION_CONFLICT',
          'This entry changed in another action. Reopen it to see the latest version.',
          { latestRevision: entry.revision, entryId: entry.id },
        );
        return;
      }
      const session = await getSessionById(txn, entry.sessionId);
      if (!session) {
        result = fail('SESSION_NOT_FOUND', 'That session no longer exists.');
        return;
      }
      const now = deps.now();
      const range = { startAt: input.changes.startAt, endAt: input.changes.endAt };
      const rangeCheck = validateRangeInSession(session, range, now);
      if (!rangeCheck.ok) {
        result = rangeCheck;
        return;
      }
      let description: string | null = null;
      let category: Category | null = null;
      if (input.changes.kind === 'logged') {
        const text = validateDescription(input.changes.description ?? '');
        if (!text.ok) {
          result = text;
          return;
        }
        description = text.value;
        if (input.changes.category !== null && input.changes.category !== undefined) {
          if (!isCategory(input.changes.category)) {
            result = fail('INVALID_TEXT', 'Unknown category.');
            return;
          }
          category = input.changes.category;
        }
      }
      const siblings = await listLiveEntriesForSession(txn, entry.sessionId);
      const overlapCheck = validateNoOverlap(siblings, range, entry.id);
      if (!overlapCheck.ok) {
        result = overlapCheck;
        return;
      }
      const nextOrigin: EntryOrigin =
        input.changes.kind === 'skipped'
          ? 'skipped'
          : entry.origin === 'skipped'
            ? 'typed'
            : entry.origin;
      const changes = await updateEntryRow(
        txn,
        {
          id: entry.id,
          startAt: range.startAt,
          endAt: range.endAt,
          kind: input.changes.kind,
          description,
          category,
          origin: nextOrigin,
          updatedAt: now,
        },
        input.expectedRevision,
      );
      if (changes === 0) {
        result = fail('REVISION_CONFLICT', 'This entry changed in another action.', {
          latestRevision: entry.revision + 1,
          entryId: entry.id,
        });
        return;
      }
      result = ok({
        ...entry,
        startAt: range.startAt,
        endAt: range.endAt,
        kind: input.changes.kind,
        description,
        category,
        origin: nextOrigin,
        revision: entry.revision + 1,
        updatedAt: now,
      });
    });
    return result;
  } catch (error) {
    return { ok: false, error: toTrackingError(error) };
  }
}

export interface DeleteEntryInput {
  entryId: string;
  expectedRevision: number;
}

export async function deleteEntry(
  deps: UseCaseDeps,
  input: DeleteEntryInput,
): Promise<Result<Entry>> {
  try {
    let result: Result<Entry> = fail('STORAGE_FAILURE', 'The entry could not be deleted.');
    await deps.db.withExclusiveTransactionAsync(async (txn) => {
      const entry = await getEntryById(txn, input.entryId);
      if (!entry) {
        result = fail('ENTRY_NOT_FOUND', 'That entry no longer exists.');
        return;
      }
      if (entry.deletedAt !== null) {
        result = fail('ENTRY_DELETED', 'That entry was already deleted.');
        return;
      }
      if (entry.revision !== input.expectedRevision) {
        result = fail(
          'REVISION_CONFLICT',
          'This entry changed in another action. Reopen it to see the latest version.',
          { latestRevision: entry.revision, entryId: entry.id },
        );
        return;
      }
      const now = deps.now();
      const changes = await tombstoneEntryRow(txn, entry.id, input.expectedRevision, now);
      if (changes === 0) {
        result = fail('REVISION_CONFLICT', 'This entry changed in another action.', {
          latestRevision: entry.revision + 1,
          entryId: entry.id,
        });
        return;
      }
      result = ok({ ...entry, deletedAt: now, revision: entry.revision + 1, updatedAt: now });
    });
    return result;
  } catch (error) {
    return { ok: false, error: toTrackingError(error) };
  }
}

export { normalizeDescription };
