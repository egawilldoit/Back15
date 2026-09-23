import { SETTING_KEYS } from '../sql';
import type { SqlExecutor } from '../types';

export async function getSetting(db: SqlExecutor, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    [key],
  );
  return row?.value ?? null;
}

export async function setSetting(
  db: SqlExecutor,
  key: string,
  value: string,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

export async function getRemindersEnabled(db: SqlExecutor): Promise<boolean> {
  const value = await getSetting(db, SETTING_KEYS.remindersEnabled);
  return value !== 'false';
}

export async function setRemindersEnabled(
  db: SqlExecutor,
  enabled: boolean,
): Promise<void> {
  await setSetting(db, SETTING_KEYS.remindersEnabled, enabled ? 'true' : 'false');
}

export async function getLastObservedWallAt(db: SqlExecutor): Promise<number | null> {
  const value = await getSetting(db, SETTING_KEYS.lastObservedWallAt);
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function setLastObservedWallAt(
  db: SqlExecutor,
  observedAt: number,
): Promise<void> {
  await setSetting(db, SETTING_KEYS.lastObservedWallAt, String(observedAt));
}
