export type SqlValue = string | number | null;

export type SqlParams = SqlValue[] | Record<string, SqlValue>;

export interface SqlRunResult {
  changes: number;
  lastInsertRowId: number;
}

/**
 * Minimal SQL surface shared by the Expo adapter and the test adapter. Every
 * query inside a transaction must run through the transaction executor.
 */
export interface SqlExecutor {
  runAsync(sql: string, params?: SqlParams): Promise<SqlRunResult>;
  getFirstAsync<T>(sql: string, params?: SqlParams): Promise<T | null>;
  getAllAsync<T>(sql: string, params?: SqlParams): Promise<T[]>;
  execAsync(sql: string): Promise<void>;
}

export interface SqlDatabase extends SqlExecutor {
  withExclusiveTransactionAsync(task: (txn: SqlExecutor) => Promise<void>): Promise<void>;
  closeAsync(): Promise<void>;
}

export interface SessionRow {
  id: string;
  started_at: number;
  ended_at: number | null;
  reminder_window_end_at: number;
  interval_seconds: number;
  start_timezone: string;
  status: string;
  created_at: number;
  updated_at: number;
}

export interface EntryRow {
  id: string;
  session_id: string;
  start_at: number;
  end_at: number;
  kind: string;
  description: string | null;
  category: string | null;
  origin: string;
  client_action_id: string | null;
  revision: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface ReminderRequestRow {
  session_id: string;
  due_at: number;
  native_request_id: string | null;
}

export interface SettingRow {
  key: string;
  value: string;
}
