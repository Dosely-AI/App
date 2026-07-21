import * as Haptics from 'expo-haptics';
import { type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

/** Springs tuned to feel responsive without overshooting much. */
const SPRING = { damping: 18, stiffness: 260, mass: 0.6 };

type Props = Omit<PressableProps, 'style' | 'children'> & {
  children: ReactNode;
  /** Fire a light haptic tap on press (native only — no-ops on web). */
  haptic?: boolean;
  /** How far to shrink while held. */
  scaleTo?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * A Pressable that springs slightly inward while held, giving taps a tactile
 * feel. Wraps children in an Animated.View so any content can be used.
 */
export function PressScale({
  children,
  haptic = false,
  scaleTo = 0.97,
  style,
  onPress,
  ...rest
}: Props) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPressIn={() => {
        scale.value = withSpring(scaleTo, SPRING);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, SPRING);
      }}
      onPress={(e) => {
        if (haptic && Platform.OS !== 'web') {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onPress?.(e);
      }}
      {...rest}>
      <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
    </Pressable>
  );
}
