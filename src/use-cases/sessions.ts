import {
  DEFAULT_INTERVAL_SECONDS,
  REMINDER_WINDOW_MS,
  isExpired,
} from '../domain/time/boundaries';
import type { Millis } from '../domain/time/types';
import { TrackingError, fail, ok } from '../domain/tracking/errors';
import type { Result } from '../domain/tracking/errors';
import type { Session } from '../domain/tracking/types';
import { validateSessionEnd } from '../domain/tracking/validation';
import {
  closeSessionRow,
  getActiveSession,
  getSessionById,
  insertSession,
} from '../storage/repositories/sessions';
import { listLiveEntriesForSession } from '../storage/repositories/entries';
import { setLastObservedWallAt } from '../storage/repositories/settings';
import type { UseCaseDeps } from './deps';
import { cancelSessionReminders, reconcileReminders } from './reminders';
import type { ReminderReconcileResult } from './reminders';

export interface StartSessionResult {
  session: Session;
  created: boolean;
  reminder: ReminderReconcileResult;
}

function toTrackingError(error: unknown): TrackingError {
  if (error instanceof TrackingError) return error;
  return new TrackingError('STORAGE_FAILURE', 'Local storage could not complete that action.', {
    cause: error instanceof Error ? error.message : String(error),
  });
}

/** Repeated Start returns the existing active session; an expired one is closed. */
export async function startSession(
  deps: UseCaseDeps,
  input: { timezone: string },
): Promise<Result<StartSessionResult>> {
  const now = deps.now();
  try {
    let session: Session | null = null;
    let created = false;
    let closedExpiredId: string | null = null;
    await deps.db.withExclusiveTransactionAsync(async (txn) => {
      const active = await getActiveSession(txn);
      if (active && !isExpired(active, now)) {
        session = active;
        return;
      }
      if (active) {
        await closeSessionRow(txn, active.id, active.reminderWindowEndAt, now);
        closedExpiredId = active.id;
      }
      const fresh: Session = {
        id: deps.newId(),
        startedAt: now,
        endedAt: null,
        reminderWindowEndAt: now + REMINDER_WINDOW_MS,
        intervalSeconds: DEFAULT_INTERVAL_SECONDS,
        startTimezone: input.timezone,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
      await insertSession(txn, fresh);
      session = fresh;
      created = true;
    });
    if (!session) {
      return fail('STORAGE_FAILURE', 'The session could not be created.');
    }
    await setLastObservedWallAt(deps.db, now);
    if (closedExpiredId) {
      await cancelSessionReminders(deps, closedExpiredId);
    }
    const reminder = await reconcileReminders(deps, { session, now });
    return ok({ session, created, reminder });
  } catch (error) {
    return { ok: false, error: toTrackingError(error) };
  }
}

export interface StopSessionResult {
  session: Session;
  finalUnresolvedMs: Millis;
  reminder: { cancelled: number; dismissed: number; error: string | null };
}

/**
 * Stop commits the closed session before any native cancellation. A failed
 * native call never reopens the session or discards recorded time.
 */
export async function stopSession(
  deps: UseCaseDeps,
  input: { sessionId: string; endedAt?: Millis },
): Promise<Result<StopSessionResult>> {
  const now = deps.now();
  const outcome: {
    closed: Session | null;
    finalUnresolvedMs: number;
    failure: TrackingError | null;
  } = { closed: null, finalUnresolvedMs: 0, failure: null };
  try {
    await deps.db.withExclusiveTransactionAsync(async (txn) => {
      const session = await getSessionById(txn, input.sessionId);
      if (!session) {
        outcome.failure = new TrackingError(
          'SESSION_NOT_FOUND',
          'That session no longer exists.',
        );
        return;
      }
      if (session.status !== 'active') {
        outcome.failure = new TrackingError(
          'SESSION_CLOSED',
          'That session is already stopped.',
        );
        return;
      }
      const cap = Math.min(now, session.reminderWindowEndAt);
      const endedAt = input.endedAt ?? cap;
      if (endedAt < session.startedAt) {
        outcome.failure = new TrackingError(
          'CLOCK_ANOMALY',
          'The end time falls before the session start. Review the session end.',
          { sessionId: session.id, endedAt, startedAt: session.startedAt },
        );
        return;
      }
      if (endedAt > session.reminderWindowEndAt) {
        outcome.failure = new TrackingError(
          'INVALID_RANGE',
          'The session cannot end after its 12-hour reminder window.',
          { sessionId: session.id, reminderWindowEndAt: session.reminderWindowEndAt },
        );
        return;
      }
      const entries = await listLiveEntriesForSession(txn, session.id);
      const endCheck = validateSessionEnd(entries, endedAt);
      if (!endCheck.ok) {
        outcome.failure = endCheck.error;
        return;
      }
      const changes = await closeSessionRow(txn, session.id, endedAt, now);
      if (changes === 0) {
        outcome.failure = new TrackingError(
          'STORAGE_FAILURE',
          'The session could not be stopped.',
        );
        return;
      }
      outcome.closed = { ...session, endedAt, status: 'closed', updatedAt: now };
      const uncovered = entries
        .filter((entry) => entry.endAt <= endedAt)
        .reduce((covered, entry) => covered + (entry.endAt - entry.startAt), 0);
      outcome.finalUnresolvedMs = endedAt - session.startedAt - uncovered;
    });
  } catch (error) {
    return { ok: false, error: toTrackingError(error) };
  }
  if (outcome.failure) return { ok: false, error: outcome.failure };
  if (!outcome.closed) {
    return fail('STORAGE_FAILURE', 'The session could not be stopped.');
  }
  try {
    await setLastObservedWallAt(deps.db, now);
    const reminder = await cancelSessionReminders(deps, outcome.closed.id);
    return ok({
      session: outcome.closed,
      finalUnresolvedMs: outcome.finalUnresolvedMs,
      reminder,
    });
  } catch (error) {
    return { ok: false, error: toTrackingError(error) };
  }
}
