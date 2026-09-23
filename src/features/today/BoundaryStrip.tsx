import { StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { boundaryStripWindow } from '../../domain/time/boundaries';
import type { BoundarySession } from '../../domain/time/boundaries';
import { formatClockTime } from '../../domain/time/day';
import type { Millis } from '../../domain/time/types';
import { palette, spacing } from '../../theme';

const MAX_DOTS = 11;

export interface BoundaryStripProps {
  session: BoundarySession;
  now: Millis;
  timezone: string;
}

/**
 * Session-anchored check-in boundaries: completed dots, the next planned
 * boundary marked NOW, and remaining planned boundaries. Derived entirely from
 * the session start and interval, never from an illustration.
 */
export function BoundaryStrip({ session, now, timezone }: BoundaryStripProps) {
  const window = boundaryStripWindow(session, now, MAX_DOTS);
  if (!window) return null;
  const { items, completed, current } = window;
  const intervalMinutes = Math.round(session.intervalSeconds / 60);
  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={`Planned check-ins every ${intervalMinutes} minutes from ${formatClockTime(
        session.startedAt,
        timezone,
      )} to ${formatClockTime(items[items.length - 1].at, timezone)}. ${
        completed === 0 ? 'No boundary completed yet' : `${completed} completed`
      }.`}
    >
      <View style={styles.row}>
        <AppText variant="numericSmall" color={palette.muted}>
          {formatClockTime(session.startedAt, timezone)}
        </AppText>
        <View style={styles.dots}>
          {items.map((item) => {
            const done = item.n <= completed;
            const isNow = item.n === current;
            return (
              <View key={item.n} style={styles.slot}>
                <View
                  style={[
                    styles.dot,
                    done ? styles.dotDone : isNow ? styles.dotNow : styles.dotFuture,
                  ]}
                />
                {isNow ? (
                  <View style={styles.nowWrap} pointerEvents="none">
                    <AppText variant="caps" color={palette.accent}>
                      now
                    </AppText>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
        <AppText variant="numericSmall" color={palette.muted}>
          {formatClockTime(items[items.length - 1].at, timezone)}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 44,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dots: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  slot: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 14,
    height: 14,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  dotDone: {
    backgroundColor: palette.inkSoft,
  },
  dotNow: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: palette.accent,
  },
  dotFuture: {
    borderWidth: 1.5,
    borderColor: palette.ruleStrong,
    backgroundColor: 'transparent',
  },
  nowWrap: {
    position: 'absolute',
    top: 16,
    width: 60,
    alignItems: 'center',
  },
});
