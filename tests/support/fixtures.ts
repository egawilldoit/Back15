import { DEFAULT_INTERVAL_SECONDS, REMINDER_WINDOW_MS } from '../../src/domain/time/boundaries';
import type { Millis } from '../../src/domain/time/types';
import type { Entry, EntryKind, EntryOrigin, Session, Category } from '../../src/domain/tracking/types';

let counter = 0;

function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${String(counter).padStart(4, '0')}`;
}

export function resetFixtureIds(): void {
  counter = 0;
}

export interface SessionInput {
  startedAt: Millis;
  endedAt?: Millis | null;
  intervalSeconds?: number;
  startTimezone?: string;
  id?: string;
  status?: 'active' | 'closed';
  reminderWindowEndAt?: Millis;
}

export function makeSession(input: SessionInput): Session {
  const endedAt = input.endedAt ?? null;
  const status = input.status ?? (endedAt === null ? 'active' : 'closed');
  return {
    id: input.id ?? nextId('session'),
    startedAt: input.startedAt,
    endedAt,
    reminderWindowEndAt:
      input.reminderWindowEndAt ?? input.startedAt + REMINDER_WINDOW_MS,
    intervalSeconds: input.intervalSeconds ?? DEFAULT_INTERVAL_SECONDS,
    startTimezone: input.startTimezone ?? 'UTC',
    status,
    createdAt: input.startedAt,
    updatedAt: input.startedAt,
  };
}

export interface EntryInput {
  sessionId: string;
  startAt: Millis;
  endAt: Millis;
  kind?: EntryKind;
  description?: string | null;
  category?: Category | null;
  origin?: EntryOrigin;
  id?: string;
  revision?: number;
  deletedAt?: Millis | null;
  clientActionId?: string | null;
}

export function makeEntry(input: EntryInput): Entry {
  const kind = input.kind ?? 'logged';
  const skipped = kind === 'skipped';
  return {
    id: input.id ?? nextId('entry'),
    sessionId: input.sessionId,
    startAt: input.startAt,
    endAt: input.endAt,
    kind,
    description:
      skipped ? null : input.description === undefined ? 'Worked on a task' : input.description,
    category: skipped ? null : input.category === undefined ? 'work' : input.category,
    origin: input.origin ?? (skipped ? 'skipped' : 'typed'),
    clientActionId: input.clientActionId ?? null,
    revision: input.revision ?? 1,
    createdAt: input.startAt,
    updatedAt: input.startAt,
    deletedAt: input.deletedAt ?? null,
  };
}

/** UTC helper: 2026-09-22 09:03:20Z style instants. */
export function utc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
): Millis {
  return Date.UTC(year, month - 1, day, hour, minute, second, ms);
}
