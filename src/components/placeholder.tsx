import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type PlaceholderProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
};

/** Lightweight "coming soon" body used by screens not yet implemented. */
export function Placeholder({ icon, title, subtitle }: PlaceholderProps) {
  const theme = useTheme();

  return (
    <Screen>
      <View style={styles.center}>
        <Ionicons name={icon} size={48} color={theme.textSecondary} />
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{subtitle}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
});
