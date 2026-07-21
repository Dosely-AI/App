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

const BLOBS: Blob[] = [
  { color: '#6D8DFF', x: 0.15, y: 0.08, r: 0.55, drift: 18, duration: 9000 },
  { color: '#8C5BF6', x: 0.9, y: 0.22, r: 0.45, drift: -22, duration: 11000 },
  { color: '#12B5A5', x: 0.7, y: 0.85, r: 0.5, drift: 16, duration: 13000 },
];

/**
 * Soft, slowly drifting color washes behind the page. Each blob is an SVG
 * radial gradient fading to transparent, which gives genuinely soft edges
 * without needing a blur backdrop.
 */
export function AuroraBackground() {
  const { width, height } = useWindowDimensions();
  const scheme = useColorScheme();
  // Keep it a whisper in light mode; a touch stronger against a black page.
  const opacity = scheme === 'dark' ? 0.5 : 0.32;

  return (
    <View style={styles.wrap} pointerEvents="none">
      {BLOBS.map((blob, i) => (
        <DriftingBlob key={i} blob={blob} width={width} height={height} opacity={opacity} />
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

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }, { translateX: offset.value * 0.6 }],
  }));

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
