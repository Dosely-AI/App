import { LinearGradient } from 'expo-linear-gradient';
import { Platform, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import { Spacing } from '@/constants/theme';

type Props = {
  children: React.ReactNode;
  /** Two or more gradient stops, top-left to bottom-right. */
  colors: readonly [string, string, ...string[]];
  /** Color of the soft glow cast beneath the card. Defaults to the first stop. */
  glow?: string;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * A vivid gradient surface that floats above the page on a colored glow —
 * used for headline content where a plain card would feel flat.
 */
export function GradientCard({ children, colors, glow, radius = 22, style }: Props) {
  return (
    <View style={[styles.glowWrap, glowStyle(glow ?? colors[0]), { borderRadius: radius }]}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, { borderRadius: radius }, style]}>
        {children}
      </LinearGradient>
    </View>
  );
}

/** A colored shadow reads as light bouncing off the card onto the page. */
function glowStyle(color: string): ViewStyle {
  return Platform.select<ViewStyle>({
    android: { elevation: 8 },
    default: {
      shadowColor: color,
      shadowOpacity: 0.45,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
    },
  }) as ViewStyle;
}

const styles = StyleSheet.create({
  glowWrap: { width: '100%' },
  card: { padding: Spacing.four, overflow: 'hidden' },
});
