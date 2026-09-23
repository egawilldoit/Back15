import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { formatClockTime, formatDurationLabel } from '../../domain/time/day';
import type { TimeRange } from '../../domain/time/types';
import { CATEGORY_LABELS } from '../../domain/tracking/types';
import type { Entry, TimelineItem } from '../../domain/tracking/types';
import { palette, spacing, radii } from '../../theme';

export type UnresolvedItem = Extract<TimelineItem, { type: 'unresolved' }>;

export interface TimelineListProps {
  items: readonly TimelineItem[];
  timezone: string;
  onPressEntry: (entry: Entry) => void;
  onPressUnresolved: (item: UnresolvedItem) => void;
}

function RangeLabel({ range, timezone }: { range: TimeRange; timezone: string }) {
  return (
    <AppText variant="numericSmall" color={palette.muted}>
      {formatClockTime(range.startAt, timezone)}–{formatClockTime(range.endAt, timezone)}
    </AppText>
  );
}

export function TimelineList({
  items,
  timezone,
  onPressEntry,
  onPressUnresolved,
}: TimelineListProps) {
  if (items.length === 0) {
    return (
      <AppText variant="secondary">No activity yet today.</AppText>
    );
  }
  return (
    <View style={styles.list}>
      {items.map((item) => {
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
              accessibilityLabel={`${formatClockTime(
                item.clippedRange.startAt,
                timezone,
              )} to ${formatClockTime(item.clippedRange.endAt, timezone)}, ${title}, ${meta}`}
              accessibilityHint="Opens this entry for editing"
              onPress={() => onPressEntry(entry)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.rangeColumn}>
                <RangeLabel range={item.clippedRange} timezone={timezone} />
              </View>
              <View style={styles.markerColumn}>
                <View
                  style={[
                    styles.dot,
                    entry.kind === 'skipped' ? styles.dotSkipped : styles.dotRecorded,
                  ]}
                />
              </View>
              <View style={styles.bodyColumn}>
                <AppText
                  variant="body"
                  color={entry.kind === 'skipped' ? palette.muted : palette.ink}
                  numberOfLines={2}
                >
                  {title}
                </AppText>
                <AppText variant="secondary">{meta}</AppText>
              </View>
              <AppText variant="numericSmall" color={palette.muted}>
                {formatDurationLabel(
                  item.clippedRange.endAt - item.clippedRange.startAt,
                )}
              </AppText>
            </Pressable>
          );
        }
        const isCurrent = item.current;
        const label = isCurrent ? 'Current, unresolved' : 'Unresolved time';
        return (
          <Pressable
            key={`gap-${item.clippedRange.startAt}-${item.clippedRange.endAt}`}
            accessibilityRole="button"
            accessibilityLabel={`${formatClockTime(
              item.clippedRange.startAt,
              timezone,
            )} to ${formatClockTime(item.clippedRange.endAt, timezone)}, ${label}, ${formatDurationLabel(
              item.clippedRange.endAt - item.clippedRange.startAt,
            )}`}
            accessibilityHint={
              isCurrent ? 'Opens Log now for this span' : 'Opens capture for this unresolved span'
            }
            onPress={() => onPressUnresolved(item)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.rangeColumn}>
              <RangeLabel range={item.clippedRange} timezone={timezone} />
            </View>
            <View style={styles.markerColumn}>
              <View
                style={[
                  styles.dot,
                  isCurrent ? styles.dotCurrent : styles.dotUnresolved,
                ]}
              />
            </View>
            <View style={styles.bodyColumn}>
              <AppText
                variant="body"
                color={isCurrent ? palette.inkSoft : palette.attention}
              >
                {isCurrent ? 'In progress' : 'Unresolved'}
              </AppText>
              <AppText variant="secondary">
                {isCurrent
                  ? 'Log now to record this span'
                  : 'Tap to record what you did'}
              </AppText>
            </View>
            <AppText variant="numericSmall" color={palette.muted}>
              {formatDurationLabel(item.clippedRange.endAt - item.clippedRange.startAt)}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.rule,
    backgroundColor: palette.surface,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.rule,
    gap: spacing.md,
  },
  pressed: {
    backgroundColor: palette.surfaceMuted,
  },
  rangeColumn: {
    width: 92,
  },
  markerColumn: {
    width: 12,
    alignItems: 'center',
  },
  bodyColumn: {
    flex: 1,
    gap: 2,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotRecorded: {
    backgroundColor: palette.accent,
  },
  dotSkipped: {
    backgroundColor: palette.ruleStrong,
  },
  dotUnresolved: {
    backgroundColor: palette.attention,
  },
  dotCurrent: {
    borderWidth: 2,
    borderColor: palette.accent,
    backgroundColor: 'transparent',
  },
});
