import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { PrimaryButton } from '../../components/Buttons';
import type { ClockAnomaly } from '../../domain/time/boundaries';
import { currentTimeZone, localDayKey } from '../../domain/time/day';
import { checkInTarget, logNowTarget } from '../../domain/tracking/proposals';
import { parseReminderPayload } from '../../reminders/types';
import type { ReminderPermission } from '../../reminders/types';
import { createExpoReminderPort } from '../../reminders/expoReminders';
import { listLiveEntriesForSession } from '../../storage/repositories/entries';
import { getSessionById } from '../../storage/repositories/sessions';
import { migrate } from '../../storage/migrations';
import { openAppDatabase } from '../../storage/sqlite/expoDatabase';
import type { SqlDatabase } from '../../storage/types';
import { createUseCaseDeps } from '../../use-cases/deps';
import type { UseCaseDeps } from '../../use-cases/deps';
import { reconcile } from '../../use-cases/reconcile';
import { palette, spacing } from '../../theme';

export interface ReminderStatus {
  permission: ReminderPermission | 'unavailable';
  remindersEnabled: boolean;
  scheduled: number;
  pendingCount: number;
  error: string | null;
}

export interface AppContextValue {
  deps: UseCaseDeps;
  timezone: string;
  requestReminderPermission(): Promise<ReminderPermission>;
  revision: number;
  ready: boolean;
  storageError: string | null;
  reminderStatus: ReminderStatus | null;
  clockAnomaly: ClockAnomaly | null;
  refresh(): void;
  retryStorage(): void;
  reconcileNow(): Promise<ReminderStatus | null>;
  setSheetOpen(open: boolean): void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) {
    throw new Error('useApp must be used inside AppProvider');
  }
  return value;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [db, setDb] = useState<SqlDatabase | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [revision, setRevision] = useState(0);
  const [reminderStatus, setReminderStatus] = useState<ReminderStatus | null>(null);
  const [clockAnomaly, setClockAnomaly] = useState<ClockAnomaly | null>(null);
  const sheetCount = useRef(0);
  const reminders = useMemo(() => createExpoReminderPort(), []);
  const [timezone, setTimezone] = useState(() => currentTimeZone());

  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const setSheetOpen = useCallback((open: boolean) => {
    sheetCount.current = Math.max(0, sheetCount.current + (open ? 1 : -1));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStorageError(null);
    setDb(null);
    (async () => {
      try {
        const database = await openAppDatabase();
        await migrate(database);
        if (cancelled) {
          await database.closeAsync();
          return;
        }
        setDb(database);
      } catch (error) {
        if (!cancelled) {
          setStorageError(
            error instanceof Error
              ? error.message
              : 'Local storage could not be opened.',
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const deps = useMemo<UseCaseDeps | null>(
    () => (db ? createUseCaseDeps({ db, reminders }) : null),
    [db, reminders],
  );

  const requestReminderPermission = useCallback(async (): Promise<ReminderPermission> => {
    try {
      return await reminders.requestPermission();
    } catch {
      return 'denied';
    }
  }, [reminders]);

  const reconcileNow = useCallback(async (): Promise<ReminderStatus | null> => {
    if (!deps) return null;
    const zone = currentTimeZone();
    if (zone !== timezone) {
      setTimezone(zone);
      refresh();
    }
    const result = await reconcile(deps);
    if (!result.ok) {
      setReminderStatus((current) => ({
        permission: current?.permission ?? 'unavailable',
        remindersEnabled: current?.remindersEnabled ?? true,
        scheduled: 0,
        pendingCount: current?.pendingCount ?? 0,
        error: result.error.message,
      }));
      return null;
    }
    setClockAnomaly(result.value.clockAnomaly);
    const status: ReminderStatus = {
      permission: result.value.reminder.permission,
      remindersEnabled: result.value.reminder.remindersEnabled,
      scheduled: result.value.reminder.scheduled,
      pendingCount: result.value.reminder.pendingCount,
      error: result.value.reminder.error,
    };
    setReminderStatus(status);
    refresh();
    return status;
  }, [deps, refresh, timezone]);

  useEffect(() => {
    if (!deps) return;
    void reconcileNow();
  }, [deps, reconcileNow]);

  useEffect(() => {
    if (!deps) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void reconcileNow();
      }
    });
    return () => subscription.remove();
  }, [deps, reconcileNow]);

  const openTarget = useCallback(
    async (sessionId: string, dueAt: number) => {
      if (!deps) return;
      const session = await getSessionById(deps.db, sessionId);
      if (!session) {
        router.push('/(tabs)');
        return;
      }
      const now = Date.now();
      if (session.status === 'closed') {
        const dayKey = localDayKey(dueAt, timezone);
        router.push(`/day/${dayKey}`);
        return;
      }
      const entries = await listLiveEntriesForSession(deps.db, session.id);
      const target = checkInTarget(session, entries, now) ?? logNowTarget(session, entries, now);
      if (!target) {
        router.push('/(tabs)');
        return;
      }
      router.push({
        pathname: '/capture',
        params: {
          sessionId: session.id,
          startAt: String(target.range.startAt),
          endAt: String(target.range.endAt),
          mode: 'checkin',
        },
      });
    },
    [deps, router, timezone],
  );

  useEffect(() => {
    if (!deps) return;
    const handleResponse = (response: Notifications.NotificationResponse) => {
      const payload = parseReminderPayload(response.notification.request.content.data);
      if (!payload) return;
      if (sheetCount.current > 0) {
        refresh();
        return;
      }
      void openTarget(payload.sessionId, payload.dueAt);
    };
    const subscription =
      Notifications.addNotificationResponseReceivedListener(handleResponse);
    const last = Notifications.getLastNotificationResponse();
    if (last) {
      Notifications.clearLastNotificationResponse();
      handleResponse(last);
    }
    return () => subscription.remove();
  }, [deps, openTarget, refresh]);

  const value = useMemo<AppContextValue | null>(() => {
    if (!deps) return null;
    return {
      deps,
      timezone,
      requestReminderPermission,
      revision,
      ready: true,
      storageError,
      reminderStatus,
      clockAnomaly,
      refresh,
      retryStorage: () => setAttempt((current) => current + 1),
      reconcileNow,
      setSheetOpen,
    };
  }, [
    deps,
    timezone,
    requestReminderPermission,
    revision,
    storageError,
    reminderStatus,
    clockAnomaly,
    refresh,
    reconcileNow,
    setSheetOpen,
  ]);

  if (storageError) {
    return (
      <View style={styles.centered}>
        <AppText variant="displaySmall">Local storage problem</AppText>
        <AppText variant="secondary" style={styles.errorCopy}>
          {storageError}
        </AppText>
        <AppText variant="secondary">
          Existing data was not changed. Retry, or restart the app.
        </AppText>
        <PrimaryButton label="Retry" onPress={() => setAttempt((c) => c + 1)} />
      </View>
    );
  }

  if (!value) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={palette.accent} />
        <AppText variant="secondary">Loading your journal…</AppText>
      </View>
    );
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: palette.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  errorCopy: {
    textAlign: 'center',
  },
});
