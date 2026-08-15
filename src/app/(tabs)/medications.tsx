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
import { describeSchedule } from '@/features/medications/schedule';
import { needsRefillAttention, refillStatus, type RefillStatus } from '@/features/refill/refill';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import type { Medication } from '@/store/types';

export default function MedicationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const medications = useAppStore((s) => s.medications);
  const refillsDue = medications.filter((m) => needsRefillAttention(refillStatus(m))).length;

  return (
    <Screen>
      <AuroraBackground />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Animated.View entering={FadeInDown.duration(520)} style={styles.header}>
          <Text style={[styles.eyebrow, { color: theme.tint }]}>YOUR MEDICATIONS</Text>
          <Text style={[styles.title, { color: theme.text }]}>
            {medications.length} {medications.length === 1 ? 'medication' : 'medications'}
          </Text>
          {refillsDue > 0 ? (
            <Text style={[styles.sub, { color: theme.warning }]}>
              {refillsDue} need{refillsDue === 1 ? 's' : ''} a refill soon
            </Text>
          ) : medications.length > 0 ? (
            <Text style={[styles.sub, { color: theme.textSecondary }]}>All stocked up</Text>
          ) : null}
        </Animated.View>

        {/* Actions */}
        <Animated.View entering={FadeInDown.duration(480).delay(80)} style={styles.actions}>
          <View style={styles.flex}>
            <Button title="⚡  Scan" onPress={() => router.push('/medication/scan')} />
          </View>
          <View style={styles.flex}>
            <Button title="＋  Add by hand" variant="secondary" onPress={() => router.push('/medication/new')} />
          </View>
        </Animated.View>

        {medications.length >= 2 ? (
          <Animated.View entering={FadeInDown.duration(480).delay(120)}>
            <Button
              title="⚠️  Check interactions"
              variant="secondary"
              onPress={() => router.push('/interactions')}
            />
          </Animated.View>
        ) : null}

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
          medications.map((med, i) => (
            <MedCard key={med.id} med={med} index={i} onPress={() => router.push(`/medication/${med.id}`)} />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

/** Compact refill pill shown only when a medication needs attention. */
function refillPill(status: RefillStatus): { text: string; color: string } | null {
  if (status.level === 'out') return { text: 'Refill', color: '#FF6B6B' };
  if (status.level === 'soon') return { text: `${status.daysLeft}d left`, color: '#F2B84B' };
  return null;
}

function MedCard({ med, index, onPress }: { med: Medication; index: number; onPress: () => void }) {
  const theme = useTheme();
  const accent = accentFor(med.id);
  const subtitle = [med.strength, med.form].filter(Boolean).join(' · ');
  const pill = refillPill(refillStatus(med));

  return (
    <Animated.View entering={FadeInDown.duration(380).delay(160 + index * 60)}>
      <TiltPress onPress={onPress} haptic>
        <Card style={styles.row}>
          <View style={[styles.spine, { backgroundColor: accent.solid }]} />
          <View style={[styles.avatar, { backgroundColor: accent.solid, shadowColor: accent.solid }]}>
            <Text style={styles.avatarText}>{med.name.trim().charAt(0).toUpperCase() || '?'}</Text>
          </View>
          <View style={styles.rowText}>
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
              {med.name}
            </Text>
            {subtitle ? (
              <Text style={{ color: theme.textSecondary, fontSize: 13 }} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
            <Text style={[styles.schedule, { color: accent.solid }]} numberOfLines={1}>
              {describeSchedule(med)}
            </Text>
          </View>
          {pill ? (
            <View style={[styles.pill, { borderColor: `${pill.color}55`, backgroundColor: `${pill.color}1A` }]}>
              <Text style={[styles.pillText, { color: pill.color }]}>{pill.text}</Text>
            </View>
          ) : (
            <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
          )}
        </Card>
      </TiltPress>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.four, gap: Spacing.three },
  header: { marginBottom: Spacing.one },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.4 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6, marginTop: Spacing.one },
  sub: { fontSize: 14, fontWeight: '600', marginTop: 2 },

  actions: { flexDirection: 'row', gap: Spacing.three },
  flex: { flex: 1 },

  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingLeft: Spacing.four, overflow: 'hidden' },
  spine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.5,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 0 },
  },
  avatarText: { color: '#04231C', fontSize: 18, fontWeight: '800' },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: 17, fontWeight: '700' },
  schedule: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: 5 },
  pillText: { fontSize: 12, fontWeight: '800' },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: Spacing.two },
  emptyText: { fontSize: 15, lineHeight: 21 },
});
