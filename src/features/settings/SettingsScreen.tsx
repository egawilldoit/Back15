import Constants from 'expo-constants';
import { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, Switch, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { SecondaryButton } from '../../components/Buttons';
import { Banner, Card, Screen, SectionTitle } from '../../components/Layout';
import { getRemindersEnabled, setRemindersEnabled } from '../../storage/repositories/settings';
import { useApp } from '../app/AppProvider';
import { palette, spacing } from '../../theme';

const PERMISSION_COPY: Record<string, string> = {
  granted: 'Notification permission is granted. Reminders follow the active session.',
  denied: 'Notification permission is denied. Manual tracking still works.',
  undetermined: 'Notification permission has not been requested yet.',
  unavailable: 'This build cannot schedule local reminders.',
};

export function SettingsScreen() {
  const { deps, revision, reconcileNow, reminderStatus, refresh } = useApp();
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const value = await getRemindersEnabled(deps.db);
      if (!cancelled) setEnabled(value);
    })();
    return () => {
      cancelled = true;
    };
  }, [deps, revision]);

  const handleToggle = useCallback(
    async (value: boolean) => {
      setEnabled(value);
      await setRemindersEnabled(deps.db, value);
      await reconcileNow();
      refresh();
    },
    [deps, reconcileNow, refresh],
  );

  const permission = reminderStatus?.permission ?? 'undetermined';

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="sectionTitle">Settings</AppText>
        <AppText variant="display">Reminders & data</AppText>
      </View>

      <SectionTitle>Reminders</SectionTitle>
      <Card style={styles.card}>
        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <AppText variant="bodyStrong">Reminders enabled</AppText>
            <AppText variant="secondary">
              Turning reminders off cancels pending prompts. Tracking stays active.
            </AppText>
          </View>
          <Switch
            accessibilityLabel="Reminders enabled"
            value={enabled}
            onValueChange={(value) => void handleToggle(value)}
            trackColor={{ true: palette.accent, false: palette.ruleStrong }}
            thumbColor={palette.surface}
          />
        </View>
        <AppText variant="secondary">{PERMISSION_COPY[permission]}</AppText>
        {reminderStatus?.error ? (
          <Banner tone="attention" title="Reminders unavailable">
            <AppText variant="secondary">{reminderStatus.error}</AppText>
          </Banner>
        ) : null}
        {permission !== 'granted' ? (
          <SecondaryButton
            label="Open device settings"
            onPress={() => void Linking.openSettings()}
          />
        ) : (
          <AppText variant="secondary">
            {reminderStatus?.pendingCount ?? 0} future{' '}
            {(reminderStatus?.pendingCount ?? 0) === 1 ? 'prompt' : 'prompts'} scheduled.
          </AppText>
        )}
      </Card>

      <SectionTitle>Cadence</SectionTitle>
      <Card style={styles.card}>
        <AppText variant="bodyStrong">15-minute check-ins</AppText>
        <AppText variant="secondary">
          Fixed in V0.1. Every session keeps the boundaries anchored to its actual
          start time.
        </AppText>
        <AppText variant="bodyStrong">Maximum reminder window: 12 hours</AppText>
        <AppText variant="secondary">
          Prompts stop after 12 hours so the app cannot invent overnight time. If a
          session reaches the cap, it closes there and can be corrected afterwards.
        </AppText>
      </Card>

      <SectionTitle>Data</SectionTitle>
      <Card style={styles.card}>
        <AppText variant="bodyStrong">Stored on this phone only</AppText>
        <AppText variant="secondary">
          Sessions and entries live in a local SQLite database. There is no account,
          backend, sync, analytics, or push service. Uninstalling Back15 removes the
          journal; JSON/CSV export is planned after V0.1 rather than promised now.
        </AppText>
        <AppText variant="secondary">
          Notification text never includes your descriptions or categories.
        </AppText>
        <AppText variant="secondary">
          App version {Constants.expoConfig?.version ?? '0.1.0'}
        </AppText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  card: {
    gap: spacing.md,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  switchCopy: {
    flex: 1,
    gap: spacing.xs,
  },
});
