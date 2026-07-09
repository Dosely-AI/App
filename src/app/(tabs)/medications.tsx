import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import { summarizeSchedule } from '@/features/medications/schedule';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

export default function MedicationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const medications = useAppStore((s) => s.medications);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Button title="＋  Add medication" onPress={() => router.push('/medication/new')} />

        {medications.length === 0 ? (
          <Card>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No medications yet</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              Add the medications you take and how often. DoselyAI will explain what each is for and
              help you stay on track.
            </Text>
          </Card>
        ) : (
          medications.map((med) => {
            const subtitle = [med.strength, med.form].filter(Boolean).join(' · ');
            return (
              <Pressable key={med.id} onPress={() => router.push(`/medication/${med.id}`)}>
                <Card style={styles.row}>
                  <View style={styles.rowText}>
                    <Text style={[styles.name, { color: theme.text }]}>{med.name}</Text>
                    {subtitle ? (
                      <Text style={{ color: theme.textSecondary }}>{subtitle}</Text>
                    ) : null}
                    <Text style={[styles.schedule, { color: theme.tint }]}>
                      {summarizeSchedule(med.times, med.daysOfWeek)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
                </Card>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.four, gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: 17, fontWeight: '700' },
  schedule: { fontSize: 14, marginTop: 2 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: Spacing.two },
  emptyText: { fontSize: 15, lineHeight: 21 },
});
