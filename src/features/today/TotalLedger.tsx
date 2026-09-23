import { StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { formatDurationLabel } from '../../domain/time/day';
import { palette, radii, spacing } from '../../theme';

export interface TotalLedgerProps {
  elapsedMs: number;
  recordedMs: number;
  skippedMs: number;
  unresolvedMs: number;
  compact?: boolean;
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
      <AppText variant="numeric" color={color}>
        {value}
      </AppText>
      <AppText variant="secondary">{label}</AppText>
    </View>
  );
}

/**
 * Compact ledger of honest totals. Totals are rounded only after summing
 * (the caller passes exact milliseconds).
 */
export function TotalLedger({
  elapsedMs,
  recordedMs,
  skippedMs,
  unresolvedMs,
  compact = false,
}: TotalLedgerProps) {
  return (
    <View style={[styles.ledger, compact && styles.ledgerCompact]}>
      <Column label="Recorded" value={formatDurationLabel(recordedMs)} />
      <View style={styles.divider} />
      <Column
        label="Unresolved"
        value={formatDurationLabel(unresolvedMs)}
        color={unresolvedMs > 0 ? palette.attention : palette.ink}
      />
      <View style={styles.divider} />
      <Column label="Skipped" value={formatDurationLabel(skippedMs)} />
      <View style={styles.divider} />
      <Column label="Session" value={formatDurationLabel(elapsedMs)} />
    </View>
  );
}

const styles = StyleSheet.create({
  ledger: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: palette.surface,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.rule,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  ledgerCompact: {
    paddingVertical: spacing.md,
  },
  column: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: palette.rule,
  },
});
