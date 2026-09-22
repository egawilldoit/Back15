import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { palette } from '@/src/theme/palette';

export default function NotFoundScreen() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Page not found' }} />
      <Text style={styles.title}>This page does not exist.</Text>
      <Link href="/" style={styles.link}>Go to Today</Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: palette.background },
  title: { color: palette.ink, fontSize: 20, fontWeight: '600' },
  link: { color: palette.accent, marginTop: 16, fontSize: 16 },
});
