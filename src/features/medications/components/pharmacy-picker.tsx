import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

type Props = {
  /** Selected pharmacy id, or null for none. */
  value: string | null;
  onChange: (id: string | null) => void;
};

/**
 * Chip selector for the pharmacy that fills a prescription, read from the saved
 * pharmacy list. Shown in the medication form; enables refill requests.
 */
export function PharmacyPicker({ value, onChange }: Props) {
  const theme = useTheme();
  const pharmacies = useAppStore((s) => s.pharmacies);

  if (pharmacies.length === 0) {
    return (
      <View style={styles.wrap}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Pharmacy</Text>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          Add a pharmacy under Settings → Refills to request refills with one tap.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>Pharmacy</Text>
      <View style={styles.chips}>
        <Chip label="None" active={!value} onPress={() => onChange(null)} />
        {pharmacies.map((p) => (
          <Chip key={p.id} label={p.name} active={value === p.id} onPress={() => onChange(p.id)} />
        ))}
      </View>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? theme.tint : theme.backgroundElement,
          borderColor: active ? theme.tint : theme.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <Text style={[styles.chipText, { color: active ? theme.onTint : theme.text }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  label: { fontSize: 14, fontWeight: '600' },
  hint: { fontSize: 13, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
    maxWidth: 220,
  },
  chipText: { fontSize: 15, fontWeight: '600' },
});
