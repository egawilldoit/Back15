import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { AppText } from '@/src/components/AppText';
import { SecondaryButton, QuietButton } from '@/src/components/Buttons';
import { Banner, Card, Screen, SectionTitle } from '@/src/components/Layout';
import { formatClockTimeWithSeconds } from '@/src/domain/time/day';
import { CHECK_IN_CHANNEL_ID, createExpoReminderPort } from '@/src/reminders/expoReminders';
import { palette, spacing } from '@/src/theme';
import { useApp } from '@/src/features/app/AppProvider';

interface TestEvent {
  key: string;
  kind: 'received' | 'tapped';
  at: number;
  dueAt: number | null;
}

interface PendingTest {
  id: string;
  dueAt: number;
}

function diagnosticDueAt(data: unknown): number | null {
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  if (record.diagnostic !== true) return null;
  return typeof record.dueAt === 'number' ? record.dueAt : null;
}

/**
 * Isolated local-notification test. Test notifications carry a `diagnostic`
 * payload that the reminder reconciler ignores, so they can never be mistaken
 * for session reminders or activity records.
 */
export default function NotificationTestScreen() {
  const { timezone, reminderStatus, requestReminderPermission, reconcileNow } = useApp();
  const port = useMemo(() => createExpoReminderPort(), []);
  const [pending, setPending] = useState<PendingTest[]>([]);
  const [events, setEvents] = useState<TestEvent[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const counter = useRef(0);

  const refreshState = useCallback(async () => {
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      setPending(
        scheduled
          .map((request) => ({
            id: request.identifier,
            dueAt: diagnosticDueAt(request.content.data),
          }))
          .filter((item): item is PendingTest => item.dueAt !== null)
          .sort((a, b) => a.dueAt - b.dueAt),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
    try {
      const channels = await Notifications.getNotificationChannelsAsync();
      setChannelIds(channels.map((channel) => `${channel.id} · ${channel.importance}`));
    } catch {
      setChannelIds([]);
    }
  }, []);

  useEffect(() => {
    void refreshState();
    const received = Notifications.addNotificationReceivedListener((notification) => {
      const dueAt = diagnosticDueAt(notification.request.content.data);
      if (dueAt === null) return;
      counter.current += 1;
      setEvents((previous) =>
        [
          { key: `r-${counter.current}`, kind: 'received' as const, at: Date.now(), dueAt },
          ...previous,
        ].slice(0, 20),
      );
      void refreshState();
    });
    const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
      const dueAt = diagnosticDueAt(response.notification.request.content.data);
      if (dueAt === null) return;
      counter.current += 1;
      setEvents((previous) =>
        [
          { key: `t-${counter.current}`, kind: 'tapped' as const, at: Date.now(), dueAt },
          ...previous,
        ].slice(0, 20),
      );
      void refreshState();
    });
    return () => {
      received.remove();
      tapped.remove();
    };
  }, [refreshState]);

  const scheduleTest = useCallback(
    async (seconds: number) => {
      try {
        await port.ensureChannel();
        const dueAt = Date.now() + seconds * 1000;
        const identifier = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Back15 notification test',
            body:
              seconds === 0
                ? 'Sent immediately.'
                : `Planned ${seconds} seconds before it arrived.`,
            data: { diagnostic: true, dueAt },
            sound: 'default',
          },
          trigger:
            seconds === 0
              ? null
              : {
                  type: Notifications.SchedulableTriggerInputTypes.DATE,
                  date: new Date(dueAt),
                  channelId: Platform.OS === 'android' ? CHECK_IN_CHANNEL_ID : undefined,
                },
        });
        setMessage(
          seconds === 0
            ? `Sent now (${identifier}).`
            : `Scheduled ${identifier} for ${formatClockTimeWithSeconds(dueAt, timezone)}.`,
        );
        await refreshState();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
      }
    },
    [port, refreshState, timezone],
  );

  const cancelTests = useCallback(async () => {
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      let cancelled = 0;
      for (const request of scheduled) {
        if (diagnosticDueAt(request.content.data) === null) continue;
        await Notifications.cancelScheduledNotificationAsync(request.identifier);
        cancelled += 1;
      }
      await Notifications.dismissAllNotificationsAsync();
      setMessage(`Cancelled ${cancelled} test notification(s).`);
      await refreshState();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, [refreshState]);

  const permission = reminderStatus?.permission ?? 'undetermined';

  return (
    <Screen topInset={false}>
      <SectionTitle>Notification test</SectionTitle>
      <Card style={styles.card}>
        <AppText variant="bodyStrong">Local reminder test</AppText>
        <AppText variant="secondary">
          These test notifications are local to this phone and never create activity
          records. Session reminders use a separate payload, so this test cannot corrupt
          your journal.
        </AppText>
        <AppText variant="secondary">
          Permission: {permission} · channel: {channelIds.join(', ') || 'none yet'}
        </AppText>
        <AppText variant="secondary">
          Pending test notifications: {pending.length}
          {pending.length > 0
            ? ` · next at ${formatClockTimeWithSeconds(pending[0].dueAt, timezone)}`
            : ''}
        </AppText>
      </Card>

      {permission !== 'granted' ? (
        <SecondaryButton
          label="Allow notifications"
          accessibilityHint="Opens the system notification permission dialog"
          onPress={() => {
            void (async () => {
              const result = await requestReminderPermission();
              setMessage(`Permission result: ${result}.`);
              await reconcileNow();
            })();
          }}
        />
      ) : null}

      <SecondaryButton
        label="Send now"
        accessibilityHint="Presents a test notification immediately"
        onPress={() => void scheduleTest(0)}
      />
      <SecondaryButton label="In 10 seconds" onPress={() => void scheduleTest(10)} />
      <SecondaryButton label="In 1 minute" onPress={() => void scheduleTest(60)} />
      <SecondaryButton label="In 15 minutes" onPress={() => void scheduleTest(900)} />
      <SecondaryButton
        label="Cancel test notifications"
        onPress={() => void cancelTests()}
      />
      <QuietButton label="Refresh" onPress={() => void refreshState()} />

      {message ? (
        <Banner tone="neutral" title="Last action">
          <AppText variant="secondary">{message}</AppText>
        </Banner>
      ) : null}

      <SectionTitle>Observed events</SectionTitle>
      {events.length === 0 ? (
        <AppText variant="secondary">
          No test notification has been received or tapped yet. Keep this screen open for
          an immediate test; lock the phone to test the background path.
        </AppText>
      ) : (
        events.map((event) => (
          <View key={event.key} style={styles.eventRow}>
            <AppText variant="bodyStrong">
              {event.kind === 'received' ? 'Received' : 'Tapped'} at{' '}
              {formatClockTimeWithSeconds(event.at, timezone)}
            </AppText>
            <AppText variant="secondary">
              planned {event.dueAt ? formatClockTimeWithSeconds(event.dueAt, timezone) : '—'}
              {event.dueAt
                ? ` · ${Math.max(0, Math.round((event.at - event.dueAt) / 1000))}s later`
                : ''}
            </AppText>
          </View>
        ))
      )}

      <SectionTitle>Device notes</SectionTitle>
      <AppText variant="secondary">
        Android may delay local alarms when the app is not running: without the exact-alarm
        permission the system batches them, and Samsung battery settings can delay them
        further. Record planned vs observed times above before trusting a reminder
        schedule.
      </AppText>
      <AppText variant="secondary">
        Force-stopping the app or restricting battery usage cancels or delays reminders
        until the app is opened again.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  eventRow: {
    gap: 2,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.rule,
  },
});
