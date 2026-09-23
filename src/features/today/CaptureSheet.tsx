import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { AppText } from '../../components/AppText';
import { ChipRow } from '../../components/Chip';
import { PrimaryButton, QuietButton, SecondaryButton } from '../../components/Buttons';
import { Banner, SectionTitle } from '../../components/Layout';
import { formatClockTime, formatDurationLabel } from '../../domain/time/day';
import type { Millis, TimeRange } from '../../domain/time/types';
import type { Category, Entry, Session } from '../../domain/tracking/types';
import { CATEGORIES, CATEGORY_LABELS } from '../../domain/tracking/types';
import { MAX_DESCRIPTION_LENGTH } from '../../domain/tracking/validation';
import { checkInTarget, logNowTarget } from '../../domain/tracking/proposals';
import { latestLiveLoggedEntry, listLiveEntriesForSession } from '../../storage/repositories/entries';
import { getSessionById } from '../../storage/repositories/sessions';
import { continuePrevious, createEntry, skipRange } from '../../use-cases/entries';
import { effectiveEndMs } from '../../domain/time/boundaries';
import { useApp } from '../app/AppProvider';
import { palette, radii, spacing, touchTarget, typography } from '../../theme';

const ADJUST_STEPS = [-5, -1, 1, 5] as const;
const MINUTE = 60_000;

type Mode = 'checkin' | 'lognow' | 'resolve';

interface Proposal {
  range: TimeRange;
  olderGaps: number;
  previousDescription: string | null;
}

