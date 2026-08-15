import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Disclaimer } from '@/components/disclaimer';
import { Screen } from '@/components/screen';
import { Card } from '@/components/ui/card';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { parseDateKey } from '@/features/adherence/dates';
import {
  type DailyTiming,
  dailyTimings,
  doseTimings,
  timingInsight,
  timingStats,
  windowDays,
} from '@/features/timing/timing';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

type Win = 'week' | 'month' | 'all';
type Theme = Record<ThemeColor, string>;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DELAY_CAP = 120; // minutes mapped to a full-height bar

function shortDay(key: string): string {
  const d = parseDateKey(key);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function delayColor(theme: Theme, avg: number | null): string {
  if (avg === null) return theme.border;
  if (avg <= 30) return theme.success;
  if (avg <= 90) return theme.warning;
  return theme.danger;
}

export default function TimingScreen() {
  const theme = useTheme();
  const medications = useAppStore((s) => s.medications);
  const logs = useAppStore((s) => s.logs);
  const [win, setWin] = useState<Win>('week');

  const data = useMemo(() => {
    const now = new Date();
    const days = windowDays(win, medications, now);
    const timings = doseTimings(medications, logs, days, now);
    return {
      days,
      daily: dailyTimings(timings, days),
      stats: timingStats(timings),
    };
  }, [win, medications, logs]);

  if (medications.length === 0) {
    return (
      <Screen edges={['bottom']}>
        <View style={styles.center}>
          <Ionicons name="time-outline" size={48} color={theme.textSecondary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No timing data yet</Text>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Add a medication and log a few doses to see how promptly you take them over time.
          </Text>
        </View>
      </Screen>
    );
  }

  const { stats, daily } = data;
  const insight = timingInsight(stats);
  const insightColor =
    insight.tone === 'success'
      ? theme.success
      : insight.tone === 'danger'
        ? theme.danger
        : insight.tone === 'warning'
          ? theme.warning
          : theme.textSecondary;

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Window selector */}
        <View style={[styles.segment, { backgroundColor: theme.backgroundElement }]}>
          {(['week', 'month', 'all'] as Win[]).map((w) => {
            const active = win === w;
            return (
              <Pressable
                key={w}
                onPress={() => setWin(w)}
                style={[styles.segBtn, active && { backgroundColor: theme.tint }]}>
                <Text style={[styles.segText, { color: active ? theme.onTint : theme.textSecondary }]}>
                  {w === 'week' ? 'Week' : w === 'month' ? 'Month' : 'All time'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Headline stats */}
        <View style={styles.statRow}>
          <StatTile
            theme={theme}
            value={stats.onTimeRate === null ? '—' : `${stats.onTimeRate}%`}
            label="On time"
            color={theme.success}
          />
          <StatTile
            theme={theme}
            value={stats.avgDelayMin === null ? '—' : `${stats.avgDelayMin}m`}
            label="Avg delay"
            color={theme.warning}
          />
          <StatTile
            theme={theme}
            value={String(stats.missed)}
            label="Missed"
            color={theme.danger}
          />
        </View>

        {/* Delay graph */}
        <Card>
          <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>
            Average delay per day
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chart}>
            {daily.map((d) => (
              <Bar key={d.date} theme={theme} d={d} />
            ))}
          </ScrollView>
          <View style={styles.axis}>
            <Text style={[styles.axisText, { color: theme.textSecondary }]}>
              {shortDay(daily[0].date)}
            </Text>
            <Text style={[styles.axisText, { color: theme.textSecondary }]}>
              {shortDay(daily[daily.length - 1].date)}
            </Text>
          </View>
          <View style={styles.legend}>
            <LegendDot theme={theme} color={theme.success} label="On time" />
            <LegendDot theme={theme} color={theme.warning} label="Late" />
            <LegendDot theme={theme} color={theme.danger} label="Missed" />
          </View>
        </Card>

        {/* Clinical read */}
        <Card>
          <View style={[styles.termChip, { backgroundColor: `${insightColor}22` }]}>
            <Text style={[styles.termText, { color: insightColor }]}>{insight.term}</Text>
          </View>
          <Text style={[styles.insightHead, { color: theme.text }]}>{insight.headline}</Text>
          <Text style={[styles.insightBody, { color: theme.textSecondary }]}>{insight.body}</Text>
        </Card>

        <Disclaimer text="This is general information using common clinical terms — not a diagnosis or medical advice. Discuss any medication concerns with your doctor or pharmacist." />
      </ScrollView>
    </Screen>
  );
}

function StatTile({
  theme,
  value,
  label,
  color,
}: {
  theme: Theme;
  value: string;
  label: string;
  color: string;
}) {
  return (
    <View style={[styles.tile, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <Text style={[styles.tileValue, { color }]}>{value}</Text>
      <Text style={[styles.tileLabel, { color: theme.textSecondary }]}>{label}</Text>
    </View>
  );
}

/** One day's bar: height = average delay; a red line marks days with missed doses. */
function Bar({ theme, d }: { theme: Theme; d: DailyTiming }) {
  const fillPct = d.avgDelayMin === null ? 0 : Math.min(d.avgDelayMin / DELAY_CAP, 1);
  return (
    <View style={styles.barTrack}>
      {d.avgDelayMin !== null ? (
        <View
          style={{
            height: `${Math.max(fillPct * 100, 4)}%`,
            width: '100%',
            borderRadius: 3,
            backgroundColor: delayColor(theme, d.avgDelayMin),
          }}
        />
      ) : null}
      {d.missed > 0 ? (
        <View
          style={[
            styles.missedLine,
            { backgroundColor: theme.danger, height: d.avgDelayMin === null ? '100%' : 5 },
          ]}
        />
      ) : null}
    </View>
  );
}

function LegendDot({ theme, color, label }: { theme: Theme; color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendText, { color: theme.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.four, gap: Spacing.three },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptyText: { fontSize: 15, lineHeight: 21, textAlign: 'center' },

  segment: { flexDirection: 'row', borderRadius: 12, padding: 4, gap: 4 },
  segBtn: { flex: 1, paddingVertical: Spacing.two, borderRadius: 9, alignItems: 'center' },
  segText: { fontSize: 14, fontWeight: '700' },

  statRow: { flexDirection: 'row', gap: Spacing.three },
  tile: { flex: 1, borderWidth: 1, borderRadius: 16, paddingVertical: Spacing.three, alignItems: 'center', gap: 2 },
  tileValue: { fontSize: 24, fontWeight: '800' },
  tileLabel: { fontSize: 12, fontWeight: '700' },

  cardLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  chart: { alignItems: 'flex-end', gap: 4, height: 120, paddingTop: Spacing.three, paddingRight: Spacing.two },
  barTrack: { width: 9, height: 100, justifyContent: 'flex-end', alignItems: 'center' },
  missedLine: { position: 'absolute', top: 0, width: '100%', borderRadius: 3 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.two },
  axisText: { fontSize: 12 },
  legend: { flexDirection: 'row', gap: Spacing.four, marginTop: Spacing.three },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, fontWeight: '600' },

  termChip: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: 4 },
  termText: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  insightHead: { fontSize: 18, fontWeight: '800', marginTop: Spacing.three },
  insightBody: { fontSize: 14, lineHeight: 20, marginTop: Spacing.two },
});
