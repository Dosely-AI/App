import { useEffect, useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Stop } from 'react-native-svg';

const ACircle = Animated.createAnimatedComponent(Circle);

/**
 * The hero adherence ring: a large, glowing arc that draws itself on mount,
 * trailed by a bright "comet" endpoint, and haloed by a slow breathing glow.
 * The centerpiece of the Today screen — dramatic on purpose. Honors reduced
 * motion (fills to the value with no looping glow).
 */
export function HeroRing({
  pct,
  size = 236,
  thickness = 16,
  gradient = ['#1FC79C', '#8BFFE0'],
  glow = '#34EBB4',
  children,
}: {
  pct: number;
  size?: number;
  thickness?: number;
  /** Two-stop arc gradient. Defaults to brand mint. */
  gradient?: readonly [string, string];
  /** Halo + endpoint glow color. Defaults to brand mint. */
  glow?: string;
  children?: React.ReactNode;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - thickness * 1.7; // headroom for the endpoint glow
  const circ = 2 * Math.PI * r;
  const target = Math.max(0, Math.min(100, pct)) / 100;
  const reduced = useReducedMotion();

  // Unique gradient ids so multiple rings on/across screens never collide.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const arcId = `arc${uid}`;
  const haloId = `halo${uid}`;

  const progress = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    progress.value = reduced
      ? target
      : withDelay(250, withTiming(target, { duration: 1500, easing: Easing.out(Easing.cubic) }));
  }, [target, reduced, progress]);

  useEffect(() => {
    if (reduced) return;
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 2400, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [reduced, pulse]);

  const arcProps = useAnimatedProps(() => ({ strokeDashoffset: circ * (1 - progress.value) }));

  // The comet endpoint rides the tip of the arc. Angle measured from 3 o'clock
  // in SVG space; the whole SVG is rotated -90deg so it visually starts at top.
  const endpoint = useAnimatedProps(() => {
    const ang = 2 * Math.PI * progress.value;
    return { cx: cx + r * Math.cos(ang), cy: cy + r * Math.sin(ang) };
  });

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + pulse.value * 0.35,
    transform: [{ scale: 0.9 + pulse.value * 0.14 }],
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Breathing halo */}
      <Animated.View style={[StyleSheet.absoluteFill, haloStyle]} pointerEvents="none">
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id={haloId} cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={glow} stopOpacity="0.55" />
              <Stop offset="55%" stopColor={glow} stopOpacity="0.12" />
              <Stop offset="100%" stopColor={glow} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={cx} cy={cy} r={size / 2} fill={`url(#${haloId})`} />
        </Svg>
      </Animated.View>

      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Defs>
          <LinearGradient id={arcId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={gradient[0]} />
            <Stop offset="100%" stopColor={gradient[1]} />
          </LinearGradient>
        </Defs>

        {/* Track */}
        <Circle cx={cx} cy={cy} r={r} stroke="rgba(174, 220, 210, 0.10)" strokeWidth={thickness} fill="none" />

        {/* Progress arc */}
        <ACircle
          cx={cx}
          cy={cy}
          r={r}
          stroke={`url(#${arcId})`}
          strokeWidth={thickness}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circ}
          animatedProps={arcProps}
        />

        {/* Comet endpoint: soft glow + bright core */}
        <ACircle r={thickness * 1.05} fill={glow} fillOpacity={0.3} animatedProps={endpoint} />
        <ACircle r={thickness * 0.4} fill="#FFFFFF" animatedProps={endpoint} />
      </Svg>

      {/* Center content (upright) */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.center}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
