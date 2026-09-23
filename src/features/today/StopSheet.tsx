import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { PrimaryButton, QuietButton, SecondaryButton } from '../../components/Buttons';
import { Banner, Card } from '../../components/Layout';
import { effectiveEndMs } from '../../domain/time/boundaries';
import { formatClockTime, formatDurationLabel } from '../../domain/time/day';
import type { Session } from '../../domain/tracking/types';
import { listLiveEntriesForSession } from '../../storage/repositories/entries';
import { getActiveSession } from '../../storage/repositories/sessions';
import { stopSession } from '../../use-cases/sessions';
import { useApp } from '../app/AppProvider';
import { palette, radii, spacing, touchTarget } from '../../theme';

const MINUTE = 60_000;
const ADJUST_STEPS = [-5, -1, 1, 5] as const;

export function StopSheet() {
  const router = useRouter();
  const { deps, timezone, refresh } = useApp();
  const [session, setSession] = useState<Session | null>(null);
  const [finalUnresolvedMs, setFinalUnresolvedMs] = useState(0);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const active = await getActiveSession(deps.db);
    setSession(active);
    if (active) {
      const now = Date.now();
      const cap = effectiveEndMs(active, now);
      setEndedAt(cap);
    }
    setLoaded(true);
  }, [deps]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!session || endedAt === null) return;
      const entries = await listLiveEntriesForSession(deps.db, session.id);
      if (cancelled) return;
      const covered = entries
        .filter((entry) => entry.endAt <= endedAt)
        .reduce((sum, entry) => {
          const start = Math.max(entry.startAt, session.startedAt);
          const end = Math.min(entry.endAt, endedAt);
          return sum + Math.max(0, end - start);
        }, 0);
      setFinalUnresolvedMs(Math.max(0, endedAt - session.startedAt - covered));
    })();
    return () => {
      cancelled = true;
    };
  }, [deps, endedAt, session]);

  const adjust = (delta: number) => {
    if (!session || endedAt === null) return;
    const next = endedAt + delta * MINUTE;
    if (next < session.startedAt) return;
    if (next > session.reminderWindowEndAt) return;
    setEndedAt(next);
    setError(null);
  };

  const handleStop = useCallback(async () => {
    if (!session || endedAt === null || busy) return;
    setBusy(true);
    setError(null);
    const result = await stopSession(deps, { sessionId: session.id, endedAt });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    refresh();
    router.back();
  }, [busy, deps, endedAt, refresh, router, session]);

  if (!loaded) {
    return (
      <View style={styles.container}>
        <AppText variant="secondary">Loading…</AppText>
      </View>
    );
  }

  if (!session || endedAt === null) {
    return (
      <View style={styles.container}>
        <Card>
          <AppText variant="displaySmall">No active session</AppText>
          <AppText variant="secondary">
            Nothing is tracking right now, so there is nothing to stop.
          </AppText>
          <QuietButton label="Close" onPress={() => router.back()} />
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppText variant="sectionTitle">Stop tracking</AppText>
      <AppText variant="displaySmall">
        End at {formatClockTime(endedAt, timezone)}
      </AppText>
      <Card style={styles.summaryCard}>
        <AppText variant="body">
          {formatDurationLabel(finalUnresolvedMs)} of the final span will stay
          unresolved unless you log it first.
        </AppText>
        <AppText variant="secondary">
          Session started {formatClockTime(session.startedAt, timezone)} · reminder
          window ends {formatClockTime(session.reminderWindowEndAt, timezone)}.
        </AppText>
        <View style={styles.adjustRow}>
          <AppText variant="label">Adjust end</AppText>
          {ADJUST_STEPS.map((step) => (
            <Pressable
              key={step}
              accessibilityRole="button"
              accessibilityLabel={`Move the end time ${
                step > 0 ? 'later' : 'earlier'
              } by ${Math.abs(step)} minutes`}
              onPress={() => adjust(step)}
              style={({ pressed }) => [styles.adjustButton, pressed && styles.adjustPressed]}
            >
              <AppText variant="numericSmall">{step > 0 ? `+${step}` : step}</AppText>
            </Pressable>
          ))}
        </View>
      </Card>

      {error ? (
        <Banner tone="attention" title="Could not stop">
          <AppText variant="secondary">{error}</AppText>
        </Banner>
      ) : null}

      <View style={styles.actions}>
        <PrimaryButton
          label={busy ? 'Stopping…' : 'Stop now'}
          disabled={busy}
          accessibilityHint="Closes the session and cancels its reminders"
          onPress={() => void handleStop()}
        />
        <SecondaryButton
          label="Log final time first"
          disabled={busy}
          accessibilityHint="Opens capture for the final unresolved span"
          onPress={() => {
            router.replace({
              pathname: '/capture',
              params: { sessionId: session.id, mode: 'lognow' },
            });
          }}
        />
      </View>
      <QuietButton label="Cancel" onPress={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
    padding: spacing.lg,
    gap: spacing.md,
  },
  summaryCard: {
    gap: spacing.sm,
  },
  adjustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  adjustButton: {
    minWidth: touchTarget,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: palette.ruleStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustPressed: {
    backgroundColor: palette.surfaceMuted,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
