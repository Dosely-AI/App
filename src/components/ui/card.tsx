import { Platform, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * A frosted-glass surface: a translucent panel with a lit top edge and a soft
 * drop shadow, so ambient color glows through and the card reads as a pane of
 * glass floating above the page. On web it uses a real backdrop blur; on native
 * the translucent fill + lit border carry the effect without a blur backdrop.
 */
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const dark = useColorScheme() === 'dark';
  const g = dark ? DARK : LIGHT;

  return (
    <View
      style={[
        styles.card,
        styles.elevation,
        {
          backgroundColor: g.surface,
          borderTopColor: g.edgeTop,
          borderLeftColor: g.edgeSide,
          borderRightColor: g.edgeSide,
          borderBottomColor: g.edgeBottom,
        },
        // Real frosted glass in the browser; a no-op on native.
        Platform.OS === 'web' ? (WEB_GLASS as ViewStyle) : null,
        style,
      ]}>
      {children}
    </View>
  );
}

const DARK = {
  surface: 'rgba(16, 34, 57, 0.72)',
  edgeTop: 'rgba(132, 240, 208, 0.22)',
  edgeSide: 'rgba(130, 200, 220, 0.10)',
  edgeBottom: 'rgba(4, 12, 24, 0.35)',
};

const LIGHT = {
  surface: 'rgba(255, 255, 255, 0.86)',
  edgeTop: 'rgba(255, 255, 255, 0.95)',
  edgeSide: 'rgba(10, 22, 38, 0.06)',
  edgeBottom: 'rgba(10, 22, 38, 0.10)',
};

const WEB_GLASS = {
  backdropFilter: 'blur(16px) saturate(1.4)',
  WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: Spacing.four,
  },
  elevation: Platform.select({
    android: { elevation: 3 },
    default: {
      shadowColor: '#020610',
      shadowOpacity: 0.34,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 14 },
    },
  }),
});
