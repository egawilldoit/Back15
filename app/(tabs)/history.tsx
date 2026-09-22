import { StyleSheet, Text, View } from 'react-native';

import { palette } from '@/src/theme/palette';

export default function HistoryScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>History</Text>
      <Text style={styles.body}>Your previous tracking days will appear here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 54, backgroundColor: palette.background },
  title: { color: palette.ink, fontSize: 30, fontWeight: '700' },
  body: { marginTop: 14, color: palette.muted, fontSize: 16, lineHeight: 24 },
});
