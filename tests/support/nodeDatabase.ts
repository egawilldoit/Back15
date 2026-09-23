/// <reference types="node" />
import { DatabaseSync } from 'node:sqlite';
import type {
  SqlDatabase,
  SqlExecutor,
  SqlParams,
  SqlRunResult,
  SqlValue,
} from '../../src/storage/types';

function bindArgs(params: SqlParams | undefined): SqlValue[] {
  if (!params) return [];
  if (Array.isArray(params)) return params;
  return Object.values(params);
}

class NodeSqlExecutor implements SqlExecutor {
  constructor(private readonly database: DatabaseSync) {}

  async runAsync(sql: string, params?: SqlParams): Promise<SqlRunResult> {
    const result = this.database.prepare(sql).run(...bindArgs(params));
    return {
      changes: Number(result.changes),
      lastInsertRowId: Number(result.lastInsertRowid),
    };
  }

  async getFirstAsync<T>(sql: string, params?: SqlParams): Promise<T | null> {
    const rows = this.database.prepare(sql).all(...bindArgs(params));
    return (rows[0] as T | undefined) ?? null;
  }

  async getAllAsync<T>(sql: string, params?: SqlParams): Promise<T[]> {
    return this.database.prepare(sql).all(...bindArgs(params)) as T[];
  }

  async execAsync(sql: string): Promise<void> {
    this.database.exec(sql);
  }
}

class NodeSqlDatabase implements SqlDatabase {
  private readonly executor: NodeSqlExecutor;
  private inTransaction = false;

  constructor(private readonly database: DatabaseSync) {
    this.executor = new NodeSqlExecutor(database);
  }

  runAsync(sql: string, params?: SqlParams): Promise<SqlRunResult> {
    return this.executor.runAsync(sql, params);
  }

  getFirstAsync<T>(sql: string, params?: SqlParams): Promise<T | null> {
    return this.executor.getFirstAsync<T>(sql, params);
  }

  getAllAsync<T>(sql: string, params?: SqlParams): Promise<T[]> {
    return this.executor.getAllAsync<T>(sql, params);
  }

  execAsync(sql: string): Promise<void> {
    return this.executor.execAsync(sql);
  }

  async withExclusiveTransactionAsync(
    task: (txn: SqlExecutor) => Promise<void>,
  ): Promise<void> {
    if (this.inTransaction) {
      throw new Error('Nested exclusive transactions are not supported in tests');
    }
    this.database.exec('BEGIN IMMEDIATE');
    this.inTransaction = true;
    try {
      await task(this.executor);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }

  async closeAsync(): Promise<void> {
    this.database.close();
  }
}

export interface TestDatabase extends SqlDatabase {
  readonly raw: DatabaseSync;
}

export function createTestDatabase(): TestDatabase {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON;');
  return Object.assign(new NodeSqlDatabase(database), { raw: database });
}
