import { Ionicons } from '@expo/vector-icons';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Card } from '@/components/ui/card';
import { Spacing, accentFor } from '@/constants/theme';
import { prnStatus, timeSince } from '@/features/medications/as-needed';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import type { Medication } from '@/store/types';

/** Confirm before logging past the suggested daily maximum. */
function confirmOverLimit(max: number, onConfirm: () => void) {
  const title = 'Daily maximum reached';
  const message =
    `You've already logged the suggested maximum of ${max} dose${max === 1 ? '' : 's'} today. ` +
    'Only take more if your doctor or pharmacist has told you to. Log another dose?';
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Log anyway', style: 'destructive', onPress: onConfirm },
  ]);
}

/** An as-needed medication with a "Log a dose" action, today's count, and a safety cap. */
export function PrnCard({ med, index = 0 }: { med: Medication; index?: number }) {
  const theme = useTheme();
  const logs = useAppStore((s) => s.logs);
  const logPrnDose = useAppStore((s) => s.logPrnDose);
  const undoLastPrnDose = useAppStore((s) => s.undoLastPrnDose);

  const accent = accentFor(med.id);
  const status = prnStatus(med, logs);
  const since = timeSince(status.lastTakenAt);
  const detail = [med.strength, med.form].filter(Boolean).join(' · ');

  const onLog = () => {
    if (status.atLimit && status.max != null) confirmOverLimit(status.max, () => logPrnDose(med.id));
    else logPrnDose(med.id);
  };

  const countLine =
    status.max != null
      ? `${status.count} of ${status.max} today`
      : `${status.count} ${status.count === 1 ? 'dose' : 'doses'} today`;

  return (
    <Animated.View entering={FadeInDown.duration(360).delay(index * 60)}>
      <Card style={styles.card}>
        <View style={[styles.spine, { backgroundColor: accent.solid }]} />

        <View style={styles.head}>
          <View style={styles.flex}>
            <Text style={[styles.name, { color: theme.text }]}>{med.name}</Text>
            {detail ? <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{detail}</Text> : null}
          </View>
          {status.count > 0 ? (
            <Pressable onPress={() => undoLastPrnDose(med.id)} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.undo, { color: theme.textSecondary }]}>Undo</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={[styles.count, { color: status.overLimit ? theme.danger : theme.text }]}>
          {countLine}
          {since ? <Text style={{ color: theme.textSecondary, fontWeight: '400' }}> · last {since}</Text> : null}
        </Text>

        {status.atLimit && status.max != null ? (
          <View style={[styles.warn, { backgroundColor: `${theme.warning}22` }]}>
            <Ionicons name="warning" size={16} color={theme.warning} />
            <Text style={[styles.warnText, { color: theme.warning }]}>
              {status.overLimit ? 'Over the' : 'Reached the'} suggested daily maximum — check with your
              pharmacist before taking more.
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={onLog}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.logBtn,
            { backgroundColor: status.atLimit ? theme.warning : accent.solid, opacity: pressed ? 0.85 : 1 },
          ]}>
          <Ionicons name="add-circle" size={20} color="#FFFFFF" />
          <Text style={styles.logText}>Log a dose</Text>
        </Pressable>
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { paddingLeft: Spacing.four + 5, overflow: 'hidden', gap: Spacing.three },
  spine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  flex: { flex: 1 },
  name: { fontSize: 17, fontWeight: '700' },
  undo: { fontSize: 14, fontWeight: '600' },
  count: { fontSize: 15, fontWeight: '700' },
  warn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three, borderRadius: 12 },
  warnText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  logBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    minHeight: 48,
    borderRadius: 12,
  },
  logText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
