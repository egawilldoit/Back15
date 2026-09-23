/**
 * Back15 field-notes palette. Warm paper, editorial ink, cobalt tracking
 * surface, restrained orange for unresolved time.
 */
export const palette = {
  background: '#F8F5ED',
  surface: '#FFFFFF',
  surfaceMuted: '#F1EDE2',
  ink: '#1E2525',
  inkSoft: '#3A4241',
  muted: '#6A716F',
  accent: '#1F50D8',
  accentPressed: '#1A44B8',
  accentSoft: '#E4EAFB',
  attention: '#C94E14',
  attentionSoft: '#FBE9DF',
  rule: '#DAD9D1',
  ruleStrong: '#C4C2B8',
  onAccent: '#FFFFFF',
  onAccentMuted: '#C9D4F5',
  success: '#2F6B4F',
  danger: '#A33A1F',
} as const;

export type Palette = typeof palette;
