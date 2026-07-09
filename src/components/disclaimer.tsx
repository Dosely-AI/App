import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const DEFAULT_TEXT =
  'DoselyAI provides general information and helps you track your medications. It is not ' +
  'medical advice and not a substitute for your doctor or pharmacist. Never start, stop, or ' +
  'change a medication based on this app — always consult a healthcare professional.';

/**
 * Standard medical disclaimer. Per the project guardrail, this is shown
 * prominently anywhere the app surfaces medication information or AI output.
 */
export function Disclaimer({ text = DEFAULT_TEXT }: { text?: string }) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.box,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}>
      <Ionicons
        name="information-circle-outline"
        size={18}
        color={theme.textSecondary}
        style={styles.icon}
      />
      <Text style={[styles.text, { color: theme.textSecondary }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
  },
  icon: {
    marginTop: 1,
  },
  text: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});
