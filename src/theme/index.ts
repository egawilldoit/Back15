import { Platform } from 'react-native';
import { palette } from './palette';

export { palette };
export type { Palette } from './palette';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

export const fontFamilies = {
  display: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
  body: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
  bodyMedium: Platform.select({
    ios: 'System',
    android: 'sans-serif-medium',
    default: 'System',
  }),
} as const;

export const touchTarget = 48;

export const typography = {
  display: {
    fontFamily: fontFamilies.display,
    fontSize: 30,
    lineHeight: 36,
    color: palette.ink,
  },
  displaySmall: {
    fontFamily: fontFamilies.display,
    fontSize: 22,
    lineHeight: 28,
    color: palette.ink,
  },
  sectionTitle: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
    color: palette.muted,
  },
  body: {
    fontFamily: fontFamilies.body,
    fontSize: 16,
    lineHeight: 22,
    color: palette.ink,
  },
  bodyStrong: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 16,
    lineHeight: 22,
    color: palette.ink,
  },
  secondary: {
    fontFamily: fontFamilies.body,
    fontSize: 14,
    lineHeight: 20,
    color: palette.muted,
  },
  label: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    color: palette.inkSoft,
  },
  numeric: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 20,
    lineHeight: 26,
    color: palette.ink,
  },
  numericSmall: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 15,
    lineHeight: 20,
    color: palette.ink,
  },
} as const;

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
