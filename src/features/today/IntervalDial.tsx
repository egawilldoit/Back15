import { StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { palette } from '../../theme';

const DIAL_SIZE = 96;
const DOT_SIZE = 6;
const RADIUS = DIAL_SIZE / 2 - DOT_SIZE;

export interface IntervalDialProps {
  /** Whole minutes already completed in the current span. */
  elapsed: number;
  /** Planned minutes per span, 15 by default. */
  total: number;
}

/**
 * One dot per planned minute, arranged around the current span. Renders the
 * reference's circular "3 / 15 elapsed" figure without a chart dependency.
 */
export function IntervalDial({ elapsed, total }: IntervalDialProps) {
  const clamped = Math.max(0, Math.min(total, elapsed));
  const dots = Array.from({ length: total }, (_, index) => {
    const angle = -Math.PI / 2 + (index / total) * Math.PI * 2;
    return {
      index,
      left: DIAL_SIZE / 2 + RADIUS * Math.cos(angle) - DOT_SIZE / 2,
      top: DIAL_SIZE / 2 + RADIUS * Math.sin(angle) - DOT_SIZE / 2,
    };
  });
  return (
    <View
      style={styles.dial}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${clamped} of ${total} planned minutes elapsed in this span`}
      accessibilityValue={{ min: 0, max: total, now: clamped }}
    >
      {dots.map((dot) => (
        <View
          key={dot.index}
          style={[
            styles.dot,
            { left: dot.left, top: dot.top },
            dot.index < clamped ? styles.dotDone : styles.dotPending,
          ]}
        />
      ))}
      <View style={styles.center} pointerEvents="none">
        <AppText variant="numericSmall" color={palette.onAccent}>
          {clamped} / {total}
        </AppText>
        <AppText variant="capsOnAccent">elapsed</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dial: {
    width: DIAL_SIZE,
    height: DIAL_SIZE,
  },
  dot: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  dotDone: {
    backgroundColor: palette.onAccent,
  },
  dotPending: {
    backgroundColor: 'rgba(255,255,255,0.30)',
  },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
