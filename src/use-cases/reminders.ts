import { futureBoundaries } from '../domain/time/boundaries';
import type { Millis } from '../domain/time/types';
import type { Session } from '../domain/tracking/types';
import { REMINDER_PAYLOAD_VERSION } from '../reminders/types';
import type { PendingReminder, ReminderPermission } from '../reminders/types';
import {
  deleteReminderRequest,
  deleteReminderRequestsForSession,
  listReminderRequests,
  upsertReminderRequest,
} from '../storage/repositories/reminderRequests';
import { getRemindersEnabled } from '../storage/repositories/settings';
import type { UseCaseDeps } from './deps';

export interface ReminderReconcileResult {
  permission: ReminderPermission | 'unavailable';
  remindersEnabled: boolean;
  scheduled: number;
  cancelled: number;
  pendingCount: number;
  error: string | null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function keyOf(sessionId: string, dueAt: number): string {
  return `${sessionId}:${dueAt}`;
}

/**
 * Compare the committed session truth with OS pending requests: cancel
 * out-of-scope, duplicated or expired owned requests, schedule missing future
 * boundaries, and persist native IDs as disposable metadata.
 */
export async function reconcileReminders(
  deps: UseCaseDeps,
  input: { session: Session | null; now: Millis },
): Promise<ReminderReconcileResult> {
  const remindersEnabled = await getRemindersEnabled(deps.db);
  if (!deps.reminders) {
    return {
      permission: 'unavailable',
      remindersEnabled,
      scheduled: 0,
      cancelled: 0,
      pendingCount: 0,
      error: 'Reminders are not available in this build.',
    };
  }

  let permission: ReminderPermission;
  try {
    permission = await deps.reminders.getPermission();
  } catch (error) {
    return {
      permission: 'unavailable',
      remindersEnabled,
      scheduled: 0,
      cancelled: 0,
      pendingCount: 0,
      error: errorMessage(error),
    };
  }

  const active =
    input.session && input.session.status === 'active' ? input.session : null;
  const desired =
    active && remindersEnabled && permission === 'granted'
      ? futureBoundaries(active, input.now)
      : [];
  const desiredKeys = new Set(desired.map((dueAt) => keyOf(active!.id, dueAt)));

  let pending: PendingReminder[];
  try {
    pending = await deps.reminders.listPending();
  } catch (error) {
    return {
      permission,
      remindersEnabled,
      scheduled: 0,
      cancelled: 0,
      pendingCount: 0,
      error: errorMessage(error),
    };
  }

  let error: string | null = null;
  let scheduled = 0;
  let cancelled = 0;
  const seen = new Set<string>();
  const keptByKey = new Map<string, string>();

  for (const reminder of pending) {
    const payload = reminder.payload;
    // Requests from any older payload version cannot be trusted to match the
    // current desired set: cancel them so a stale reminder can never survive an
    // app update, a Stop or a downgrade, and reschedule from current truth.
    const isCurrentFormat = payload.version === REMINDER_PAYLOAD_VERSION;
    const key = keyOf(payload.sessionId, payload.dueAt);
    const keep =
      isCurrentFormat &&
      desiredKeys.has(key) &&
      payload.dueAt > input.now &&
      !seen.has(key);
    if (keep) {
      seen.add(key);
      keptByKey.set(key, reminder.nativeId);
      continue;
    }
    try {
      await deps.reminders.cancel(reminder.nativeId);
      cancelled += 1;
    } catch (cancelError) {
      error = errorMessage(cancelError);
    }
  }

  for (const dueAt of desired) {
    const key = keyOf(active!.id, dueAt);
    if (keptByKey.has(key)) continue;
    try {
      const nativeId = await deps.reminders.schedule({
        version: REMINDER_PAYLOAD_VERSION,
        sessionId: active!.id,
        dueAt,
      });
      keptByKey.set(key, nativeId);
      scheduled += 1;
    } catch (scheduleError) {
      error = errorMessage(scheduleError);
    }
  }

  const stored = await listReminderRequests(deps.db);
  const storedNativeIds = new Map<string, string | null>(
    stored.map((record) => [keyOf(record.sessionId, record.dueAt), record.nativeRequestId]),
  );
  for (const record of stored) {
    const key = keyOf(record.sessionId, record.dueAt);
    if (!keptByKey.has(key)) {
      await deleteReminderRequest(deps.db, record.sessionId, record.dueAt);
    }
  }
  if (active) {
    for (const dueAt of desired) {
      const key = keyOf(active.id, dueAt);
      const nativeId = keptByKey.get(key);
      if (nativeId === undefined) continue;
      // Crash recovery relies on comparing with the OS state, not on rewriting
      // identical rows every reconcile.
      if (storedNativeIds.get(key) === nativeId) continue;
      await upsertReminderRequest(deps.db, {
        sessionId: active.id,
        dueAt,
        nativeRequestId: nativeId,
      });
    }
  } else {
    const stale = await listReminderRequests(deps.db);
    for (const record of stale) {
      await deleteReminderRequestsForSession(deps.db, record.sessionId);
    }
  }

  return {
    permission,
    remindersEnabled,
    scheduled,
    cancelled,
    pendingCount: keptByKey.size,
    error,
  };
}

/** Cancel pending and dismiss presented reminders owned by a session. */
export async function cancelSessionReminders(
  deps: UseCaseDeps,
  sessionId: string,
): Promise<{ cancelled: number; dismissed: number; error: string | null }> {
  if (!deps.reminders) {
    return { cancelled: 0, dismissed: 0, error: null };
  }
  let cancelled = 0;
  let dismissed = 0;
  let error: string | null = null;
  try {
    const pending = await deps.reminders.listPending();
    for (const reminder of pending) {
      if (reminder.payload.sessionId !== sessionId) continue;
      try {
        await deps.reminders.cancel(reminder.nativeId);
        cancelled += 1;
      } catch (cancelError) {
        error = errorMessage(cancelError);
      }
    }
  } catch (listError) {
    error = errorMessage(listError);
  }
  try {
    const presented = await deps.reminders.listPresented();
    for (const reminder of presented) {
      if (reminder.payload.sessionId !== sessionId) continue;
      try {
        await deps.reminders.dismiss(reminder.nativeId);
        dismissed += 1;
      } catch (dismissError) {
        error = errorMessage(dismissError);
      }
    }
  } catch (listError) {
    error = errorMessage(listError);
  }
  try {
    await deleteReminderRequestsForSession(deps.db, sessionId);
  } catch (storageError) {
    error = errorMessage(storageError);
  }
  return { cancelled, dismissed, error };
}