function parseParam(value: string | string[] | undefined): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function CaptureSheet() {
  const params = useLocalSearchParams<{
    sessionId?: string;
    mode?: string;
    startAt?: string;
    endAt?: string;
  }>();
  const router = useRouter();
  const { deps, timezone, revision, refresh } = useApp();
  const mode: Mode =
    params.mode === 'lognow' ? 'lognow' : params.mode === 'resolve' ? 'resolve' : 'checkin';
  const sessionId = typeof params.sessionId === 'string' ? params.sessionId : null;

  const [session, setSession] = useState<Session | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [range, setRange] = useState<TimeRange | null>(null);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<TimeRange | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const saveActionId = useRef<string | null>(null);
  const skipActionId = useRef<string | null>(null);
  if (saveActionId.current === null) saveActionId.current = deps.newId();
  if (skipActionId.current === null) skipActionId.current = deps.newId();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!sessionId) {
        setLoaded(true);
        return;
      }
      const loadedSession = await getSessionById(deps.db, sessionId);
      if (cancelled) return;
      if (!loadedSession) {
        setSession(null);
        setLoaded(true);
        return;
      }
      const entries = await listLiveEntriesForSession(deps.db, loadedSession.id);
      const now = Date.now();
      let nextRange: TimeRange | null = null;
      let olderGaps = 0;
      if (mode === 'resolve') {
        const startAt = parseParam(params.startAt);
        const endAt = parseParam(params.endAt);
        if (startAt !== null && endAt !== null && endAt > startAt) {
          nextRange = { startAt, endAt };
        }
      } else if (mode === 'lognow') {
        const target = logNowTarget(loadedSession, entries, now);
        nextRange = target?.range ?? null;
      } else {
        const target = checkInTarget(loadedSession, entries, now);
        olderGaps = target?.olderGaps.length ?? 0;
        nextRange = target?.range ?? logNowTarget(loadedSession, entries, now)?.range ?? null;
      }

      let previousDescription: string | null = null;
      if (nextRange) {
        const previous = await latestLiveLoggedEntry(deps.db, loadedSession.id, nextRange.startAt);
        previousDescription = previous?.description ?? null;
        const coveredError = checkCovered(loadedSession, entries, nextRange, now);
        if (coveredError) {
          setError(coveredError);
          nextRange = null;
        }
      }
      if (cancelled) return;
      setSession(loadedSession);
      setProposal(nextRange ? { range: nextRange, olderGaps, previousDescription } : null);
      setRange(nextRange);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [deps, mode, params.endAt, params.startAt, revision, sessionId]);

  const liveRange = range ?? proposal?.range ?? null;
  const durationMs = liveRange ? liveRange.endAt - liveRange.startAt : 0;
  const remainingChars = MAX_DESCRIPTION_LENGTH - Array.from(description.trim()).length;

  const adjust = useCallback(
    (edge: 'start' | 'end', deltaMinutes: number) => {
      setRange((current) => {
        const base = current ?? proposal?.range;
        if (!base || !session) return current;
        const sessionEnd = effectiveEndMs(session, Date.now());
        if (edge === 'start') {
          const next = Math.min(
            Math.max(base.startAt + deltaMinutes * MINUTE, session.startedAt),
            base.endAt - MINUTE,
          );
          return { startAt: next, endAt: base.endAt };
        }
        const next = Math.max(
          Math.min(base.endAt + deltaMinutes * MINUTE, sessionEnd),
          base.startAt + MINUTE,
        );
        return { startAt: base.startAt, endAt: next };
      });
      setError(null);
    },
    [proposal, session],
  );

  const handleSave = useCallback(async () => {
    if (!session || !liveRange || busy) return;
    setBusy(true);
    setError(null);
    const result = await createEntry(deps, {
      sessionId: session.id,
      range: liveRange,
      description,
      category,
      origin: mode === 'checkin' || mode === 'resolve' ? 'backfilled' : 'typed',
      actionId: saveActionId.current!,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      setConflict((result.error.details.conflictingRange as TimeRange) ?? null);
      return;
    }
    setConflict(null);
    setSavedMessage(
      `${formatDurationLabel(liveRange.endAt - liveRange.startAt)} recorded.`,
    );
    refresh();
    setTimeout(() => router.back(), 650);
  }, [busy, category, deps, description, liveRange, mode, refresh, router, session]);

  const handleContinue = useCallback(async () => {
    if (!session || !liveRange || busy) return;
    setBusy(true);
    setError(null);
    const result = await continuePrevious(deps, {
      sessionId: session.id,
      range: liveRange,
      actionId: saveActionId.current!,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setSavedMessage('Continued the previous activity.');
    refresh();
    setTimeout(() => router.back(), 650);
  }, [busy, deps, liveRange, refresh, router, session]);

  const handleSkip = useCallback(async () => {
    if (!session || !liveRange || busy) return;
    setBusy(true);
    setError(null);
    const result = await skipRange(deps, {
      sessionId: session.id,
      range: liveRange,
      actionId: skipActionId.current!,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setSavedMessage('Marked as skipped.');
    refresh();
    setTimeout(() => router.back(), 650);
  }, [busy, deps, liveRange, refresh, router, session]);

  const title =
    mode === 'lognow' ? 'Log now' : mode === 'resolve' ? 'Resolve time' : 'Check-in';

  if (!loaded) {
    return (
      <View style={styles.container}>
        <AppText variant="secondary">Loading…</AppText>
      </View>
    );
  }

  const covered = !proposal && !error;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.headerRow}>
        <View>
          <AppText variant="sectionTitle">{title}</AppText>
          <AppText variant="displaySmall">What did you do?</AppText>
        </View>
        <QuietButton label="Close" onPress={() => router.back()} />
      </View>

      {covered ? (
        <Banner tone="success" title="This time is already covered">
          <AppText variant="secondary">
            Nothing is left to record here. Close this sheet and review the timeline.
          </AppText>
        </Banner>
      ) : null}

      {liveRange ? (
        <View style={styles.rangeCard}>
          <AppText variant="numeric">
            {formatClockTime(liveRange.startAt, timezone)}–
            {formatClockTime(liveRange.endAt, timezone)}
          </AppText>
          <AppText variant="secondary">
            {formatDurationLabel(durationMs)}
            {proposal && proposal.olderGaps > 0
              ? ` · ${proposal.olderGaps} older ${
                  proposal.olderGaps === 1 ? 'gap' : 'gaps'
                } remain`
              : ''}
          </AppText>
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
        </View>
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

      {savedMessage ? (
        <Banner tone="success" title={savedMessage}>
          <AppText variant="secondary">Updating your timeline…</AppText>
        </Banner>
      ) : null}

      {liveRange && !savedMessage ? (
        <>
          <TextInput
            accessibilityLabel="Description"
            placeholder="e.g. Wrote the release notes"
            placeholderTextColor={palette.muted}
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={MAX_DESCRIPTION_LENGTH + 50}
            style={styles.input}
            autoFocus={mode === 'lognow'}
          />
          <AppText variant="secondary" color={remainingChars < 0 ? palette.attention : undefined}>
            {Math.max(0, remainingChars)} characters left · trimming happens on save
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
            />
          </View>

          <View style={styles.actions}>
            <PrimaryButton
              label={busy ? 'Saving…' : 'Save'}
              disabled={busy || description.trim().length === 0}
              accessibilityHint="Saves one entry for the shown range"
              onPress={() => void handleSave()}
            />
            {proposal?.previousDescription ? (
              <SecondaryButton
                label="Continue previous"
                accessibilityHint={`Copies the description: ${proposal.previousDescription}`}
                disabled={busy}
                onPress={() => void handleContinue()}
              />
            ) : null}
            <SecondaryButton
              label="Skip this time"
              disabled={busy}
              onPress={() => void handleSkip()}
            />
          </View>
          {proposal?.previousDescription ? (
            <AppText variant="secondary">
              Continue previous will reuse “{proposal.previousDescription}”.
            </AppText>
          ) : null}
          <AppText variant="secondary">
            Closing leaves this span unresolved. It will not be skipped automatically.
          </AppText>
        </>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function checkCovered(
  session: Session,
  entries: readonly Entry[],
  range: TimeRange,
  now: Millis,
): string | null {
  if (session.status === 'closed' && range.endAt > (session.endedAt ?? session.startedAt)) {
    return 'That span is outside the closed session.';
  }
  const overlap = entries.some(
    (entry) => entry.startAt < range.endAt && range.startAt < entry.endAt,
  );
  if (overlap) return 'This time already has an entry.';
  if (range.endAt > effectiveEndMs(session, now) || range.startAt < session.startedAt) {
    return 'That span falls outside the session.';
  }
  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
    padding: spacing.lg,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rangeCard: {
    backgroundColor: palette.surface,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.rule,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  adjustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
  input: {
    ...typography.body,
    minHeight: 96,
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
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
