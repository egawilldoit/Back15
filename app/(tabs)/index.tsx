import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { palette } from '@/src/theme/palette';

export default function TodayScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>BACK15</Text>
      <Text style={styles.heading}>Today, as it happened.</Text>
      <Text style={styles.description}>
        A calm place to record what you did and see where your time went.
      </Text>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>TODAY</Text>
        <Text style={styles.panelTitle}>No time recorded yet</Text>
        <Text style={styles.panelCopy}>
          Your activity timeline will appear here when tracking is available.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingTop: 54, backgroundColor: palette.background },
  eyebrow: { color: palette.accent, fontWeight: '800', letterSpacing: 2, fontSize: 12 },
  heading: { marginTop: 16, fontSize: 35, lineHeight: 42, fontWeight: '700', color: palette.ink },
  description: { marginTop: 12, maxWidth: 320, fontSize: 16, lineHeight: 24, color: palette.muted },
  panel: { marginTop: 44, padding: 24, borderRadius: 20, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
  panelLabel: { color: palette.accent, fontWeight: '700', fontSize: 11, letterSpacing: 1.5 },
  panelTitle: { marginTop: 18, color: palette.ink, fontSize: 21, fontWeight: '700' },
  panelCopy: { marginTop: 8, fontSize: 14, lineHeight: 21, color: palette.muted },
});
