import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { AppText } from '../../components/AppText';
import { Banner, Screen, SectionTitle } from '../../components/Layout';
import { formatClockTime, formatDayKeyLabel, formatDurationLabel } from '../../domain/time/day';
import type { Entry } from '../../domain/tracking/types';
import { getDayDetail } from '../../use-cases/readModels';
import type { DayDetailReadModel } from '../../use-cases/readModels';
import { useApp } from '../app/AppProvider';
import { TimelineList } from '../today/TimelineList';
import type { UnresolvedItem } from '../today/TimelineList';
import { TotalLedger } from '../today/TotalLedger';
import { palette, spacing } from '../../theme';

export function DayDetailScreen() {
  const params = useLocalSearchParams<{ dayKey?: string }>();
  const dayKey = typeof params.dayKey === 'string' ? params.dayKey : null;
  const router = useRouter();
  const { deps, timezone, revision } = useApp();
  const [model, setModel] = useState<DayDetailReadModel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!dayKey) return;
      const result = await getDayDetail(deps, { dayKey, timezone });
      if (cancelled) return;
      if (result.ok) {
        setModel(result.value);
        setError(null);
      } else {
        setError(result.error.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dayKey, deps, timezone, revision]);

  const handleEntry = (entry: Entry) => {
    router.push(`/edit/${entry.id}`);
  };

  const handleUnresolved = (item: UnresolvedItem) => {
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
  };

  if (error) {
    return (
      <Screen>
        <Banner tone="danger" title="Could not read this day">
          <AppText variant="secondary">{error}</AppText>
        </Banner>
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
  const closedSessions = summary.sessions.filter(
    (item) => item.session.status === 'closed',
  );
  const zoneChanged = summary.sessions.some(
    (item) => item.session.startTimezone !== timezone,
  );

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="sectionTitle">Day detail</AppText>
        <AppText variant="display">{formatDayKeyLabel(model.dayKey, timezone)}</AppText>
        <AppText variant="secondary">
          {summary.sessions.length}{' '}
          {summary.sessions.length === 1 ? 'session' : 'sessions'} ·{' '}
          {formatDurationLabel(summary.elapsedMs)} tracked
        </AppText>
      </View>

      {zoneChanged ? (
        <Banner tone="neutral" title="Time zone changed">
          <AppText variant="secondary">
            This day is shown in your current time zone ({timezone}). Stored instants
            were not changed.
          </AppText>
        </Banner>
      ) : null}

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

      {closedSessions.length > 0 ? (
        <AppText variant="secondary">
          Unresolved time inside a closed session can still be recorded from this
          timeline.
        </AppText>
      ) : null}
      {summary.sessions.length > 0 ? (
        <AppText variant="secondary">
          {summary.sessions
            .map(
              (item) =>
                `${formatClockTime(item.session.startedAt, timezone)}–${
                  item.session.endedAt
                    ? formatClockTime(item.session.endedAt, timezone)
                    : 'now'
                }`,
            )
            .join(' · ')}
        </AppText>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
});
