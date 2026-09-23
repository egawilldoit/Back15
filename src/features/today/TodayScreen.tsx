import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { QuietButton } from '../../components/Buttons';
import { Banner, Screen } from '../../components/Layout';
import {
  boundaryIndexAtOrBefore,
  latestCompletedBoundary,
} from '../../domain/time/boundaries';
import {
  formatClockTime,
  formatDurationLabel,
  formatFullDate,
  formatWeekday,
} from '../../domain/time/day';
import type { Entry } from '../../domain/tracking/types';
import { getSetting, setSetting } from '../../storage/repositories/settings';
import { SETTING_KEYS } from '../../storage/sql';
import { getToday } from '../../use-cases/readModels';
import type { TodayReadModel } from '../../use-cases/readModels';
import { startSession } from '../../use-cases/sessions';
import { palette, radii, spacing, typography } from '../../theme';
import { useApp } from '../app/AppProvider';
import { BoundaryStrip } from './BoundaryStrip';
import { IntervalDial } from './IntervalDial';
import { TimelineList } from './TimelineList';
import type { UnresolvedItem } from './TimelineList';
import { TotalLedger } from './TotalLedger';

function useTickMs(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function minutesUntil(target: number, now: number): number {
  return Math.max(0, Math.round((target - now) / 60_000));
}

export function TodayScreen() {
  const router = useRouter();
  const {
    deps,
    timezone,
    revision,
    refresh,
    reminderStatus,
    clockAnomaly,
    reconcileNow,
    requestReminderPermission,
  } = useApp();
  const [model, setModel] = useState<TodayReadModel | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getToday(deps, { timezone });
      if (cancelled) return;
      if (result.ok) {
        setModel(result.value);
        setLoadError(null);
      } else {
        setLoadError(result.error.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deps, timezone, revision]);

  const active = model?.activeSession ?? null;
  const tickNow = useTickMs(Boolean(active));
  const cutoffHandled = useRef(false);

  useEffect(() => {
    if (!active) {
      cutoffHandled.current = false;
      return;
    }
    if (tickNow >= active.reminderWindowEndAt && !cutoffHandled.current) {
      cutoffHandled.current = true;
      void reconcileNow();
    }
  }, [active, reconcileNow, tickNow]);

  const handleStart = useCallback(async () => {
    setStarting(true);
    try {
      const explained =
        (await getSetting(deps.db, SETTING_KEYS.permissionExplainerShown)) === 'true';
      const begin = async (allowPermissionRequest: boolean) => {
        if (allowPermissionRequest) {
          await requestReminderPermission();
        }
        const result = await startSession(deps, { timezone });
        if (!result.ok) {
          Alert.alert('Could not start', result.error.message);
        }
        await reconcileNow();
        refresh();
      };
      if (!explained) {
        await setSetting(deps.db, SETTING_KEYS.permissionExplainerShown, 'true');
        Alert.alert(
          'Local check-in reminders',
          'Back15 asks for notification permission only to remind you during a tracking session. Reminders stay on this phone: there is no account, push service, or internet connection.',
          [
            {
              text: 'Not now',
              style: 'cancel',
              onPress: () => void begin(false),
            },
            { text: 'Continue', onPress: () => void begin(true) },
          ],
        );
      } else {
        await begin(reminderStatus?.permission !== 'denied');
      }
    } finally {
      setStarting(false);
    }
  }, [
    deps,
    refresh,
    reconcileNow,
    reminderStatus?.permission,
    requestReminderPermission,
    timezone,
  ]);

  const enableReminders = useCallback(async () => {
    const result = await requestReminderPermission();
    await reconcileNow();
    if (result !== 'granted') {
      Alert.alert(
        'Reminders stay off',
        'Android did not grant notification permission. You can still log every span manually, or allow notifications from device settings.',
      );
    }
  }, [reconcileNow, requestReminderPermission]);

  const handleEntry = useCallback(
    (entry: Entry) => {
      router.push(`/edit/${entry.id}`);
    },
    [router],
  );

  const handleUnresolved = useCallback(
    (item: UnresolvedItem) => {
      if (item.current) {
        router.push({
          pathname: '/capture',
          params: { sessionId: item.sessionId, mode: 'lognow' },
        });
        return;
      }
      router.push({
        pathname: '/capture',
        params: {
          sessionId: item.sessionId,
          startAt: String(item.range.startAt),
          endAt: String(item.range.endAt),
          mode: 'resolve',
        },
      });
    },
    [router],
  );

  if (loadError) {
    return (
      <Screen>
        <Banner tone="danger" title="Local storage problem">
          <AppText variant="secondary">{loadError}</AppText>
        </Banner>
        <QuietButton label="Retry" onPress={refresh} />
      </Screen>
    );
  }

  if (!model) {
    return (
      <Screen scroll={false}>
        <AppText variant="secondary">Loading…</AppText>
      </Screen>
    );
  }

  const summary = model.summary;
  const permission = reminderStatus?.permission ?? 'undetermined';
  const remindersNeedAttention =
    reminderStatus?.error != null ||
    permission === 'denied' ||
    permission === 'unavailable' ||
    (active !== null && permission === 'undetermined');
  const zoneChanged = active && active.startTimezone !== timezone;
  const checkIn = model.checkInTarget;
  const intervalMs = active ? active.intervalSeconds * 1000 : 0;
  const intervalStart = active
    ? (latestCompletedBoundary(active, tickNow) ?? active.startedAt)
    : 0;
  const intervalEnd = active
    ? Math.min(intervalStart + intervalMs, active.reminderWindowEndAt)
    : 0;
  const elapsedMinutes = active
    ? Math.max(0, Math.min(15, Math.floor((tickNow - intervalStart) / 60_000)))
    : 0;
  const completedBoundaries = active
    ? boundaryIndexAtOrBefore(active, tickNow)
    : 0;

  return (
    <Screen horizontalPadding={false}>
      <View style={styles.headerSection}>
        <View style={styles.wordmarkRow}>
          <View>
            <AppText style={styles.wordmark}>Back15</AppText>
            <View style={styles.wordmarkRule} />
          </View>
          <View style={styles.tagline}>
            <AppText variant="caps">a record of</AppText>
            <AppText variant="caps">your day</AppText>
          </View>
        </View>
        <AppText variant="serifHeading">{formatWeekday(model.now, timezone)}</AppText>
        <AppText variant="caps">{formatFullDate(model.now, timezone)}</AppText>
      </View>

      {active ? (
        <>
          <View style={styles.stripSection}>
            <BoundaryStrip session={active} now={tickNow} timezone={timezone} />
          </View>
          <View style={styles.activeCard}>
            <AppText variant="capsOnAccent">
              tracking since {formatClockTime(active.startedAt, timezone)}
            </AppText>
            <AppText variant="editorial" color={palette.onAccent}>
              {formatClockTime(intervalStart, timezone)} –{' '}
              {formatClockTime(intervalEnd, timezone)}
            </AppText>
            <View style={styles.activeMain}>
              <View style={styles.activeLeft}>
                {model.nextBoundaryAt ? (
                  <>
                    <View style={styles.countdownRow}>
                      <AppText style={styles.countdownNumber}>
                        {minutesUntil(model.nextBoundaryAt, tickNow)}
                      </AppText>
                      <AppText variant="editorialSmall" color={palette.onAccent}>
                        min
                      </AppText>
                    </View>
                    <AppText variant="capsOnAccent">until next check-in</AppText>
                    <AppText variant="capsOnAccent">
                      ends at {formatClockTime(intervalEnd, timezone)}
                    </AppText>
                  </>
                ) : (
                  <AppText variant="capsOnAccent">no more planned check-ins</AppText>
                )}
              </View>
              <IntervalDial elapsed={elapsedMinutes} total={15} />
            </View>
            <View style={styles.cardActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Log now"
                accessibilityHint="Record the current unfinished span"
                onPress={() =>
                  router.push({
                    pathname: '/capture',
                    params: { sessionId: active.id, mode: 'lognow' },
                  })
                }
                style={({ pressed }) => [styles.logNow, pressed && styles.actionPressed]}
              >
                <AppText variant="bodyStrong" color={palette.onAccent}>
                  Log now →
                </AppText>
              </Pressable>
              <View style={styles.actionDivider} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Stop tracking"
                onPress={() => router.push('/stop')}
                style={({ pressed }) => [styles.stopButton, pressed && styles.actionPressed]}
              >
                <AppText variant="bodyStrong" color={palette.onAccent}>
                  Stop
                </AppText>
              </Pressable>
            </View>
            <AppText variant="capsOnAccent">
              reminder end {formatClockTime(active.reminderWindowEndAt, timezone)}
            </AppText>
          </View>
        </>
      ) : (
        <View style={styles.section}>
          <View style={styles.idleCard}>
            <AppText variant="displaySmall">Not tracking</AppText>
            <AppText variant="secondary">
              See where your time goes, one check-in at a time.
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={starting ? 'Starting' : 'Start tracking'}
              accessibilityHint="Starts a session and schedules local check-in reminders"
              accessibilityState={{ disabled: starting }}
              disabled={starting}
              onPress={() => void handleStart()}
              style={({ pressed }) => [
                styles.startButton,
                pressed && styles.actionPressed,
                starting && styles.startButtonDisabled,
              ]}
            >
              <AppText variant="bodyStrong" color={palette.onAccent}>
                {starting ? 'Starting…' : 'Start tracking'}
              </AppText>
            </Pressable>
          </View>
        </View>
      )}

      <View style={styles.section}>
        {active && clockAnomaly ? (
          <Banner tone="attention" title="Device clock changed">
            <AppText variant="secondary">
              Automatic elapsed-time inference is paused. Review the session end before
              trusting these totals; existing entries were not changed.
            </AppText>
            <QuietButton label="Review session end" onPress={() => router.push('/stop')} />
          </Banner>
        ) : null}

        {remindersNeedAttention ? (
          <Banner tone="attention" title="Tracking without reminders">
            <AppText variant="secondary">
              {permission === 'unavailable'
                ? 'This build has no reminder support. Log now and history still work.'
                : permission === 'undetermined'
                  ? 'Notifications are not allowed yet, so no check-in reminder can arrive.'
                  : 'Notification permission is off. You can still log every span manually.'}
            </AppText>
            {reminderStatus?.error ? (
              <AppText variant="secondary">{reminderStatus.error}</AppText>
            ) : null}
            <View style={styles.bannerActions}>
              {permission === 'undetermined' ? (
                <QuietButton
                  label="Enable reminders"
                  onPress={() => void enableReminders()}
                />
              ) : null}
              {permission === 'denied' || permission === 'unavailable' ? (
                <QuietButton
                  label="Open device settings"
                  onPress={() => void Linking.openSettings()}
                />
              ) : null}
              <QuietButton
                label="Notification test"
                onPress={() => router.push('/diagnostic')}
              />
            </View>
          </Banner>
        ) : null}

        <TotalLedger
          elapsedMs={summary.elapsedMs}
          recordedMs={summary.recordedMs}
          skippedMs={summary.skippedMs}
          unresolvedMs={summary.unresolvedMs}
        />

        <View style={styles.notesHeader}>
          <AppText variant="serifHeading">Today's notes</AppText>
          {active && completedBoundaries > 0 ? (
            <AppText variant="caps" style={styles.notesMeta}>
              {completedBoundaries}{' '}
              {completedBoundaries === 1 ? 'boundary' : 'boundaries'} so far
            </AppText>
          ) : null}
        </View>

        <TimelineList
          items={summary.timeline}
          timezone={timezone}
          onPressEntry={handleEntry}
          onPressUnresolved={handleUnresolved}
        />

        {checkIn && checkIn.olderGaps.length > 0 ? (
          <AppText variant="capsAttention">
            {checkIn.olderGaps.length} older{' '}
            {checkIn.olderGaps.length === 1 ? 'gap' : 'gaps'} still unresolved ·{' '}
            {formatDurationLabel(
              checkIn.olderGaps.reduce(
                (total, gap) => total + (gap.endAt - gap.startAt),
                0,
              ),
            )}
          </AppText>
        ) : null}

        {zoneChanged ? (
          <AppText variant="secondary">
            Times shown in your current time zone ({timezone}); the session started in{' '}
            {active?.startTimezone}.
          </AppText>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerSection: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  wordmark: {
    ...typography.displaySmall,
    fontSize: 24,
    lineHeight: 28,
  },
  wordmarkRule: {
    marginTop: 2,
    width: 46,
    height: 2,
    backgroundColor: palette.ink,
  },
  tagline: {
    alignItems: 'flex-end',
  },
  stripSection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  activeCard: {
    backgroundColor: palette.accent,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  activeMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  activeLeft: {
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'center',
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  countdownNumber: {
    ...typography.display,
    fontSize: 46,
    lineHeight: 50,
    color: palette.onAccent,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  logNow: {
    flex: 1,
    minHeight: 52,
    borderRadius: radii.pill,
    backgroundColor: palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  actionDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  stopButton: {
    minHeight: 52,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  actionPressed: {
    opacity: 0.85,
  },
  section: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  idleCard: {
    backgroundColor: palette.surface,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.rule,
    padding: spacing.lg,
    gap: spacing.md,
  },
  startButton: {
    minHeight: 52,
    borderRadius: radii.pill,
    backgroundColor: palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  startButtonDisabled: {
    opacity: 0.6,
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  notesMeta: {
    flexShrink: 1,
    textAlign: 'right',
  },
  bannerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
