import { nextPlannedBoundary } from '../domain/time/boundaries';
import { localDayKey, localDayWindow, splitRangeByLocalDay } from '../domain/time/day';
import type { DayKey, Millis, TimeRange } from '../domain/time/types';
import { TrackingError } from '../domain/tracking/errors';
import type { Result } from '../domain/tracking/errors';
import { checkInTarget, logNowTarget } from '../domain/tracking/proposals';
import { summarizeDay } from '../domain/tracking/summary';
import type { DaySummary, Entry, HistoryDay, PromptTarget, Session } from '../domain/tracking/types';
import { getEntryById, listLiveEntriesOverlapping } from '../storage/repositories/entries';
import { getRemindersEnabled } from '../storage/repositories/settings';
import { listAllSessions, listSessionsOverlapping } from '../storage/repositories/sessions';
import type { UseCaseDeps } from './deps';

function toTrackingError(error: unknown): TrackingError {
  if (error instanceof TrackingError) return error;
  return new TrackingError('STORAGE_FAILURE', 'Local storage could not be read.', {
    cause: error instanceof Error ? error.message : String(error),
  });
}

/**
 * One query per read model: entries overlapping the window, filtered to the
 * sessions being summarized. Anything outside the window is clipped away by
 * summarizeDay anyway.
 */
async function entriesForSessions(
  deps: UseCaseDeps,
  sessions: readonly Session[],
  window: TimeRange,
): Promise<Entry[]> {
  if (sessions.length === 0) return [];
  const sessionIds = new Set(sessions.map((session) => session.id));
  const entries = await listLiveEntriesOverlapping(deps.db, window);
  return entries.filter((entry) => sessionIds.has(entry.sessionId));
}

export interface TodayReadModel {
  now: Millis;
  timezone: string;
  dayKey: DayKey;
  window: TimeRange;
  activeSession: Session | null;
  sessions: Session[];
  summary: DaySummary;
  nextBoundaryAt: Millis | null;
  reminderWindowEndAt: Millis | null;
  checkInTarget: PromptTarget | null;
  logNowTarget: PromptTarget | null;
  remindersEnabled: boolean;
}

export async function getToday(
  deps: UseCaseDeps,
  input: { timezone: string },
): Promise<Result<TodayReadModel>> {
  try {
    const now = deps.now();
    const dayKey = localDayKey(now, input.timezone);
    const window = localDayWindow(dayKey, input.timezone);
    const sessions = await listSessionsOverlapping(deps.db, window);
    const entries = await entriesForSessions(deps, sessions, window);
    const activeSession = sessions.find((session) => session.status === 'active') ?? null;
    const activeEntries = activeSession
      ? entries.filter((entry) => entry.sessionId === activeSession.id)
      : [];
    return {
      ok: true,
      value: {
        now,
        timezone: input.timezone,
        dayKey,
        window,
        activeSession,
        sessions,
        summary: summarizeDay(dayKey, window, sessions, entries, now),
        nextBoundaryAt: activeSession ? nextPlannedBoundary(activeSession, now) : null,
        reminderWindowEndAt: activeSession?.reminderWindowEndAt ?? null,
        checkInTarget: activeSession
          ? checkInTarget(activeSession, activeEntries, now)
          : null,
        logNowTarget: activeSession ? logNowTarget(activeSession, activeEntries, now) : null,
        remindersEnabled: await getRemindersEnabled(deps.db),
      },
    };
  } catch (error) {
    return { ok: false, error: toTrackingError(error) };
  }
}

export interface DayDetailReadModel {
  dayKey: DayKey;
  timezone: string;
  window: TimeRange;
  now: Millis;
  summary: DaySummary;
}

export async function getDayDetail(
  deps: UseCaseDeps,
  input: { dayKey: DayKey; timezone: string },
): Promise<Result<DayDetailReadModel>> {
  try {
    const now = deps.now();
    const window = localDayWindow(input.dayKey, input.timezone);
    const sessions = await listSessionsOverlapping(deps.db, window);
    const entries = await entriesForSessions(deps, sessions, window);
    return {
      ok: true,
      value: {
        dayKey: input.dayKey,
        timezone: input.timezone,
        window,
        now,
        summary: summarizeDay(input.dayKey, window, sessions, entries, now),
      },
    };
  } catch (error) {
    return { ok: false, error: toTrackingError(error) };
  }
}

export async function getEntry(
  deps: UseCaseDeps,
  entryId: string,
): Promise<Result<Entry>> {
  try {
    const entry = await getEntryById(deps.db, entryId);
    if (!entry || entry.deletedAt !== null) {
      return {
        ok: false,
        error: new TrackingError('ENTRY_NOT_FOUND', 'That entry no longer exists.'),
      };
    }
    return { ok: true, value: entry };
  } catch (error) {
    return { ok: false, error: toTrackingError(error) };
  }
}

export async function getHistory(
  deps: UseCaseDeps,
  input: { timezone: string; limit?: number },
): Promise<Result<HistoryDay[]>> {
  try {
    const now = deps.now();
    const limit = input.limit ?? 120;
    const sessions = await listAllSessions(deps.db);
    const byDay = new Map<DayKey, Session[]>();
    for (const session of sessions) {
      const end = session.endedAt ?? Math.min(now, session.reminderWindowEndAt);
      for (const slice of splitRangeByLocalDay(
        { startAt: session.startedAt, endAt: Math.max(end, session.startedAt + 1) },
        input.timezone,
      )) {
        const list = byDay.get(slice.key) ?? [];
        list.push(session);
        byDay.set(slice.key, list);
      }
    }
    const days = [...byDay.keys()].sort().reverse().slice(0, limit);
    const dayWindows = days.map((dayKey) => ({
      dayKey,
      window: localDayWindow(dayKey, input.timezone),
    }));
    const range: TimeRange | null =
      dayWindows.length === 0
        ? null
        : {
            startAt: Math.min(...dayWindows.map((day) => day.window.startAt)),
            endAt: Math.max(...dayWindows.map((day) => day.window.endAt)),
          };
    const allEntries = range
      ? await listLiveEntriesOverlapping(deps.db, range)
      : [];
    const result: HistoryDay[] = [];
    for (const { dayKey, window } of dayWindows) {
      const daySessions = byDay.get(dayKey) ?? [];
      const sessionIds = new Set(daySessions.map((session) => session.id));
      const entries = allEntries.filter((entry) => sessionIds.has(entry.sessionId));
      const summary = summarizeDay(dayKey, window, daySessions, entries, now);
      if (summary.elapsedMs <= 0) continue;
      result.push({
        dayKey,
        elapsedMs: summary.elapsedMs,
        recordedMs: summary.recordedMs,
        skippedMs: summary.skippedMs,
        unresolvedMs: summary.unresolvedMs,
        sessionCount: summary.sessions.length,
      });
    }
    return { ok: true, value: result };
  } catch (error) {
    return { ok: false, error: toTrackingError(error) };
  }
}
