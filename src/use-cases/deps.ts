import type { Millis } from '../domain/time/types';
import type { ReminderPort } from '../reminders/types';
import type { SqlDatabase } from '../storage/types';

export interface UseCaseDeps {
  db: SqlDatabase;
  reminders: ReminderPort | null;
  now(): Millis;
  newId(): string;
}

export interface UseCaseDepsInput {
  db: SqlDatabase;
  reminders?: ReminderPort | null;
  now?: () => Millis;
  newId?: () => string;
}

let fallbackCounter = 0;

function fallbackId(): string {
  fallbackCounter += 1;
  const random = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${fallbackCounter.toString(36)}-${random}`;
}

export function createUseCaseDeps(input: UseCaseDepsInput): UseCaseDeps {
  return {
    db: input.db,
    reminders: input.reminders ?? null,
    now: input.now ?? (() => Date.now()),
    newId: input.newId ?? fallbackId,
  };
}
