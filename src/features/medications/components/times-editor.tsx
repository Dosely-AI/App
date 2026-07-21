import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { formatTime12, sortTimes } from '@/features/medications/schedule';
import { useTheme } from '@/hooks/use-theme';

import { TimePickerModal } from './time-picker-modal';

type Props = {
  value: string[];
  onChange: (times: string[]) => void;
  error?: string;
};

/** Add/remove the clock times a medication is taken each day. */
export function TimesEditor({ value, onChange, error }: Props) {
  const theme = useTheme();
  const [showPicker, setShowPicker] = useState(false);

  const times = sortTimes(value);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>Times</Text>

      <View style={styles.chips}>
        {times.map((t) => (
          <Pressable
            key={t}
            onPress={() => onChange(times.filter((x) => x !== t))}
            style={[styles.chip, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Text style={{ color: theme.text }}>{formatTime12(t)}</Text>
            <Ionicons name="close" size={16} color={theme.textSecondary} />
          </Pressable>
        ))}

        <Pressable
          onPress={() => setShowPicker(true)}
          style={[styles.chip, { borderColor: theme.tint }]}>
          <Ionicons name="add" size={16} color={theme.tint} />
          <Text style={{ color: theme.tint, fontWeight: '600' }}>Add time</Text>
        </Pressable>
      </View>

      {error ? <Text style={{ color: theme.danger, fontSize: 13 }}>{error}</Text> : null}

      <TimePickerModal
        visible={showPicker}
        onCancel={() => setShowPicker(false)}
        onConfirm={(next) => {
          setShowPicker(false);
          if (!times.includes(next)) onChange(sortTimes([...times, next]));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  label: { fontSize: 14, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
});
