import { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { latestCompletedBoundary } from '../../domain/time/boundaries';
import { formatClockTime } from '../../domain/time/day';
import type { Millis } from '../../domain/time/types';
import type { Session } from '../../domain/tracking/types';
import { palette, radii, spacing, typography } from '../../theme';
import { IntervalDial } from './IntervalDial';

export interface ActiveSessionCardProps {
  session: Session;
  nextBoundaryAt: Millis | null;
  timezone: string;
  onLogNow: () => void;
  onStop: () => void;
}

function useSecondTick(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function minutesUntil(target: Millis, now: Millis): number {
  return Math.max(0, Math.round((target - now) / 60_000));
}

/**
 * The only part of Today that ticks every second. It derives the current span
 * from Date.now() and the session start, so a late or suspended timer cannot
 * move the planned schedule.
 */
export const ActiveSessionCard = memo(function ActiveSessionCard({
  session,
  nextBoundaryAt,
  timezone,
  onLogNow,
  onStop,
}: ActiveSessionCardProps) {
  const now = useSecondTick();
  const intervalMs = session.intervalSeconds * 1000;
  const intervalStart = latestCompletedBoundary(session, now) ?? session.startedAt;
  const intervalEnd = Math.min(intervalStart + intervalMs, session.reminderWindowEndAt);
  const elapsedMinutes = Math.max(
    0,
    Math.min(15, Math.floor((now - intervalStart) / 60_000)),
  );

  return (
    <View style={styles.card}>
      <AppText variant="capsOnAccent">
        tracking since {formatClockTime(session.startedAt, timezone)}
      </AppText>
      <AppText variant="editorial" color={palette.onAccent}>
        {formatClockTime(intervalStart, timezone)} –{' '}
        {formatClockTime(intervalEnd, timezone)}
      </AppText>
      <View style={styles.main}>
        <View style={styles.left}>
          {nextBoundaryAt ? (
            <>
              <View style={styles.countdownRow}>
                <AppText style={styles.countdownNumber}>
                  {minutesUntil(nextBoundaryAt, now)}
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
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Log now"
          accessibilityHint="Record the current unfinished span"
          onPress={onLogNow}
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
          onPress={onStop}
          style={({ pressed }) => [styles.stopButton, pressed && styles.actionPressed]}
        >
          <AppText variant="bodyStrong" color={palette.onAccent}>
            Stop
          </AppText>
        </Pressable>
      </View>
      <AppText variant="capsOnAccent">
        reminder end {formatClockTime(session.reminderWindowEndAt, timezone)}
      </AppText>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.accent,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  main: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  left: {
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
  actions: {
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
});
