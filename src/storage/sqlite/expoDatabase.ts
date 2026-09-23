import * as SQLite from 'expo-sqlite';
import type { SqlDatabase, SqlExecutor, SqlParams, SqlRunResult } from '../types';

export const DATABASE_NAME = 'back15.db';

class ExpoSqlExecutor implements SqlExecutor {
  constructor(private readonly database: SQLite.SQLiteDatabase) {}

  runAsync(sql: string, params?: SqlParams): Promise<SqlRunResult> {
    return this.database.runAsync(sql, (params ?? []) as SQLite.SQLiteBindParams) as Promise<SqlRunResult>;
  }

  getFirstAsync<T>(sql: string, params?: SqlParams): Promise<T | null> {
    return this.database.getFirstAsync<T>(sql, (params ?? []) as SQLite.SQLiteBindParams);
  }

  getAllAsync<T>(sql: string, params?: SqlParams): Promise<T[]> {
    return this.database.getAllAsync<T>(sql, (params ?? []) as SQLite.SQLiteBindParams);
  }

  execAsync(sql: string): Promise<void> {
    return this.database.execAsync(sql);
  }
}

class ExpoSqlDatabase implements SqlDatabase {
  constructor(private readonly database: SQLite.SQLiteDatabase) {}

  runAsync(sql: string, params?: SqlParams): Promise<SqlRunResult> {
    return this.database.runAsync(sql, (params ?? []) as SQLite.SQLiteBindParams) as Promise<SqlRunResult>;
  }

  getFirstAsync<T>(sql: string, params?: SqlParams): Promise<T | null> {
    return this.database.getFirstAsync<T>(sql, (params ?? []) as SQLite.SQLiteBindParams);
  }

  getAllAsync<T>(sql: string, params?: SqlParams): Promise<T[]> {
    return this.database.getAllAsync<T>(sql, (params ?? []) as SQLite.SQLiteBindParams);
  }

  execAsync(sql: string): Promise<void> {
    return this.database.execAsync(sql);
  }

  async withExclusiveTransactionAsync(
    task: (txn: SqlExecutor) => Promise<void>,
  ): Promise<void> {
    await this.database.withExclusiveTransactionAsync(async (txn) => {
      await task(new ExpoSqlExecutor(txn));
    });
  }

  closeAsync(): Promise<void> {
    return this.database.closeAsync();
  }
}

export async function openAppDatabase(): Promise<SqlDatabase> {
  const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await database.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  return new ExpoSqlDatabase(database);
}
