import { Text, type TextProps, type TextStyle } from 'react-native';
import { typography } from '../theme';

export type TextVariant = keyof typeof typography;

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: string;
  style?: TextStyle | TextStyle[];
}

export function AppText({ variant = 'body', color, style, ...rest }: AppTextProps) {
  const base = typography[variant] as TextStyle;
  return (
    <Text
      {...rest}
      style={[base, color ? { color } : null, style]}
      allowFontScaling
      maxFontSizeMultiplier={1.6}
    />
  );
}
