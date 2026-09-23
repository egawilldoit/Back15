import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { Banner, Card, Screen, SectionTitle } from '../../components/Layout';
import { formatDayKeyLabel, formatDurationLabel } from '../../domain/time/day';
import type { HistoryDay } from '../../domain/tracking/types';
import { getHistory } from '../../use-cases/readModels';
import { useApp } from '../app/AppProvider';
import { palette, radii, spacing } from '../../theme';

export function HistoryScreen() {
  const router = useRouter();
  const { deps, timezone, revision } = useApp();
  const [days, setDays] = useState<HistoryDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getHistory(deps, { timezone });
      if (cancelled) return;
      if (result.ok) {
        setDays(result.value);
        setError(null);
      } else {
        setError(result.error.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deps, timezone, revision]);

  if (error) {
    return (
      <Screen>
        <Banner tone="danger" title="Could not read history">
          <AppText variant="secondary">{error}</AppText>
        </Banner>
      </Screen>
    );
  }

  if (!days) {
    return (
      <Screen scroll={false}>
        <AppText variant="secondary">Loading…</AppText>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="sectionTitle">History</AppText>
        <AppText variant="display">Previous days</AppText>
        <AppText variant="secondary">
          Recorded, skipped and unresolved time per tracked day.
        </AppText>
      </View>

      {days.length === 0 ? (
        <Card>
          <AppText variant="displaySmall">No previous tracking days yet</AppText>
          <AppText variant="secondary">
            Start a session on Today and your days will appear here.
          </AppText>
        </Card>
      ) : (
        <>
          <SectionTitle>Tracked days</SectionTitle>
          <View style={styles.list}>
            {days.map((day) => (
              <Pressable
                key={day.dayKey}
                accessibilityRole="button"
                accessibilityLabel={`${formatDayKeyLabel(day.dayKey, timezone)}, ${formatDurationLabel(
                  day.elapsedMs,
                )} tracked, ${formatDurationLabel(day.unresolvedMs)} unresolved`}
                accessibilityHint="Opens this day's timeline"
                onPress={() => router.push(`/day/${day.dayKey}`)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <View style={styles.rowHeader}>
                  <AppText variant="bodyStrong">
                    {formatDayKeyLabel(day.dayKey, timezone)}
                  </AppText>
                  <AppText variant="numericSmall">
                    {formatDurationLabel(day.elapsedMs)}
                  </AppText>
                </View>
                <AppText variant="secondary">
                  {day.sessionCount} {day.sessionCount === 1 ? 'session' : 'sessions'} ·
                  recorded {formatDurationLabel(day.recordedMs)} · skipped{' '}
                  {formatDurationLabel(day.skippedMs)} · unresolved{' '}
                  {formatDurationLabel(day.unresolvedMs)}
                </AppText>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  list: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.rule,
    backgroundColor: palette.surface,
    overflow: 'hidden',
  },
  row: {
    minHeight: 64,
    padding: spacing.lg,
    gap: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.rule,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pressed: {
    backgroundColor: palette.surfaceMuted,
  },
});
