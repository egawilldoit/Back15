import type {
  SqlDatabase,
  SqlExecutor,
  SqlParams,
  SqlRunResult,
} from '../../src/storage/types';
import type { TestDatabase } from './nodeDatabase';

export interface QueryCounts {
  run: number;
  getFirst: number;
  getAll: number;
  exec: number;
  transactions: number;
}

export interface CountingDatabase extends SqlDatabase {
  readonly counts: QueryCounts;
  resetCounts(): void;
}

function countInto(counts: QueryCounts, method: keyof QueryCounts): void {
  counts[method] += 1;
}

/**
 * Wraps a test database and counts statements, so tests can assert that a read
 * model no longer runs N+1 queries and that reconciliation stops rewriting
 * unchanged reminder metadata.
 */
export function createCountingDatabase(db: TestDatabase): CountingDatabase {
  const counts: QueryCounts = {
    run: 0,
    getFirst: 0,
    getAll: 0,
    exec: 0,
    transactions: 0,
  };

  const wrap = (executor: SqlExecutor): SqlExecutor => ({
    async runAsync(sql: string, params?: SqlParams): Promise<SqlRunResult> {
      countInto(counts, 'run');
      return executor.runAsync(sql, params);
    },
    async getFirstAsync<T>(sql: string, params?: SqlParams): Promise<T | null> {
      countInto(counts, 'getFirst');
      return executor.getFirstAsync<T>(sql, params);
    },
    async getAllAsync<T>(sql: string, params?: SqlParams): Promise<T[]> {
      countInto(counts, 'getAll');
      return executor.getAllAsync<T>(sql, params);
    },
    async execAsync(sql: string): Promise<void> {
      countInto(counts, 'exec');
      return executor.execAsync(sql);
    },
  });

  const wrapped = wrap(db);
  return {
    ...wrapped,
    counts,
    resetCounts() {
      counts.run = 0;
      counts.getFirst = 0;
      counts.getAll = 0;
      counts.exec = 0;
      counts.transactions = 0;
    },
    async withExclusiveTransactionAsync(
      task: (txn: SqlExecutor) => Promise<void>,
    ): Promise<void> {
      countInto(counts, 'transactions');
      return db.withExclusiveTransactionAsync(async (txn) => task(wrap(txn)));
    },
    closeAsync() {
      return db.closeAsync();
    },
  };
}
