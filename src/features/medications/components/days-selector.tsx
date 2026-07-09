import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

type Props = {
  value: number[];
  onChange: (days: number[]) => void;
};

/** Choose which days a medication is taken. No days selected = every day. */
export function DaysSelector({ value, onChange }: Props) {
  const theme = useTheme();

  const toggle = (day: number) => {
    onChange(value.includes(day) ? value.filter((d) => d !== day) : [...value, day]);
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>
        Days {value.length === 0 ? '(every day)' : ''}
      </Text>
      <View style={styles.row}>
        {DAYS.map((label, day) => {
          const active = value.includes(day);
          return (
            <Pressable
              key={day}
              onPress={() => toggle(day)}
              style={[
                styles.day,
                {
                  backgroundColor: active ? theme.tint : theme.backgroundElement,
                  borderColor: active ? theme.tint : theme.border,
                },
              ]}>
              <Text style={{ color: active ? theme.onTint : theme.text, fontWeight: '600' }}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  label: { fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  day: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
