import type { Millis } from '../../src/domain/time/types';
import type { ReminderPort } from '../../src/reminders/types';
import { migrate } from '../../src/storage/migrations';
import type { SqlDatabase } from '../../src/storage/types';
import { createUseCaseDeps } from '../../src/use-cases/deps';
import type { UseCaseDeps } from '../../src/use-cases/deps';
import { createTestDatabase } from './nodeDatabase';
import type { TestDatabase } from './nodeDatabase';

export interface Harness {
  db: TestDatabase;
  deps: UseCaseDeps;
  now(): Millis;
  setNow(value: Millis): void;
  advance(delta: number): void;
  close(): Promise<void>;
}

export async function createHarness(options?: {
  now?: Millis;
  reminders?: ReminderPort | null;
  idPrefix?: string;
}): Promise<Harness> {
  const db: TestDatabase = createTestDatabase();
  await migrate(db);
  let currentNow = options?.now ?? 0;
  let idCounter = 0;
  const deps = createUseCaseDeps({
    db: db as SqlDatabase,
    reminders: options?.reminders ?? null,
    now: () => currentNow,
    newId: () => {
      idCounter += 1;
      return `${options?.idPrefix ?? 'id'}-${idCounter}`;
    },
  });
  return {
    db,
    deps,
    now: () => currentNow,
    setNow: (value: Millis) => {
      currentNow = value;
    },
    advance: (delta: number) => {
      currentNow += delta;
    },
    close: () => db.closeAsync(),
  };
}
