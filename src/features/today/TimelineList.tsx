import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { formatClockTime, formatDurationLabel } from '../../domain/time/day';
import type { TimeRange } from '../../domain/time/types';
import { CATEGORY_LABELS } from '../../domain/tracking/types';
import type { Entry, TimelineItem } from '../../domain/tracking/types';
import { palette, radii, spacing } from '../../theme';

export type UnresolvedItem = Extract<TimelineItem, { type: 'unresolved' }>;

export interface TimelineListProps {
  items: readonly TimelineItem[];
  timezone: string;
  onPressEntry: (entry: Entry) => void;
  onPressUnresolved: (item: UnresolvedItem) => void;
}

function rangeLabel(range: TimeRange, timezone: string): string {
  return `${formatClockTime(range.startAt, timezone)}–${formatClockTime(
    range.endAt,
    timezone,
  )}`;
}

export const TimelineList = memo(function TimelineList({
  items,
  timezone,
  onPressEntry,
  onPressUnresolved,
}: TimelineListProps) {
  if (items.length === 0) {
    return <AppText variant="secondary">No check-ins yet today.</AppText>;
  }
  return (
    <View>
      {items.map((item, index) => {
        const last = index === items.length - 1;
        if (item.type === 'entry') {
          const { entry } = item;
          const title = entry.kind === 'skipped' ? 'Skipped' : entry.description ?? '';
          const meta =
            entry.kind === 'skipped'
              ? 'Explicitly skipped'
              : CATEGORY_LABELS[entry.category ?? 'uncategorized'];
          return (
            <Pressable
              key={`entry-${entry.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${rangeLabel(item.clippedRange, timezone)}, ${title}, ${meta}`}
              accessibilityHint="Opens this entry for editing"
              onPress={() => onPressEntry(entry)}
              style={({ pressed }) => [
                styles.row,
                last && styles.rowLast,
                pressed && styles.pressed,
              ]}
            >
              <AppText variant="numericSmall" color={palette.muted} style={styles.range}>
                {rangeLabel(item.clippedRange, timezone)}
              </AppText>
              <View
                style={[
                  styles.dot,
                  entry.kind === 'skipped' ? styles.dotSkipped : styles.dotRecorded,
                ]}
              />
              <View style={styles.body}>
                <AppText
                  variant="bodyStrong"
                  color={entry.kind === 'skipped' ? palette.muted : palette.ink}
                  numberOfLines={2}
                >
                  {title}
                </AppText>
                <AppText variant="secondary" numberOfLines={1}>
                  {meta}
                </AppText>
              </View>
              <AppText variant="numericSmall" color={palette.muted}>
                {formatDurationLabel(item.clippedRange.endAt - item.clippedRange.startAt)}
              </AppText>
            </Pressable>
          );
        }
        if (item.current) {
          return (
            <Pressable
              key={`current-${item.clippedRange.startAt}`}
              accessibilityRole="button"
              accessibilityLabel={`${rangeLabel(
                item.clippedRange,
                timezone,
              )}, in progress, log now`}
              accessibilityHint="Records what you are doing right now"
              onPress={() => onPressUnresolved(item)}
              style={({ pressed }) => [
                styles.row,
                last && styles.rowLast,
                pressed && styles.pressed,
              ]}
            >
              <AppText variant="numericSmall" color={palette.muted} style={styles.range}>
                {rangeLabel(item.clippedRange, timezone)}
              </AppText>
              <View style={[styles.dot, styles.dotCurrent]} />
              <View style={styles.body}>
                <AppText variant="bodyStrong">In progress</AppText>
                <AppText variant="caps" color={palette.accent}>
                  log now →
                </AppText>
              </View>
              <AppText variant="numericSmall" color={palette.muted}>
                {formatDurationLabel(item.clippedRange.endAt - item.clippedRange.startAt)}
              </AppText>
            </Pressable>
          );
        }
        return (
          <Pressable
            key={`gap-${item.clippedRange.startAt}`}
            accessibilityRole="button"
            accessibilityLabel={`${rangeLabel(
              item.clippedRange,
              timezone,
            )}, unresolved, needs an answer`}
            accessibilityHint="Records what you did during this unresolved span"
            onPress={() => onPressUnresolved(item)}
            style={({ pressed }) => [
              styles.gapCard,
              last && styles.rowLast,
              pressed && styles.gapPressed,
            ]}
          >
            <AppText variant="numericSmall" color={palette.attention}>
              {rangeLabel(item.clippedRange, timezone)}
            </AppText>
            <View style={styles.question}>
              <AppText variant="bodyStrong" color={palette.attention}>
                ?
              </AppText>
            </View>
            <View style={styles.body}>
              <AppText variant="bodyStrong" color={palette.attention}>
                What were you doing?
              </AppText>
              <AppText variant="capsAttention">fill in →</AppText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: spacing.md,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.rule,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  pressed: {
    opacity: 0.7,
  },
  range: {
    width: 96,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotRecorded: {
    backgroundColor: palette.accent,
  },
  dotSkipped: {
    backgroundColor: palette.ruleStrong,
  },
  dotCurrent: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: palette.accent,
    backgroundColor: 'transparent',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  gapCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: palette.attention,
    backgroundColor: palette.attentionSoft,
  },
  gapPressed: {
    opacity: 0.85,
  },
  question: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: palette.attention,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
