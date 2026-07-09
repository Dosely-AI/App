import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Disclaimer } from '@/components/disclaimer';
import { Screen } from '@/components/screen';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import {
  computeDaily,
  currentStreak,
  generateTips,
  overall,
  perMed,
  ratingFor,
} from '@/features/adherence/adherence';
import { lastNDays, parseDateKey } from '@/features/adherence/dates';
import { type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

const WINDOW = 14;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Theme = Record<ThemeColor, string>;

function toneColor(theme: Theme, pct: number | null): string {
  if (pct === null) return theme.border;
  if (pct >= 90) return theme.success;
  if (pct >= 50) return theme.warning;
  return theme.danger;
}

function shortDay(key: string): string {
  const d = parseDateKey(key);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export default function InsightsScreen() {
  const theme = useTheme();
  const medications = useAppStore((s) => s.medications);
  const logs = useAppStore((s) => s.logs);

  const data = useMemo(() => {
    const days = lastNDays(WINDOW);
    const daily = computeDaily(medications, logs, days);
    return {
      daily,
      totals: overall(daily),
      byMed: perMed(medications, logs, days),
      streak: currentStreak(medications, logs, days),
      tips: generateTips(medications, logs, days),
    };
  }, [medications, logs]);

  if (medications.length === 0) {
    return (
      <Screen>
        <View style={styles.center}>
          <Ionicons name="stats-chart-outline" size={48} color={theme.textSecondary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No insights yet</Text>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Add a medication and start logging doses to see your adherence rating, trends, and tips.
          </Text>
        </View>
      </Screen>
    );
  }

  const rating = ratingFor(data.totals.pct);
  const ratingColor =
    rating.tone === 'success' ? theme.success : rating.tone === 'warning' ? theme.warning : theme.danger;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Rating */}
        <Card>
          <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>
            Adherence · last {WINDOW} days
          </Text>
          <Text style={[styles.bigPct, { color: ratingColor }]}>
            {data.totals.pct === null ? '—' : `${data.totals.pct}%`}
          </Text>
          <Text style={[styles.ratingLabel, { color: ratingColor }]}>{rating.label}</Text>
          <Text style={[styles.blurb, { color: theme.textSecondary }]}>{rating.blurb}</Text>
          {data.streak > 0 ? (
            <Text style={[styles.streak, { color: theme.text }]}>
              🔥 {data.streak}-day perfect streak
            </Text>
          ) : null}
        </Card>

        {/* Daily trend */}
        <Card>
          <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>Daily adherence</Text>
          <View style={styles.chart}>
            {data.daily.map((d) => (
              <View key={d.date} style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { height: `${d.pct ?? 0}%`, backgroundColor: toneColor(theme, d.pct) },
                  ]}
                />
              </View>
            ))}
          </View>
          <View style={styles.axis}>
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{shortDay(data.daily[0].date)}</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
              {shortDay(data.daily[data.daily.length - 1].date)}
            </Text>
          </View>
        </Card>

        {/* Per medication */}
        <Card>
          <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>By medication</Text>
          <View style={{ gap: Spacing.three, marginTop: Spacing.two }}>
            {data.byMed.map((m) => (
              <View key={m.medId} style={{ gap: Spacing.one }}>
                <View style={styles.medHeader}>
                  <Text style={[styles.medName, { color: theme.text }]} numberOfLines={1}>
                    {m.name}
                  </Text>
                  <Text style={{ color: theme.textSecondary }}>
                    {m.pct === null ? '—' : `${m.pct}%`}
                  </Text>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: theme.background }]}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${m.pct ?? 0}%`, backgroundColor: toneColor(theme, m.pct) },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
        </Card>

        {/* Tips */}
        <Card>
          <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>Tips for you</Text>
          <View style={{ gap: Spacing.three, marginTop: Spacing.two }}>
            {data.tips.map((tip, i) => (
              <View key={i} style={styles.tipRow}>
                <Ionicons name="bulb-outline" size={18} color={theme.tint} style={{ marginTop: 1 }} />
                <Text style={[styles.tipText, { color: theme.text }]}>{tip}</Text>
              </View>
            ))}
          </View>
        </Card>

        <Disclaimer />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.four, gap: Spacing.three },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptyText: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  cardLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  bigPct: { fontSize: 48, fontWeight: '800', marginTop: Spacing.two },
  ratingLabel: { fontSize: 18, fontWeight: '700' },
  blurb: { fontSize: 14, lineHeight: 20, marginTop: Spacing.one },
  streak: { fontSize: 15, fontWeight: '600', marginTop: Spacing.three },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 90,
    gap: 3,
    marginTop: Spacing.three,
  },
  barTrack: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  barFill: { width: '100%', borderRadius: 3, minHeight: 3 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.two },
  medHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  medName: { fontSize: 15, fontWeight: '600', flex: 1, marginRight: Spacing.two },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  tipRow: { flexDirection: 'row', gap: Spacing.two },
  tipText: { flex: 1, fontSize: 14, lineHeight: 20 },
});
