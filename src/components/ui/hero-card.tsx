import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Platform, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { Spacing } from '@/constants/theme';

type Props = {
  colors: readonly [string, string, ...string[]];
  glow?: string;
  radius?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * The headline hero surface: a vivid gradient that floats on a colored glow,
 * brought to life with a drifting inner light and a slow specular sweep. The
 * living touches are purely decorative and honor reduced-motion.
 */
export function HeroCard({ colors, glow, radius = 24, children, style }: Props) {
  const [width, setWidth] = useState(0);

  return (
    <View style={[styles.glowWrap, glowStyle(glow ?? colors[0]), { borderRadius: radius }]}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={[styles.card, { borderRadius: radius }, style]}>
        <InnerGlow />
        <Shine width={width} />
        <View>{children}</View>
      </LinearGradient>
    </View>
  );
}

/** A soft mint light in the top-right that slowly breathes and drifts. */
function InnerGlow() {
  const t = useSharedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    t.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 6500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 6500, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [reduced, t]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.55 - t.value * 0.18,
    transform: [{ translateX: t.value * 20 - 4 }, { translateY: t.value * -12 }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.innerGlow, style]}>
      <Svg width={230} height={230}>
        <Defs>
          <RadialGradient id="heroGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#9BFFE6" stopOpacity={0.95} />
            <Stop offset="100%" stopColor="#9BFFE6" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={115} cy={115} r={115} fill="url(#heroGlow)" />
      </Svg>
    </Animated.View>
  );
}

/** A diagonal glint that sweeps across every few seconds. */
function Shine({ width }: { width: number }) {
  const p = useSharedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced || width === 0) return;
    p.value = withDelay(
      700,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1250, easing: Easing.inOut(Easing.cubic) }),
          withTiming(1, { duration: 5600 }), // hold off-screen — the pause between glints
          withTiming(0, { duration: 0 }),
        ),
        -1,
        false,
      ),
    );
  }, [reduced, width, p]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: -width * 0.55 + p.value * width * 1.7 }, { rotate: '18deg' }],
  }));

  if (width === 0) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.shineWrap, style]}>
      <LinearGradient
        colors={['transparent', 'rgba(255,255,255,0.18)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.shine}
      />
    </Animated.View>
  );
}

function glowStyle(color: string): ViewStyle {
  return Platform.select<ViewStyle>({
    android: { elevation: 10 },
    default: {
      shadowColor: color,
      shadowOpacity: 0.5,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
    },
  }) as ViewStyle;
}

const styles = StyleSheet.create({
  glowWrap: { width: '100%' },
  card: { padding: Spacing.four, overflow: 'hidden' },
  innerGlow: { position: 'absolute', top: -70, right: -46 },
  shineWrap: { position: 'absolute', top: -40, bottom: -40, width: '32%', left: 0 },
  shine: { flex: 1 },
});
