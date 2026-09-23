import { Pressable, StyleSheet } from 'react-native';
import { AppText } from './AppText';
import { palette, radii, spacing, touchTarget } from '../theme';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}

export function Chip({ label, selected = false, onPress, disabled }: ChipProps) {
  const container = {
    backgroundColor: selected ? palette.accent : palette.surface,
    borderColor: selected ? palette.accent : palette.ruleStrong,
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        container,
        { opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      <AppText
        variant="label"
        color={selected ? palette.onAccent : palette.ink}
        style={styles.label}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

export interface ChipRowProps {
  options: readonly { value: string; label: string }[];
  selected: string | null;
  onSelect: (value: string | null) => void;
  disabled?: boolean;
}

/** Single-select chip row that allows clearing the selection. */
export function ChipRow({ options, selected, onSelect, disabled }: ChipRowProps) {
  return (
    <>
      {options.map((option) => {
        const isSelected = selected === option.value;
        return (
          <Chip
            key={option.value}
            label={option.label}
            selected={isSelected}
            disabled={disabled}
            onPress={() => onSelect(isSelected ? null : option.value)}
          />
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 40,
    minWidth: touchTarget - 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  label: {
    textAlign: 'center',
  },
});
