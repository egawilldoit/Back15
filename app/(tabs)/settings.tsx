import { StyleSheet, Text, View } from 'react-native';

import { palette } from '@/src/theme/palette';

export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <View style={styles.panel}>
        <Text style={styles.label}>CHECK-IN INTERVAL</Text>
        <Text style={styles.value}>15 minutes</Text>
        <Text style={styles.note}>The first release uses a fixed interval.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 54, backgroundColor: palette.background },
  title: { color: palette.ink, fontSize: 30, fontWeight: '700' },
  panel: { marginTop: 32, padding: 22, borderRadius: 20, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
  label: { color: palette.accent, fontSize: 11, letterSpacing: 1.2, fontWeight: '700' },
  value: { marginTop: 12, color: palette.ink, fontSize: 19, fontWeight: '600' },
  note: { marginTop: 8, color: palette.muted, fontSize: 14 },
});
