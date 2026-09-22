import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';

import { palette } from '@/src/theme/palette';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: palette.accent,
      tabBarInactiveTintColor: palette.muted,
      tabBarStyle: { backgroundColor: palette.surface, borderTopColor: palette.border },
      headerShown: false,
    }}>
      <Tabs.Screen name="index" options={{
        title: 'Today',
        tabBarIcon: ({ color }) => (
          <SymbolView name={{ ios: 'clock', android: 'schedule', web: 'schedule' }} tintColor={color} size={24} />
        ),
      }} />
      <Tabs.Screen name="history" options={{
        title: 'History',
        tabBarIcon: ({ color }) => (
          <SymbolView name={{ ios: 'calendar', android: 'event', web: 'event' }} tintColor={color} size={24} />
        ),
      }} />
      <Tabs.Screen name="settings" options={{
        title: 'Settings',
        tabBarIcon: ({ color }) => (
          <SymbolView name={{ ios: 'gearshape', android: 'settings', web: 'settings' }} tintColor={color} size={24} />
        ),
      }} />
    </Tabs>
  );
}
