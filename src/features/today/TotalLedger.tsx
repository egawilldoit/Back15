import { StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { formatCompactDurationLabel } from '../../domain/time/day';
import { palette, spacing } from '../../theme';

export interface TotalLedgerProps {
  elapsedMs: number;
  recordedMs: number;
  skippedMs: number;
  unresolvedMs: number;
}

function Column({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <View style={styles.column}>
      <AppText variant="editorialSmall" color={color} numberOfLines={1} style={styles.value}>
        {value}
      </AppText>
      <AppText variant="caps" numberOfLines={1} style={styles.label}>
        {label}
      </AppText>
    </View>
  );
}

/**
 * Editorial ledger of honest totals. Totals are rounded once, after summing
 * (the caller passes exact milliseconds).
 */
export function TotalLedger({
  elapsedMs,
  recordedMs,
  skippedMs,
  unresolvedMs,
}: TotalLedgerProps) {
  return (
    <View style={styles.ledger}>
      <Column label="Recorded" value={formatCompactDurationLabel(recordedMs)} />
      <View style={styles.divider} />
      <Column label="Skipped" value={formatCompactDurationLabel(skippedMs)} />
      <View style={styles.divider} />
      <Column
        label="Unresolved"
        value={formatCompactDurationLabel(unresolvedMs)}
        color={unresolvedMs > 0 ? palette.attention : undefined}
      />
      <View style={styles.divider} />
      <Column label="Session" value={formatCompactDurationLabel(elapsedMs)} />
    </View>
  );
}

const styles = StyleSheet.create({
  ledger: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: palette.rule,
  },
  column: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  value: {
    fontSize: 24,
    lineHeight: 28,
  },
  label: {
    fontSize: 10,
    letterSpacing: 1.2,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: palette.rule,
  },
});
