import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { palette, radii, spacing } from '../theme';

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <AppText variant="sectionTitle" style={styles.sectionTitle}>
      {children}
    </AppText>
  );
}

export function Banner({
  tone = 'neutral',
  title,
  children,
}: {
  tone?: 'neutral' | 'attention' | 'danger' | 'success';
  title?: string;
  children?: ReactNode;
}) {
  const background =
    tone === 'attention'
      ? palette.attentionSoft
      : tone === 'danger'
        ? '#F7E3DE'
        : tone === 'success'
          ? '#E3EFE7'
          : palette.surfaceMuted;
  const titleColor =
    tone === 'attention'
      ? palette.attention
      : tone === 'danger'
        ? palette.danger
        : palette.ink;
  return (
    <View style={[styles.banner, { backgroundColor: background }]}>
      {title ? (
        <AppText variant="bodyStrong" color={titleColor}>
          {title}
        </AppText>
      ) : null}
      {children}
    </View>
  );
}

export function Screen({
  children,
  scroll = true,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: ViewStyle;
}) {
  const insets = useSafeAreaInsets();
  const padding = { paddingBottom: insets.bottom + spacing.xxl };
  if (!scroll) {
    return <View style={[styles.screen, padding, contentStyle]}>{children}</View>;
  }
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.scrollContent, padding, contentStyle]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export const layoutStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spaceBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.rule,
  },
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.rule,
    padding: spacing.lg,
  },
  sectionTitle: {
    marginTop: spacing.sm,
  },
  banner: {
    borderRadius: radii.sm,
    padding: spacing.md,
    gap: spacing.xs,
  },
});
