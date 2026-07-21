import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';

type Props = {
  /** 0–100. Null renders an empty track. */
  pct: number | null;
  color: string;
  /** Bar thickness. */
  height?: number;
  /** Stagger the fill so a list of bars cascades. */
  delay?: number;
};

/** A rounded progress track whose fill animates out from zero on mount. */
export function ProgressBar({ pct, color, height = 8, delay = 0 }: Props) {
  const theme = useTheme();
  const target = Math.max(0, Math.min(100, pct ?? 0));
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withDelay(delay, withTiming(target, { duration: 700 }));
  }, [target, delay, width]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  return (
    <View style={[styles.track, { height, borderRadius: height / 2, backgroundColor: theme.background }]}>
      <Animated.View
        style={[styles.fill, { backgroundColor: color, borderRadius: height / 2 }, fillStyle]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', overflow: 'hidden' },
  fill: { height: '100%' },
});
