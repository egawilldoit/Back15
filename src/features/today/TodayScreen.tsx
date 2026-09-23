import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { PrimaryButton, QuietButton, SecondaryButton } from '../../components/Buttons';
import { Banner, Card, Screen, SectionTitle } from '../../components/Layout';
import {
  formatClockTime,
  formatDurationLabel,
  formatLongDate,
} from '../../domain/time/day';
import type { Entry } from '../../domain/tracking/types';
import { getSetting, setSetting } from '../../storage/repositories/settings';
import { SETTING_KEYS } from '../../storage/sql';
import { getToday } from '../../use-cases/readModels';
import type { TodayReadModel } from '../../use-cases/readModels';
import { startSession } from '../../use-cases/sessions';
import { palette, radii, spacing, typography, formatCountdown } from '../../theme';
import { useApp } from '../app/AppProvider';
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
        <SecondaryButton label="Retry" onPress={refresh} />
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
  const remindersUnavailable =
    reminderStatus?.error != null ||
    reminderStatus?.permission === 'denied' ||
    reminderStatus?.permission === 'unavailable';
  const zoneChanged = active && active.startTimezone !== timezone;
  const checkIn = model.checkInTarget;
  const olderCount = checkIn?.olderGaps.length ?? 0;

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="sectionTitle" color={palette.muted}>
          Back15
        </AppText>
        <AppText variant="display">{formatLongDate(model.now, timezone)}</AppText>
        <AppText variant="secondary">Where did your time go today?</AppText>
      </View>

      {active ? (
        <View style={styles.activeCard}>
          <View style={styles.activeTopRow}>
            <View style={styles.trackingPill}>
              <View style={styles.trackingDot} />
              <AppText variant="label" color={palette.onAccent}>
                Tracking
              </AppText>
            </View>
            <AppText variant="secondary" color={palette.onAccentMuted}>
              since {formatClockTime(active.startedAt, timezone)}
            </AppText>
          </View>

          <View style={styles.countdownBlock}>
            {model.nextBoundaryAt ? (
              <>
                <AppText variant="display" color={palette.onAccent} style={styles.countdown}>
                  {formatCountdown(model.nextBoundaryAt - tickNow)}
                </AppText>
                <AppText variant="body" color={palette.onAccentMuted}>
                  until the next planned check-in at{' '}
                  {formatClockTime(model.nextBoundaryAt, timezone)}. Arrival may be
                  later; planned time does not move.
                </AppText>
              </>
            ) : (
              <AppText variant="body" color={palette.onAccentMuted}>
                No more planned check-ins. This session ends at{' '}
                {formatClockTime(active.reminderWindowEndAt, timezone)}.
              </AppText>
            )}
          </View>

          <IntervalProgress
            sessionStartedAt={active.startedAt}
            intervalSeconds={active.intervalSeconds}
            now={tickNow}
            windowEndAt={active.reminderWindowEndAt}
            timezone={timezone}
          />

          <View style={styles.activeActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Log now"
              accessibilityHint="Record the current unfinished span"
              onPress={() => router.push({
                pathname: '/capture',
                params: { sessionId: active.id, mode: 'lognow' },
              })}
              style={({ pressed }) => [styles.logNowButton, pressed && styles.stopPressed]}
            >
              <AppText variant="bodyStrong" color={palette.accent}>
                Log now
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stop tracking"
              onPress={() => router.push('/stop')}
              style={({ pressed }) => [styles.stopButton, pressed && styles.stopPressed]}
            >
              <AppText variant="bodyStrong" color={palette.onAccent}>
                Stop tracking
              </AppText>
            </Pressable>
          </View>

          <AppText variant="secondary" color={palette.onAccentMuted}>
            Automatic reminder end{' '}
            {formatClockTime(active.reminderWindowEndAt, timezone)} (start + 12 hours).
          </AppText>
          {zoneChanged ? (
            <AppText variant="secondary" color={palette.onAccentMuted}>
              Times shown in your current time zone ({timezone}); the session started in{' '}
              {active.startTimezone}.
            </AppText>
          ) : null}
        </View>
      ) : (
        <Card>
          <AppText variant="displaySmall">Not tracking</AppText>
          <AppText variant="secondary">
            See where your time goes, one check-in at a time.
          </AppText>
          <PrimaryButton
            label={starting ? 'Starting…' : 'Start tracking'}
            disabled={starting}
            accessibilityHint="Starts a session and schedules local check-in reminders"
            onPress={() => void handleStart()}
          />
        </Card>
      )}

      {active && clockAnomaly ? (
        <Banner tone="attention" title="Device clock changed">
          <AppText variant="secondary">
            Automatic elapsed-time inference is paused. Review the session end before
            trusting these totals; existing entries were not changed.
          </AppText>
          <SecondaryButton
            label="Review session end"
            onPress={() => router.push('/stop')}
          />
        </Banner>
      ) : null}

      {remindersUnavailable ? (
        <Banner tone="attention" title="Tracking without reminders">
          <AppText variant="secondary">
            {reminderStatus?.permission === 'unavailable'
              ? 'This build has no reminder support. Log now and history still work.'
              : 'Notification permission is off. You can still log every span manually.'}
          </AppText>
          <QuietButton
            label="Open device settings"
            onPress={() => void Linking.openSettings()}
          />
        </Banner>
      ) : null}

      {reminderStatus?.error && remindersUnavailable ? (
        <AppText variant="secondary">{reminderStatus.error}</AppText>
      ) : null}

      {active && checkIn ? (
        <Banner tone="attention" title={`${formatDurationLabel(
          checkIn.range.endAt - checkIn.range.startAt,
        )} needs an answer`}>
          <AppText variant="secondary">
            {formatClockTime(checkIn.range.startAt, timezone)}–
            {formatClockTime(checkIn.range.endAt, timezone)}
            {olderCount > 0
              ? ` · ${olderCount} older ${olderCount === 1 ? 'gap' : 'gaps'} remain`
              : ''}
          </AppText>
          <SecondaryButton
            label="Resolve"
            accessibilityHint="Records what you did during this unresolved span"
            onPress={() =>
              handleUnresolved({
                type: 'unresolved',
                sessionId: active.id,
                range: checkIn.range,
                clippedRange: checkIn.range,
                current: false,
                resolvable: true,
              })
            }
          />
        </Banner>
      ) : null}

      <SectionTitle>Today so far</SectionTitle>
      <TotalLedger
        elapsedMs={summary.elapsedMs}
        recordedMs={summary.recordedMs}
        skippedMs={summary.skippedMs}
        unresolvedMs={summary.unresolvedMs}
      />

      <SectionTitle>Timeline</SectionTitle>
      <TimelineList
        items={summary.timeline}
        timezone={timezone}
        onPressEntry={handleEntry}
        onPressUnresolved={handleUnresolved}
      />
    </Screen>
  );
}

