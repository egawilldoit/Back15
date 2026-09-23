import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, Switch, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { SecondaryButton } from '../../components/Buttons';
import { Banner, Card, Screen, SectionTitle } from '../../components/Layout';
import { parseJournalBackup } from '../../domain/journal/backup';
import { localDayKey } from '../../domain/time/day';
import { getRemindersEnabled, setRemindersEnabled } from '../../storage/repositories/settings';
import { SCHEMA_VERSION } from '../../storage/sql';
import { exportJournal, importJournal } from '../../use-cases/backup';
import type { ImportMode } from '../../use-cases/backup';
import { useApp } from '../app/AppProvider';
import { palette, spacing } from '../../theme';

const PERMISSION_COPY: Record<string, string> = {
  granted: 'Notification permission is granted. Reminders follow the active session.',
  denied: 'Notification permission is denied. Manual tracking still works.',
  undetermined: 'Notification permission has not been requested yet.',
  unavailable: 'This build cannot schedule local reminders.',
};

export function SettingsScreen() {
  const router = useRouter();
  const {
    deps,
    timezone,
    revision,
    reconcileNow,
    reminderStatus,
    refresh,
    requestReminderPermission,
  } = useApp();
  const [enabled, setEnabled] = useState(true);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);

  const runImport = useCallback(
    async (text: string, mode: ImportMode) => {
      setBackupBusy(true);
      try {
        const result = await importJournal(deps, { text, mode });
        if (!result.ok) {
          Alert.alert('Restore failed', result.error.message);
          return;
        }
        await reconcileNow();
        refresh();
        setBackupMessage(
          `${result.value.sessions} sessions and ${result.value.entries} entries restored (${result.value.tombstones} deleted). Reminders were rebuilt from the restored data.`,
        );
      } finally {
        setBackupBusy(false);
      }
    },
    [deps, reconcileNow, refresh],
  );

  const handleExport = useCallback(async () => {
    setBackupBusy(true);
    try {
      const result = await exportJournal(deps, {
        appVersion: Constants.expoConfig?.version ?? null,
      });
      if (!result.ok) {
        Alert.alert('Export failed', result.error.message);
        return;
      }
      const directory = FileSystem.cacheDirectory;
      if (!directory) {
        Alert.alert('Export failed', 'This device has no writable cache directory.');
        return;
      }
      const uri = `${directory}back15-journal-${localDayKey(Date.now(), timezone)}.json`;
      await FileSystem.writeAsStringAsync(uri, result.value.json, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/json',
          dialogTitle: 'Save Back15 journal',
        });
        setBackupMessage('Journal exported. Save the file somewhere outside this phone app.');
      } else {
        setBackupMessage(`Journal written to ${uri}`);
      }
    } catch (error) {
      Alert.alert(
        'Export failed',
        error instanceof Error ? error.message : 'The journal could not be exported.',
      );
    } finally {
      setBackupBusy(false);
    }
  }, [deps, timezone]);

  const handleRestore = useCallback(async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      const text = await FileSystem.readAsStringAsync(picked.assets[0].uri);
      const parsed = parseJournalBackup(text, SCHEMA_VERSION);
      if (!parsed.ok) {
        Alert.alert('Not a valid backup', parsed.error.message);
        return;
      }
      Alert.alert(
        'Restore journal',
        `This backup holds ${parsed.value.sessions.length} sessions and ${parsed.value.entries.length} entries.\n\nReplace deletes the journal on this phone first. Merge keeps existing rows and updates matching ids. Both run as one transaction.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Merge', onPress: () => void runImport(text, 'merge') },
          {
            text: 'Replace',
            style: 'destructive',
            onPress: () => void runImport(text, 'replace'),
          },
        ],
      );
    } catch (error) {
      Alert.alert(
        'Restore failed',
        error instanceof Error ? error.message : 'That file could not be read.',
      );
    }
  }, [runImport]);

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
            label={permission === 'undetermined' ? 'Enable reminders' : 'Open device settings'}
            onPress={() => {
              if (permission === 'undetermined') {
                void (async () => {
                  await requestReminderPermission();
                  await reconcileNow();
                  refresh();
                })();
              } else {
                void Linking.openSettings();
              }
            }}
          />
        ) : (
          <AppText variant="secondary">
            {reminderStatus?.pendingCount ?? 0} future{' '}
            {(reminderStatus?.pendingCount ?? 0) === 1 ? 'prompt' : 'prompts'} scheduled.
          </AppText>
        )}
        <SecondaryButton
          label="Notification test"
          accessibilityHint="Sends a test notification and records planned versus observed times"
          onPress={() => router.push('/diagnostic')}
        />
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

      <SectionTitle>Backup & restore</SectionTitle>
      <Card style={styles.card}>
        <AppText variant="bodyStrong">Export or restore the journal</AppText>
        <AppText variant="secondary">
          A backup contains every session and entry, including skipped and deleted ones,
          plus the reminder preference. It never contains notification IDs, device
          observation metadata, or account tokens.
        </AppText>
        <AppText variant="secondary">
          Restore validates the file before touching storage and runs as one transaction:
          a malformed file, an overlap or a conflict leaves the current journal exactly as
          it was. Reminders are rebuilt from the restored rows.
        </AppText>
        {backupMessage ? <AppText variant="secondary">{backupMessage}</AppText> : null}
        <SecondaryButton
          label={backupBusy ? 'Working…' : 'Export journal'}
          disabled={backupBusy}
          accessibilityHint="Writes a JSON backup and opens the share sheet"
          onPress={() => void handleExport()}
        />
        <SecondaryButton
          label="Restore from a backup file"
          disabled={backupBusy}
          accessibilityHint="Pick a backup file, then choose merge or replace"
          onPress={() => void handleRestore()}
        />
        <AppText variant="secondary">
          Limitation: the Back15 build already installed on this phone cannot export its
          data until it receives an update that includes this screen. Only backups you
          create from now on can be restored.
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
        <SecondaryButton
          label="Reminder diagnostic"
          accessibilityHint="Opens the local notification probe used for device evidence"
          onPress={() => router.push('/diagnostic')}
        />
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
