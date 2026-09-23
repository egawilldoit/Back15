import { detectClockAnomaly, isExpired } from '../domain/time/boundaries';
import type { ClockAnomaly } from '../domain/time/boundaries';
import { TrackingError } from '../domain/tracking/errors';
import type { Result } from '../domain/tracking/errors';
import type { Session } from '../domain/tracking/types';
import { closeSessionRow, getActiveSession } from '../storage/repositories/sessions';
import { getLastObservedWallAt, setLastObservedWallAt } from '../storage/repositories/settings';
import type { UseCaseDeps } from './deps';
import { reconcileReminders } from './reminders';
import type { ReminderReconcileResult } from './reminders';

export interface ReconcileResult {
  activeSession: Session | null;
  closedExpired: boolean;
  clockAnomaly: ClockAnomaly | null;
  reminder: ReminderReconcileResult;
}

/**
 * Startup/resume reconciliation: SQLite truth first (including closing an
 * expired session at its cutoff), then native pending requests.
 */
export async function reconcile(
  deps: UseCaseDeps,
): Promise<Result<ReconcileResult>> {
  try {
    const now = deps.now();
    const previousObservedAt = await getLastObservedWallAt(deps.db);
    const clockAnomaly = detectClockAnomaly(now, previousObservedAt);

    let closedExpired = false;
    let session: Session | null = null;
    await deps.db.withExclusiveTransactionAsync(async (txn) => {
      const active = await getActiveSession(txn);
      if (active && isExpired(active, now) && clockAnomaly?.kind !== 'backward') {
        const changes = await closeSessionRow(
          txn,
          active.id,
          active.reminderWindowEndAt,
          now,
        );
        closedExpired = changes > 0;
        session = closedExpired ? null : active;
        return;
      }
      session = active;
    });
    await setLastObservedWallAt(deps.db, now);
    const reminder = await reconcileReminders(deps, { session, now });
    return { ok: true, value: { activeSession: session, closedExpired, clockAnomaly, reminder } };
  } catch (error) {
    if (error instanceof TrackingError) return { ok: false, error };
    return {
      ok: false,
      error: new TrackingError('STORAGE_FAILURE', 'Local storage could not be reconciled.', {
        cause: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}
