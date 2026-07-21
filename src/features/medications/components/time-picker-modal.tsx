import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { formatTime12 } from '@/features/medications/schedule';
import { useTheme } from '@/hooks/use-theme';

/** Common dosing times, offered as one-tap presets. */
const PRESETS: { label: string; time: string }[] = [
  { label: 'Morning', time: '08:00' },
  { label: 'Noon', time: '12:00' },
  { label: 'Evening', time: '18:00' },
  { label: 'Bedtime', time: '21:00' },
];

type Props = {
  visible: boolean;
  onCancel: () => void;
  onConfirm: (time: string) => void;
};

/**
 * A cross-platform time picker. The community native picker has no web
 * implementation, and large steppers are easier to hit than a spinner, so this
 * is a plain-React control that behaves identically on every platform.
 */
export function TimePickerModal({ visible, onCancel, onConfirm }: Props) {
  const theme = useTheme();
  const [hour, setHour] = useState(8); // 0–23
  const [minute, setMinute] = useState(0); // 0–55, in 5s

  // Reset to a sensible default each time the sheet opens.
  useEffect(() => {
    if (visible) {
      setHour(8);
      setMinute(0);
    }
  }, [visible]);

  const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const isPm = hour >= 12;

  const stepHour = (delta: number) => setHour((h) => (h + delta + 24) % 24);
  const stepMinute = (delta: number) =>
    setMinute((m) => {
      const next = m + delta;
      if (next >= 60) {
        stepHour(1);
        return 0;
      }
      if (next < 0) {
        stepHour(-1);
        return 55;
      }
      return next;
    });
  const toggleMeridiem = () => setHour((h) => (h + 12) % 24);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        {/* Stop taps inside the sheet from dismissing it. */}
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
          onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.title, { color: theme.text }]}>Add a dose time</Text>

          <Text style={[styles.preview, { color: theme.tint }]}>{formatTime12(value)}</Text>

          <View style={styles.steppers}>
            <Stepper
              label="Hour"
              onUp={() => stepHour(1)}
              onDown={() => stepHour(-1)}
              display={String(((hour + 11) % 12) + 1)}
            />
            <Stepper
              label="Minute"
              onUp={() => stepMinute(5)}
              onDown={() => stepMinute(-5)}
              display={String(minute).padStart(2, '0')}
            />
            <View style={styles.meridiemWrap}>
              <Text style={[styles.stepperLabel, { color: theme.textSecondary }]}>AM/PM</Text>
              <Pressable
                onPress={toggleMeridiem}
                accessibilityRole="button"
                style={[styles.meridiem, { backgroundColor: theme.tint }]}>
                <Text style={styles.meridiemText}>{isPm ? 'PM' : 'AM'}</Text>
              </Pressable>
            </View>
          </View>

          <Text style={[styles.presetLabel, { color: theme.textSecondary }]}>Quick pick</Text>
          <View style={styles.presets}>
            {PRESETS.map((p) => (
              <Pressable
                key={p.time}
                onPress={() => onConfirm(p.time)}
                accessibilityRole="button"
                style={[styles.preset, { borderColor: theme.border, backgroundColor: theme.background }]}>
                <Text style={[styles.presetName, { color: theme.text }]}>{p.label}</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                  {formatTime12(p.time)}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.actions}>
            <View style={styles.flex}>
              <Button title="Cancel" variant="secondary" onPress={onCancel} />
            </View>
            <View style={styles.flex}>
              <Button title="Add time" onPress={() => onConfirm(value)} />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** A labelled up/down control with a large, readable value between the arrows. */
function Stepper({
  label,
  display,
  onUp,
  onDown,
}: {
  label: string;
  display: string;
  onUp: () => void;
  onDown: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.stepper}>
      <Text style={[styles.stepperLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Pressable onPress={onUp} accessibilityRole="button" hitSlop={8} style={styles.arrow}>
        <Ionicons name="chevron-up" size={26} color={theme.tint} />
      </Pressable>
      <Text style={[styles.stepperValue, { color: theme.text }]}>{display}</Text>
      <Pressable onPress={onDown} accessibilityRole="button" hitSlop={8} style={styles.arrow}>
        <Ionicons name="chevron-down" size={26} color={theme.tint} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 22,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  preview: { fontSize: 34, fontWeight: '800', textAlign: 'center' },
  steppers: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.four },
  stepper: { alignItems: 'center', gap: Spacing.one, minWidth: 64 },
  stepperLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  stepperValue: { fontSize: 30, fontWeight: '800', minWidth: 44, textAlign: 'center' },
  arrow: { padding: Spacing.one },
  meridiemWrap: { alignItems: 'center', gap: Spacing.two },
  meridiem: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: 12 },
  meridiemText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  presetLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  preset: {
    flexGrow: 1,
    minWidth: 88,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: Spacing.two,
  },
  presetName: { fontSize: 14, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.two },
  flex: { flex: 1 },
});
