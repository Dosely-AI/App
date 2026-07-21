import * as Haptics from 'expo-haptics';
import { type ReactNode, useState } from 'react';
import {
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const SPRING = { damping: 15, stiffness: 220, mass: 0.6 };
/** Maximum rotation in degrees at the far edge of the card. */
const MAX_TILT = 7;

type Props = Omit<PressableProps, 'style' | 'children'> & {
  children: ReactNode;
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * A pressable surface that tilts in 3D toward the point you touch, using a
 * perspective transform. Pressing near an edge rotates that edge away, which
 * reads as physically pushing a card into the screen.
 */
export function TiltPress({ children, haptic = false, style, onPress, ...rest }: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const rotateX = useSharedValue(0);
  const rotateY = useSharedValue(0);
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 700 },
      { rotateX: `${rotateX.value}deg` },
      { rotateY: `${rotateY.value}deg` },
      { scale: scale.value },
    ],
  }));

  return (
    <Pressable
      onLayout={(e) => setSize(e.nativeEvent.layout)}
      onPressIn={(e) => {
        const { width, height } = size;
        if (width > 0 && height > 0) {
          // Offset of the touch from the card's center, as -0.5..0.5.
          const dx = e.nativeEvent.locationX / width - 0.5;
          const dy = e.nativeEvent.locationY / height - 0.5;
          rotateY.value = withSpring(dx * MAX_TILT * 2, SPRING);
          rotateX.value = withSpring(-dy * MAX_TILT * 2, SPRING);
        }
        scale.value = withSpring(0.975, SPRING);
      }}
      onPressOut={() => {
        rotateX.value = withSpring(0, SPRING);
        rotateY.value = withSpring(0, SPRING);
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
