import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { AppText } from '../../components/AppText';
import { ChipRow } from '../../components/Chip';
import { DangerButton, PrimaryButton, QuietButton } from '../../components/Buttons';
import { Banner, Card, SectionTitle } from '../../components/Layout';
import { effectiveEndMs } from '../../domain/time/boundaries';
import { formatClockTime, formatDurationLabel } from '../../domain/time/day';
import type { Millis, TimeRange } from '../../domain/time/types';
import type { Category, Entry, EntryKind, Session } from '../../domain/tracking/types';
import { CATEGORIES, CATEGORY_LABELS } from '../../domain/tracking/types';
import { MAX_DESCRIPTION_LENGTH } from '../../domain/tracking/validation';
import { getEntryById, listLiveEntriesForSession } from '../../storage/repositories/entries';
import { getSessionById } from '../../storage/repositories/sessions';
import { deleteEntry, updateEntry } from '../../use-cases/entries';
import { useApp } from '../app/AppProvider';
import { palette, radii, spacing, touchTarget, typography } from '../../theme';

const MINUTE = 60_000;
const ADJUST_STEPS = [-5, -1, 1, 5] as const;

export function EditEntrySheet() {
  const params = useLocalSearchParams<{ entryId?: string }>();
  const entryId = typeof params.entryId === 'string' ? params.entryId : null;
  const router = useRouter();
  const { deps, timezone, revision, refresh } = useApp();

  const [entry, setEntry] = useState<Entry | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [siblings, setSiblings] = useState<Entry[]>([]);
  const [kind, setKind] = useState<EntryKind>('logged');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [startAt, setStartAt] = useState<Millis>(0);
  const [endAt, setEndAt] = useState<Millis>(0);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<TimeRange | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!entryId) {
      setLoaded(true);
      return;
    }
    const loadedEntry = await getEntryById(deps.db, entryId);
    if (!loadedEntry || loadedEntry.deletedAt !== null) {
      setEntry(null);
      setLoaded(true);
      return;
    }
    const loadedSession = await getSessionById(deps.db, loadedEntry.sessionId);
    const liveSiblings = await listLiveEntriesForSession(deps.db, loadedEntry.sessionId);
    setEntry(loadedEntry);
    setSession(loadedSession);
    setSiblings(liveSiblings);
    setKind(loadedEntry.kind);
    setDescription(loadedEntry.description ?? '');
    setCategory(loadedEntry.category);
    setStartAt(loadedEntry.startAt);
    setEndAt(loadedEntry.endAt);
    setLoaded(true);
  }, [deps, entryId]);

  useEffect(() => {
    void load();
  }, [load, revision]);

  const adjust = (edge: 'start' | 'end', delta: number) => {
    if (!session) return;
    const sessionEnd = effectiveEndMs(session, Date.now());
    if (edge === 'start') {
      const next = Math.min(
        Math.max(startAt + delta * MINUTE, session.startedAt),
        endAt - MINUTE,
      );
      setStartAt(next);
    } else {
      const next = Math.max(
        Math.min(endAt + delta * MINUTE, sessionEnd),
        startAt + MINUTE,
      );
      setEndAt(next);
    }
    setError(null);
  };

  const handleSave = useCallback(async () => {
    if (!entry || busy) return;
    setBusy(true);
    setError(null);
    const result = await updateEntry(deps, {
      entryId: entry.id,
      expectedRevision: entry.revision,
      changes: { startAt, endAt, kind, description, category },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      setConflict((result.error.details.conflictingRange as TimeRange) ?? null);
      if (result.error.code === 'REVISION_CONFLICT') {
        await load();
      }
      return;
    }
    setConflict(null);
    setSavedMessage('Changes saved.');
    refresh();
    setTimeout(() => router.back(), 500);
  }, [busy, category, deps, description, endAt, entry, kind, load, refresh, router, startAt]);

  const handleDelete = useCallback(() => {
    if (!entry) return;
    Alert.alert('Delete this entry?', 'Its time will return to unresolved.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy(true);
            const result = await deleteEntry(deps, {
              entryId: entry.id,
              expectedRevision: entry.revision,
            });
            setBusy(false);
            if (!result.ok) {
              setError(result.error.message);
              return;
            }
            refresh();
            router.back();
          })();
        },
      },
    ]);
  }, [deps, entry, refresh, router]);

  if (!loaded) {
    return (
      <View style={styles.container}>
        <AppText variant="secondary">Loading…</AppText>
      </View>
    );
  }

  if (!entry) {
    return (
      <View style={styles.container}>
        <Card>
          <AppText variant="displaySmall">Entry not available</AppText>
          <AppText variant="secondary">
            It may have been deleted in another action.
          </AppText>
          <QuietButton label="Close" onPress={() => router.back()} />
        </Card>
      </View>
    );
  }

  const duration = endAt - startAt;
  const remaining = MAX_DESCRIPTION_LENGTH - Array.from(description.trim()).length;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View>
            <AppText variant="sectionTitle">Edit entry</AppText>
            <AppText variant="displaySmall">
              {formatClockTime(startAt, timezone)}–{formatClockTime(endAt, timezone)}
            </AppText>
            <AppText variant="secondary">{formatDurationLabel(duration)}</AppText>
          </View>
          <QuietButton label="Close" onPress={() => router.back()} />
        </View>

        {savedMessage ? (
          <Banner tone="success" title={savedMessage}>
            <AppText variant="secondary">Refreshing your timeline…</AppText>
          </Banner>
        ) : null}

        {error ? (
          <Banner tone="attention" title="Not saved">
            <AppText variant="secondary">{error}</AppText>
            {conflict ? (
              <AppText variant="secondary">
                Conflicting entry: {formatClockTime(conflict.startAt, timezone)}–
                {formatClockTime(conflict.endAt, timezone)}.
              </AppText>
            ) : null}
          </Banner>
        ) : null}

        <SectionTitle>What happened?</SectionTitle>
        <TextInput
          accessibilityLabel="Description"
          placeholder="Describe this span"
          placeholderTextColor={palette.muted}
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={MAX_DESCRIPTION_LENGTH + 50}
          style={styles.input}
        />
        <AppText variant="secondary" color={remaining < 0 ? palette.attention : undefined}>
          {Math.max(0, remaining)} characters left
        </AppText>

        <SectionTitle>Category (optional)</SectionTitle>
        <View style={styles.chipRow}>
          <ChipRow
            options={CATEGORIES.map((value) => ({
              value,
              label: CATEGORY_LABELS[value],
            }))}
            selected={category}
            onSelect={(value) => setCategory(value as Category | null)}
            disabled={kind === 'skipped'}
          />
        </View>

        <SectionTitle>Kind</SectionTitle>
        <View style={styles.kindRow}>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: kind === 'logged' }}
            accessibilityLabel="Recorded with a description"
            onPress={() => setKind('logged')}
            style={[styles.kindButton, kind === 'logged' && styles.kindSelected]}
          >
            <AppText variant="bodyStrong">Recorded</AppText>
          </Pressable>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: kind === 'skipped' }}
            accessibilityLabel="Explicitly skipped"
            onPress={() => setKind('skipped')}
            style={[styles.kindButton, kind === 'skipped' && styles.kindSelected]}
          >
            <AppText variant="bodyStrong">Skipped</AppText>
          </Pressable>
        </View>

        <SectionTitle>Times</SectionTitle>
        <Card style={styles.timeCard}>
          <View style={styles.adjustRow}>
            <AppText variant="label">Start</AppText>
            {ADJUST_STEPS.map((step) => (
              <Pressable
                key={`start-${step}`}
                accessibilityRole="button"
                accessibilityLabel={`Move start ${step > 0 ? 'later' : 'earlier'} by ${Math.abs(
                  step,
                )} minutes`}
                onPress={() => adjust('start', step)}
                style={({ pressed }) => [styles.adjustButton, pressed && styles.adjustPressed]}
              >
                <AppText variant="numericSmall">{step > 0 ? `+${step}` : step}</AppText>
              </Pressable>
            ))}
          </View>
          <View style={styles.adjustRow}>
            <AppText variant="label">End</AppText>
            {ADJUST_STEPS.map((step) => (
              <Pressable
                key={`end-${step}`}
                accessibilityRole="button"
                accessibilityLabel={`Move end ${step > 0 ? 'later' : 'earlier'} by ${Math.abs(
                  step,
                )} minutes`}
                onPress={() => adjust('end', step)}
                style={({ pressed }) => [styles.adjustButton, pressed && styles.adjustPressed]}
              >
                <AppText variant="numericSmall">{step > 0 ? `+${step}` : step}</AppText>
              </Pressable>
            ))}
          </View>
          <AppText variant="secondary">
            Session bounds {formatClockTime(session?.startedAt ?? 0, timezone)}–
            {formatClockTime(
              session ? effectiveEndMs(session, Date.now()) : 0,
              timezone,
            )}
            {siblings.length > 1 ? ` · ${siblings.length - 1} other live entries` : ''}
          </AppText>
        </Card>

        <View style={styles.actions}>
          <PrimaryButton
            label={busy ? 'Saving…' : 'Save changes'}
            disabled={busy || (kind === 'logged' && description.trim().length === 0)}
            onPress={() => void handleSave()}
          />
          <DangerButton label="Delete entry" disabled={busy} onPress={handleDelete} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  input: {
    ...typography.body,
    minHeight: 88,
    maxHeight: 160,
    borderWidth: 1,
    borderColor: palette.ruleStrong,
    borderRadius: radii.md,
    backgroundColor: palette.surface,
    padding: spacing.md,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  kindRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  kindButton: {
    flex: 1,
    minHeight: touchTarget,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: palette.ruleStrong,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindSelected: {
    borderColor: palette.accent,
    backgroundColor: palette.accentSoft,
  },
  timeCard: {
    gap: spacing.sm,
  },
  adjustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  adjustButton: {
    minWidth: touchTarget,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: palette.ruleStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustPressed: {
    backgroundColor: palette.surfaceMuted,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
