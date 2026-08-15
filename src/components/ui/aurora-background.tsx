import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePalette } from '@/hooks/use-palette';

type Blob = {
  color: string;
  /** Fractions of the screen: horizontal, vertical, and radius. */
  x: number;
  y: number;
  r: number;
  /** Drift distance and duration for the slow float. */
  drift: number;
  duration: number;
};

/** Blob positions/motion; the colors come from the active palette. */
const POSITIONS: Omit<Blob, 'color'>[] = [
  { x: 0.12, y: 0.04, r: 0.58, drift: 22, duration: 9000 },
  { x: 0.94, y: 0.14, r: 0.44, drift: -26, duration: 11000 },
  { x: 0.74, y: 0.84, r: 0.5, drift: 18, duration: 13000 },
  { x: 0.18, y: 0.72, r: 0.42, drift: -18, duration: 10500 },
  { x: 0.52, y: 0.44, r: 0.36, drift: 15, duration: 15000 },
];

/**
 * Soft, slowly drifting color washes behind the page. Each blob is an SVG
 * radial gradient fading to transparent, which gives genuinely soft edges
 * without needing a blur backdrop.
 */
export function AuroraBackground() {
  const { width, height } = useWindowDimensions();
  const scheme = useColorScheme();
  const palette = usePalette();
  // Keep it a whisper in light mode; a touch stronger against a black page.
  const opacity = scheme === 'dark' ? 0.5 : 0.32;

  return (
    <View style={styles.wrap} pointerEvents="none">
      {POSITIONS.map((pos, i) => (
        <DriftingBlob
          key={i}
          blob={{ ...pos, color: palette.aurora[i % palette.aurora.length] }}
          width={width}
          height={height}
          opacity={opacity}
        />
      ))}
    </View>
  );
}

function DriftingBlob({
  blob,
  width,
  height,
  opacity,
}: {
  blob: Blob;
  width: number;
  height: number;
  opacity: number;
}) {
  const offset = useSharedValue(0);

  useEffect(() => {
    offset.value = withRepeat(
      withSequence(
        withTiming(blob.drift, { duration: blob.duration }),
        withTiming(0, { duration: blob.duration }),
      ),
      -1,
      false,
    );
  }, [blob.drift, blob.duration, offset]);

  const style = useAnimatedStyle(() => {
    const breath = 1 + Math.abs(offset.value / blob.drift) * 0.1;
    return {
      transform: [
        { translateY: offset.value },
        { translateX: offset.value * 0.6 },
        { scale: breath },
      ],
    };
  });

  const size = Math.max(width, height) * blob.r * 2;
  const id = `grad-${blob.color.replace('#', '')}`;

  return (
    <Animated.View
      style={[
        styles.blob,
        { left: width * blob.x - size / 2, top: height * blob.y - size / 2, opacity },
        style,
      ]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={blob.color} stopOpacity={1} />
            <Stop offset="100%" stopColor={blob.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Bleeds past the screen's horizontal padding so the wash reaches the edges.
  wrap: { position: 'absolute', top: 0, bottom: 0, left: -64, right: -64, overflow: 'hidden' },
  blob: { position: 'absolute' },
});
