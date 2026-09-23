import { TrackingError } from '../domain/tracking/errors';
import { SCHEMA_V1_SQL, SCHEMA_VERSION } from './sql';
import type { SqlDatabase, SqlExecutor } from './types';

export async function readSchemaVersion(db: SqlExecutor): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/**
 * Versioned, non-destructive migration. A failed migration leaves the existing
 * file untouched and surfaces a storage error instead of resetting data.
 */
export async function migrate(db: SqlDatabase): Promise<void> {
  const version = await readSchemaVersion(db);
  if (version > SCHEMA_VERSION) {
    throw new TrackingError(
      'MIGRATION_FAILED',
      'This database was written by a newer app version.',
      { databaseVersion: version, supportedVersion: SCHEMA_VERSION },
    );
  }
  if (version === SCHEMA_VERSION) return;
  try {
    await db.withExclusiveTransactionAsync(async (txn) => {
      if (version < 1) {
        await txn.execAsync(SCHEMA_V1_SQL);
      }
      await txn.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    });
  } catch (error) {
    throw new TrackingError(
      'MIGRATION_FAILED',
      'Local storage could not be prepared. Existing data was not changed.',
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
}
