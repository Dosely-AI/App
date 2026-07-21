import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Screen } from '@/components/screen';
import { AuroraBackground } from '@/components/ui/aurora-background';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TiltPress } from '@/components/ui/tilt-press';
import { Spacing, accentFor } from '@/constants/theme';
import { summarizeSchedule } from '@/features/medications/schedule';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

export default function MedicationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const medications = useAppStore((s) => s.medications);

  return (
    <Screen>
      <AuroraBackground />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.actions}>
          <View style={styles.flex}>
            <Button title="⚡  Scan" onPress={() => router.push('/medication/scan')} />
          </View>
          <View style={styles.flex}>
            <Button
              title="＋  Add by hand"
              variant="secondary"
              onPress={() => router.push('/medication/new')}
            />
          </View>
        </View>

        {medications.length === 0 ? (
          <Animated.View entering={FadeInDown.duration(400)}>
            <Card>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No medications yet</Text>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                Add the medications you take and how often. DoselyAI will explain what each is for
                and help you stay on track.
              </Text>
            </Card>
          </Animated.View>
        ) : (
          medications.map((med, i) => {
            const subtitle = [med.strength, med.form].filter(Boolean).join(' · ');
            const accent = accentFor(med.id);
            return (
              <Animated.View key={med.id} entering={FadeInDown.duration(380).delay(60 + i * 60)}>
                <TiltPress onPress={() => router.push(`/medication/${med.id}`)} haptic>
                  <Card style={styles.row}>
                    <View style={[styles.spine, { backgroundColor: accent.solid }]} />
                    <View style={[styles.avatar, { backgroundColor: accent.solid }]}>
                      <Text style={styles.avatarText}>
                        {med.name.trim().charAt(0).toUpperCase() || '?'}
                      </Text>
                    </View>
                    <View style={styles.rowText}>
                      <Text style={[styles.name, { color: theme.text }]}>{med.name}</Text>
                      {subtitle ? (
                        <Text style={{ color: theme.textSecondary }}>{subtitle}</Text>
                      ) : null}
                      <Text style={[styles.schedule, { color: accent.solid }]}>
                        {summarizeSchedule(med.times, med.daysOfWeek)}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
                  </Card>
                </TiltPress>
              </Animated.View>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.four, gap: Spacing.three },
  actions: { flexDirection: 'row', gap: Spacing.three },
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingLeft: Spacing.four,
    overflow: 'hidden',
  },
  spine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: 17, fontWeight: '700' },
  schedule: { fontSize: 14, marginTop: 2 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: Spacing.two },
  emptyText: { fontSize: 15, lineHeight: 21 },
});
