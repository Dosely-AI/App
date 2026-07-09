import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Disclaimer } from '@/components/disclaimer';
import { Screen } from '@/components/screen';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import { expectedSlots } from '@/features/adherence/adherence';
import { dateKey } from '@/features/adherence/dates';
import { formatTime12 } from '@/features/medications/schedule';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

type DoseItem = { medId: string; name: string; time: string; taken: boolean };

export default function TodayScreen() {
  const theme = useTheme();
  const medications = useAppStore((s) => s.medications);
  const logs = useAppStore((s) => s.logs);
  const logDose = useAppStore((s) => s.logDose);
  const unlogDose = useAppStore((s) => s.unlogDose);

  const today = dateKey(new Date());

  const items = useMemo<DoseItem[]>(() => {
    const out: DoseItem[] = [];
    for (const med of medications) {
      for (const time of expectedSlots(med, today)) {
        out.push({
          medId: med.id,
          name: med.name,
          time,
          taken: logs.some((l) => l.medId === med.id && l.date === today && l.time === time),
        });
      }
    }
    return out.sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name));
  }, [medications, logs, today]);

  const takenCount = items.filter((i) => i.taken).length;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {items.length === 0 ? (
          <Card>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>Nothing scheduled today</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              Add a medication in the Meds tab and your daily doses will show up here to check off.
            </Text>
          </Card>
        ) : (
          <>
            <Text style={[styles.summary, { color: theme.textSecondary }]}>
              {takenCount} of {items.length} doses taken today
            </Text>
            {items.map((item) => (
              <Pressable
                key={`${item.medId}-${item.time}`}
                onPress={() =>
                  item.taken
                    ? unlogDose(item.medId, today, item.time)
                    : logDose(item.medId, today, item.time)
                }>
                <Card style={styles.doseRow}>
                  <Ionicons
                    name={item.taken ? 'checkmark-circle' : 'ellipse-outline'}
                    size={28}
                    color={item.taken ? theme.success : theme.textSecondary}
                  />
                  <View style={styles.doseText}>
                    <Text
                      style={[
                        styles.doseName,
                        { color: theme.text },
                        item.taken && styles.doseTakenName,
                      ]}>
                      {item.name}
                    </Text>
                    <Text style={{ color: theme.textSecondary }}>{formatTime12(item.time)}</Text>
                  </View>
                  <Text style={{ color: item.taken ? theme.success : theme.tint, fontWeight: '600' }}>
                    {item.taken ? 'Taken' : 'I took it'}
                  </Text>
                </Card>
              </Pressable>
            ))}
          </>
        )}

        <Disclaimer />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.four, gap: Spacing.three },
  summary: { fontSize: 15 },
  doseRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three },
  doseText: { flex: 1, gap: 2 },
  doseName: { fontSize: 16, fontWeight: '600' },
  doseTakenName: { textDecorationLine: 'line-through' },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: Spacing.two },
  emptyText: { fontSize: 15, lineHeight: 21 },
});
