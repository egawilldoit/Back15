import type { Millis, TimeRange } from '../time/types';

export type Category = 'work' | 'learning' | 'personal' | 'break' | 'other';
export type CategoryKey = Category | 'uncategorized';

export const CATEGORIES: readonly Category[] = [
  'work',
  'learning',
  'personal',
  'break',
  'other',
];

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  work: 'Work',
  learning: 'Learning',
  personal: 'Personal',
  break: 'Break',
  other: 'Other',
  uncategorized: 'No category',
};

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

export type SessionStatus = 'active' | 'closed';
export type EntryKind = 'logged' | 'skipped';
export type EntryOrigin = 'typed' | 'continued' | 'backfilled' | 'skipped';

export interface Session {
  id: string;
  startedAt: Millis;
  endedAt: Millis | null;
  reminderWindowEndAt: Millis;
  intervalSeconds: number;
  startTimezone: string;
  status: SessionStatus;
  createdAt: Millis;
  updatedAt: Millis;
}

export interface Entry {
  id: string;
  sessionId: string;
  startAt: Millis;
  endAt: Millis;
  kind: EntryKind;
  description: string | null;
  category: Category | null;
  origin: EntryOrigin;
  clientActionId: string | null;
  revision: number;
  createdAt: Millis;
  updatedAt: Millis;
  deletedAt: Millis | null;
}

export function isLive(entry: Entry): boolean {
  return entry.deletedAt === null;
}

export function entryRange(entry: Entry): TimeRange {
  return { startAt: entry.startAt, endAt: entry.endAt };
}

export interface SessionSummary {
  session: Session;
  effectiveEndAt: Millis;
  elapsedMs: number;
  recordedMs: number;
  skippedMs: number;
  unresolvedMs: number;
  completedUnresolvedMs: number;
  categories: Record<CategoryKey, Millis>;
  entries: Entry[];
  clippedRange: TimeRange;
}

export interface DaySummary {
  dayKey: string;
  window: TimeRange;
  elapsedMs: number;
  recordedMs: number;
  skippedMs: number;
  unresolvedMs: number;
  completedUnresolvedMs: number;
  categories: Record<CategoryKey, Millis>;
  sessions: SessionSummary[];
  timeline: TimelineItem[];
}

export type TimelineItem =
  | {
      type: 'entry';
      entry: Entry;
      range: TimeRange;
      clippedRange: TimeRange;
    }
  | {
      type: 'unresolved';
      range: TimeRange;
      clippedRange: TimeRange;
      /** Unresolved time after the latest completed boundary of an active session. */
      current: boolean;
      /** True when the range can be proposed for capture. */
      resolvable: boolean;
    };

export interface PromptTarget {
  range: TimeRange;
  /** Unresolved completed components older than the proposal, newest first. */
  olderGaps: TimeRange[];
}

export interface HistoryDay {
  dayKey: string;
  elapsedMs: number;
  recordedMs: number;
  skippedMs: number;
  unresolvedMs: number;
  sessionCount: number;
}
