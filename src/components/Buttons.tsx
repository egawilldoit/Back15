import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { palette, radii, spacing, touchTarget } from '../theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityHint?: string;
  style?: ViewStyle;
  testID?: string;
}

function variantStyles(kind: 'primary' | 'secondary' | 'quiet' | 'danger') {
  switch (kind) {
    case 'primary':
      return { background: palette.accent, border: palette.accent, text: palette.onAccent };
    case 'secondary':
      return { background: palette.surface, border: palette.ruleStrong, text: palette.ink };
    case 'danger':
      return { background: palette.surface, border: palette.danger, text: palette.danger };
    case 'quiet':
      return { background: 'transparent', border: 'transparent', text: palette.accent };
  }
}

function Button({
  kind,
  label,
  onPress,
  disabled,
  accessibilityHint,
  style,
  testID,
}: ButtonProps & { kind: 'primary' | 'secondary' | 'quiet' | 'danger' }) {
  const colors = variantStyles(kind);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(disabled) }}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      <AppText
        variant="bodyStrong"
        color={colors.text}
        style={styles.label}
        numberOfLines={1}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

export function PrimaryButton(props: ButtonProps) {
  return <Button {...props} kind="primary" />;
}

export function SecondaryButton(props: ButtonProps) {
  return <Button {...props} kind="secondary" />;
}

export function QuietButton(props: ButtonProps) {
  return <Button {...props} kind="quiet" />;
}

export function DangerButton(props: ButtonProps) {
  return <Button {...props} kind="danger" />;
}

export function ButtonRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  label: {
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
});
