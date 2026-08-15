import { Ionicons } from '@expo/vector-icons';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const WEB_GLASS =
  Platform.OS === 'web'
    ? ({ backdropFilter: 'blur(16px) saturate(1.4)', WebkitBackdropFilter: 'blur(16px) saturate(1.4)' } as object)
    : null;

/** A floating frosted-glass stat pill: a tinted icon, a value, and a label. */
export function StatChip({
  icon,
  tint,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  value: string;
  label: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.chip, WEB_GLASS as object]}>
      <View style={[styles.icon, { backgroundColor: `${tint}22` }]}>
        <Ionicons name={icon} size={15} color={tint} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.value, { color: theme.text }]} numberOfLines={1}>
          {value}
        </Text>
        <Text style={[styles.label, { color: theme.textSecondary }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(132, 240, 208, 0.14)',
    backgroundColor: 'rgba(16, 34, 57, 0.6)',
  },
  flex: { flex: 1 },
  icon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  label: { fontSize: 11, fontWeight: '600', marginTop: 1 },
});
