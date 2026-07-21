import { useEffect, useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  /** 0–100. Null draws only the empty track. */
  pct: number | null;
  color: string;
  /** Optional two-stop gradient for the arc; falls back to `color`. */
  gradient?: readonly [string, string];
  size?: number;
  thickness?: number;
  /** Rendered in the middle of the ring (the score, a label, etc.). */
  children?: React.ReactNode;
};

/**
 * Circular progress indicator. The arc sweeps from empty to `pct` on mount by
 * animating the stroke dash offset, which keeps the work on the UI thread.
 */
export function ProgressRing({
  pct,
  color,
  gradient,
  size = 168,
  thickness = 14,
  children,
}: Props) {
  // Unique per instance so multiple rings on screen never share a gradient def.
  // useId() contains colons, which aren't valid in an SVG id / url() reference.
  const gradId = `ring${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const theme = useTheme();
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const target = Math.max(0, Math.min(100, pct ?? 0)) / 100;

  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(150, withTiming(target, { duration: 900 }));
  }, [target, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View style={{ width: size, height: size }}>
      {/* Rotated so the arc starts at 12 o'clock instead of 3 o'clock. */}
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        {gradient ? (
          <Defs>
            <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor={gradient[0]} />
              <Stop offset="100%" stopColor={gradient[1]} />
            </LinearGradient>
          </Defs>
        ) : null}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.background}
          strokeWidth={thickness}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={gradient ? `url(#${gradId})` : color}
          strokeWidth={thickness}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
        />
      </Svg>
      <View style={styles.center}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
