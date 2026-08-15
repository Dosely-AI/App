import { LinearGradient } from 'expo-linear-gradient';
import { Platform, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const RADIUS = 22;

/**
 * A liquid-glass surface: a translucent, blurred pane with a lit top edge and a
 * soft specular sheen across its upper half, floating on a gentle shadow — so
 * ambient color refracts through and the card reads as a slab of frosted glass.
 * On web it uses a real backdrop blur; on native the translucent fill + sheen +
 * lit border carry the effect.
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
        Platform.OS === 'web' ? (WEB_GLASS as ViewStyle) : null,
        style,
      ]}>
      {/* Specular sheen across the top — the glossy "glass" cue. */}
      <LinearGradient
        colors={g.sheen}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.4, y: 1 }}
        style={styles.sheen}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

const DARK = {
  surface: 'rgba(17, 35, 59, 0.62)',
  edgeTop: 'rgba(150, 245, 214, 0.28)',
  edgeSide: 'rgba(130, 200, 220, 0.10)',
  edgeBottom: 'rgba(3, 10, 22, 0.40)',
  sheen: ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.02)', 'rgba(255,255,255,0)'] as const,
};

const LIGHT = {
  surface: 'rgba(255, 255, 255, 0.78)',
  edgeTop: 'rgba(255, 255, 255, 0.95)',
  edgeSide: 'rgba(10, 22, 38, 0.05)',
  edgeBottom: 'rgba(10, 22, 38, 0.10)',
  sheen: ['rgba(255,255,255,0.6)', 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0)'] as const,
};

const WEB_GLASS = {
  backdropFilter: 'blur(22px) saturate(1.5)',
  WebkitBackdropFilter: 'blur(22px) saturate(1.5)',
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: RADIUS,
    padding: Spacing.four,
    overflow: 'hidden',
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '60%',
  },
  elevation: Platform.select({
    android: { elevation: 3 },
    default: {
      shadowColor: '#01060F',
      shadowOpacity: 0.4,
      shadowRadius: 26,
      shadowOffset: { width: 0, height: 16 },
    },
  }),
});