function IntervalProgress({
  sessionStartedAt,
  intervalSeconds,
  now,
  windowEndAt,
  timezone,
}: {
  sessionStartedAt: number;
  intervalSeconds: number;
  now: number;
  windowEndAt: number;
  timezone: string;
}) {
  const intervalMs = intervalSeconds * 1000;
  const capped = Math.min(now, windowEndAt);
  const elapsed = Math.max(0, capped - sessionStartedAt);
  const position = elapsed % intervalMs;
  const progress = position / intervalMs;
  const segmentStart = capped - position;
  const segmentEnd = Math.min(segmentStart + intervalMs, windowEndAt);
  return (
    <View style={styles.progressBlock}>
      <View style={styles.progressTrack}>
        <View
          style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]}
        />
      </View>
      <AppText variant="secondary" color={palette.onAccentMuted}>
        Current span {formatClockTime(segmentStart, timezone)}–
        {formatClockTime(segmentEnd, timezone)} · {Math.round(progress * 15)} of 15
        planned minutes elapsed
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  activeCard: {
    backgroundColor: palette.accent,
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  activeTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trackingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  trackingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#8DF0B5',
  },
  countdownBlock: {
    gap: spacing.xs,
  },
  countdown: {
    ...typography.display,
    fontSize: 44,
    lineHeight: 50,
    color: palette.onAccent,
  },
  progressBlock: {
    gap: spacing.sm,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: palette.onAccent,
  },
  activeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  logNowButton: {
    minHeight: 48,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: palette.onAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButton: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopPressed: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
});
