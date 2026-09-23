import type { Millis } from '../domain/time/types';

export type ReminderPermission = 'granted' | 'denied' | 'undetermined';

export const REMINDER_PAYLOAD_VERSION = 1;

export interface ReminderPayload {
  version: number;
  sessionId: string;
  dueAt: Millis;
}

export interface PendingReminder {
  nativeId: string;
  payload: ReminderPayload;
}

export interface PresentedReminder {
  nativeId: string;
  payload: ReminderPayload;
}

/**
 * OS reminder boundary. Implementations own permission, channels, scheduling
 * and cancellation; they never create or modify activity records.
 */
export interface ReminderPort {
  getPermission(): Promise<ReminderPermission>;
  requestPermission(): Promise<ReminderPermission>;
  ensureChannel(): Promise<void>;
  schedule(payload: ReminderPayload): Promise<string>;
  listPending(): Promise<PendingReminder[]>;
  cancel(nativeId: string): Promise<void>;
  listPresented(): Promise<PresentedReminder[]>;
  dismiss(nativeId: string): Promise<void>;
}

export function parseReminderPayload(data: unknown): ReminderPayload | null {
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  const version = record.version;
  const sessionId = record.sessionId;
  const dueAt = record.dueAt;
  if (typeof version !== 'number') return null;
  if (typeof sessionId !== 'string' || sessionId.length === 0) return null;
  if (typeof dueAt !== 'number' || !Number.isFinite(dueAt)) return null;
  return { version, sessionId, dueAt };
}
