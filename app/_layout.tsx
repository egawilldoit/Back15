import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppProvider } from '@/src/features/app/AppProvider';
import { configureNotificationHandler } from '@/src/reminders/expoReminders';
import { palette } from '@/src/theme';

configureNotificationHandler();

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  return (
    <AppProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: palette.background },
          headerTintColor: palette.ink,
          headerStyle: { backgroundColor: palette.background },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="capture" options={{ presentation: 'modal', title: 'Check-in' }} />
        <Stack.Screen name="stop" options={{ presentation: 'modal', title: 'Stop tracking' }} />
        <Stack.Screen
          name="edit/[entryId]"
          options={{ presentation: 'modal', title: 'Edit entry' }}
        />
        <Stack.Screen name="day/[dayKey]" options={{ title: 'Day detail' }} />
        <Stack.Screen name="diagnostic" options={{ title: 'Reminder diagnostic' }} />
      </Stack>
    </AppProvider>
  );
}
