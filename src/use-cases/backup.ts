import {
  buildJournalBackup,
  parseJournalBackup,
  serializeJournalBackup,
} from '../domain/journal/backup';
import type { JournalBackup } from '../domain/journal/backup';
import { currentTimeZone } from '../domain/time/day';
import { TrackingError, fail, ok } from '../domain/tracking/errors';
import type { Result } from '../domain/tracking/errors';
import { SCHEMA_VERSION } from '../storage/sql';
import {
  clearJournal,
  listAllEntries,
  listAllSessionsForBackup,
  upsertEntryRow,
  upsertSessionRow,
} from '../storage/repositories/journal';
import { findEntryByActionId } from '../storage/repositories/entries';
import { getActiveSession } from '../storage/repositories/sessions';
import { getRemindersEnabled, setRemindersEnabled } from '../storage/repositories/settings';
import type { UseCaseDeps } from './deps';
import { reconcileReminders } from './reminders';

export interface JournalExport {
  backup: JournalBackup;
  json: string;
}

function toTrackingError(error: unknown): TrackingError {
  if (error instanceof TrackingError) return error;
  return new TrackingError(
    'BACKUP_IMPORT_FAILED',
    'The journal could not be restored. Nothing was changed.',
    { cause: error instanceof Error ? error.message : String(error) },
  );
}

export async function exportJournal(
  deps: UseCaseDeps,
  options: { appVersion?: string | null } = {},
): Promise<Result<JournalExport>> {
  try {
    const backup = buildJournalBackup({
      createdAt: deps.now(),
      timeZone: currentTimeZone(),
      appVersion: options.appVersion ?? null,
      schemaVersion: SCHEMA_VERSION,
      remindersEnabled: await getRemindersEnabled(deps.db),
      sessions: await listAllSessionsForBackup(deps.db),
      entries: await listAllEntries(deps.db),
    });
    return ok({ backup, json: serializeJournalBackup(backup) });
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof TrackingError
          ? error
          : new TrackingError('BACKUP_IMPORT_FAILED', 'The journal could not be exported.', {
              cause: error instanceof Error ? error.message : String(error),
            }),
    };
  }
}

export type ImportMode = 'merge' | 'replace';

export interface ImportJournalInput {
  text: string;
  /** replace wipes the journal first; merge upserts rows by id. */
  mode: ImportMode;
}

export interface ImportSummary {
  mode: ImportMode;
  sessions: number;
  entries: number;
  tombstones: number;
}

/**
 * Restores a validated backup in one exclusive transaction. A malformed file,
 * an unsupported version, an overlap or a conflict leaves the journal exactly
 * as it was. Native reminder IDs are never imported; reminders are rebuilt
 * from the restored SQLite state afterwards.
 */
export async function importJournal(
  deps: UseCaseDeps,
  input: ImportJournalInput,
): Promise<Result<ImportSummary>> {
  const parsed = parseJournalBackup(input.text, SCHEMA_VERSION);
  if (!parsed.ok) return parsed;
  const backup = parsed.value;

  const outcome: { summary: ImportSummary | null; failure: TrackingError | null } = {
    summary: null,
    failure: null,
  };
  try {
    await deps.db.withExclusiveTransactionAsync(async (txn) => {
      if (input.mode === 'merge') {
        const importedActive = backup.sessions.find((session) => session.status === 'active');
        const existingActive = await getActiveSession(txn);
        if (importedActive && existingActive && existingActive.id !== importedActive.id) {
          outcome.failure = new TrackingError(
            'BACKUP_CONFLICT',
            'Stop the current session before merging a backup that contains an active session.',
            { sessionId: existingActive.id },
          );
          return;
        }
        for (const entry of backup.entries) {
          if (entry.clientActionId === null) continue;
          const existing = await findEntryByActionId(txn, entry.clientActionId);
          if (existing && existing.id !== entry.id) {
            outcome.failure = new TrackingError(
              'BACKUP_CONFLICT',
              'A recorded action id in this backup already belongs to a different entry.',
              { entryId: entry.id, existingEntryId: existing.id },
            );
            return;
          }
        }
      } else {
        await clearJournal(txn);
      }

      for (const session of backup.sessions) {
        await upsertSessionRow(txn, session);
      }
      for (const entry of backup.entries) {
        await upsertEntryRow(txn, entry);
      }
      if (input.mode === 'replace') {
        await setRemindersEnabled(txn, backup.settings.remindersEnabled);
      }
      outcome.summary = {
        mode: input.mode,
        sessions: backup.sessions.length,
        entries: backup.entries.length,
        tombstones: backup.entries.filter((entry) => entry.deletedAt !== null).length,
      };
    });
  } catch (error) {
    return { ok: false, error: toTrackingError(error) };
  }
  if (outcome.failure) return { ok: false, error: outcome.failure };
  if (!outcome.summary) {
    return fail('BACKUP_IMPORT_FAILED', 'The journal could not be restored.');
  }

  // Reminders are recomputed from the restored rows; nothing native is imported.
  const active = await getActiveSession(deps.db);
  await reconcileReminders(deps, { session: active, now: deps.now() });
  return ok(outcome.summary);
}
