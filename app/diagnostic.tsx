import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/src/components/AppText';
import { SecondaryButton, QuietButton } from '@/src/components/Buttons';
import { Banner, Card, Screen, SectionTitle } from '@/src/components/Layout';
import { createExpoReminderPort } from '@/src/reminders/expoReminders';
import { palette, spacing } from '@/src/theme';

/**
 * Isolated reminder diagnostic for the W0/W6 physical-device probe. It only
 * schedules a one-shot local notification; it never writes sessions/entries.
 */
export default function DiagnosticScreen() {
  const port = useMemo(() => createExpoReminderPort(), []);
  const [permission, setPermission] = useState('unknown');
  const [pending, setPending] = useState<{ nativeId: string; dueAt: number }[]>([]);
  const [presented, setPresented] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setPermission(await port.getPermission());
      const list = await port.listPending();
      setPending(list.map((item) => ({ nativeId: item.nativeId, dueAt: item.payload.dueAt })));
      setPresented((await port.listPresented()).length);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, [port]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => clearInterval(timer);
  }, [refresh]);

  const scheduleIn = async (minutes: number) => {
    try {
      await port.ensureChannel();
      const dueAt = Date.now() + minutes * 60_000;
      const nativeId = await port.schedule({ version: 1, sessionId: 'diagnostic', dueAt });
      setMessage(`scheduled ${nativeId} for ${new Date(dueAt).toISOString()}`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const cancelOwned = async () => {
    const list = await port.listPending();
    let cancelled = 0;
    for (const item of list) {
      if (item.payload.sessionId !== 'diagnostic') continue;
      await port.cancel(item.nativeId);
      cancelled += 1;
    }
    setMessage(`cancelled ${cancelled} diagnostic requests`);
    await refresh();
  };

  return (
    <Screen>
      <SectionTitle>Device probe</SectionTitle>
      <Card style={styles.card}>
        <AppText variant="bodyStrong">Local notification diagnostic</AppText>
        <AppText variant="secondary">
          Records planned due time, native request IDs and presented notifications so
          W0/W6 evidence can distinguish scheduled, presented, tapped and logged.
        </AppText>
        <AppText variant="secondary">Permission: {permission}</AppText>
        <AppText variant="secondary">Pending requests: {pending.length}</AppText>
        <AppText variant="secondary">Presented in tray: {presented}</AppText>
      </Card>

      {message ? (
        <Banner tone="neutral" title="Last action">
          <AppText variant="secondary">{message}</AppText>
        </Banner>
      ) : null}

      <SecondaryButton label="Schedule in 1 minute" onPress={() => void scheduleIn(1)} />
      <SecondaryButton label="Schedule in 5 minutes" onPress={() => void scheduleIn(5)} />
      <SecondaryButton label="Cancel diagnostic requests" onPress={() => void cancelOwned()} />
      <QuietButton label="Refresh" onPress={() => void refresh()} />

      <SectionTitle>Scheduled</SectionTitle>
      {pending.length === 0 ? (
        <AppText variant="secondary">No pending requests.</AppText>
      ) : (
        pending.map((item) => (
          <AppText key={item.nativeId} variant="secondary">
            {item.nativeId} · due {new Date(item.dueAt).toISOString()}
          </AppText>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
});
