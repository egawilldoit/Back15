import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type {
  PendingReminder,
  PresentedReminder,
  ReminderPayload,
  ReminderPermission,
  ReminderPort,
} from './types';
import { permissionFromStatus } from './permission';
import { parseReminderPayload } from './types';

export const CHECK_IN_CHANNEL_ID = 'check-ins';

/**
 * Foreground display is deliberate: without a handler Expo's default is to
 * show nothing while the app is open.
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

function mapNotification(notification: Notifications.Notification): PendingReminder | null {
  const payload = parseReminderPayload(notification.request.content.data);
  if (!payload) return null;
  return { nativeId: notification.request.identifier, payload };
}

export function createExpoReminderPort(): ReminderPort {
  return {
    async getPermission() {
      return permissionFromStatus(await Notifications.getPermissionsAsync());
    },
    async requestPermission() {
      await this.ensureChannel();
      return permissionFromStatus(await Notifications.requestPermissionsAsync());
    },
    async ensureChannel() {
      if (Platform.OS !== 'android') return;
      await Notifications.setNotificationChannelAsync(CHECK_IN_CHANNEL_ID, {
        name: 'Check-ins',
        description: 'Local 15-minute check-in reminders during a tracking session.',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'default',
      });
    },
    async schedule(payload: ReminderPayload) {
      await this.ensureChannel();
      return Notifications.scheduleNotificationAsync({
        content: {
          title: 'What did you do?',
          body: 'Log your last check-in.',
          data: {
            version: payload.version,
            sessionId: payload.sessionId,
            dueAt: payload.dueAt,
          },
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(payload.dueAt),
          channelId: Platform.OS === 'android' ? CHECK_IN_CHANNEL_ID : undefined,
        },
      });
    },
    async listPending() {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      const reminders: PendingReminder[] = [];
      for (const request of scheduled) {
        const payload = parseReminderPayload(request.content.data);
        if (payload) reminders.push({ nativeId: request.identifier, payload });
      }
      return reminders;
    },
    async cancel(nativeId: string) {
      await Notifications.cancelScheduledNotificationAsync(nativeId);
    },
    async listPresented() {
      const presented = await Notifications.getPresentedNotificationsAsync();
      const reminders: PresentedReminder[] = [];
      for (const notification of presented) {
        const mapped = mapNotification(notification);
        if (mapped) reminders.push(mapped);
      }
      return reminders;
    },
    async dismiss(nativeId: string) {
      await Notifications.dismissNotificationAsync(nativeId);
    },
  };
}
