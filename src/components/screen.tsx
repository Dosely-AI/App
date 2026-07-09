import {
  type StyleProp,
  StyleSheet,
  View,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { type Edge, SafeAreaView } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScreenProps = ViewProps & {
  /** Safe-area edges to inset. Defaults to top (tab bar handles the bottom). */
  edges?: readonly Edge[];
  contentStyle?: StyleProp<ViewStyle>;
};

/**
 * Standard screen wrapper: themed background, safe-area insets, and content
 * centered to a max width so it reads well on tablets and web later.
 */
export function Screen({
  children,
  edges = ['top'],
  style,
  contentStyle,
  ...rest
}: ScreenProps) {
  const theme = useTheme();

  return (
    <SafeAreaView
      edges={edges}
      style={[styles.safe, { backgroundColor: theme.background }, style]}
      {...rest}>
      <View style={[styles.content, contentStyle]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
  },
});
