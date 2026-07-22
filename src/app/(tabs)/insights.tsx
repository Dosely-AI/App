import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { Disclaimer } from '@/components/disclaimer';
import { Screen } from '@/components/screen';
import { AuroraBackground } from '@/components/ui/aurora-background';
import { Card } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Button } from '@/components/ui/button';
import { Spacing, accentFor } from '@/constants/theme';
import { severityLabel } from '@/features/health/visit-summary';
import {
  computeDaily,
  currentStreak,
  generateTips,
  overall,
  perMed,
  ratingFor,
} from '@/features/adherence/adherence';
import { dateKey, lastNDays, parseDateKey } from '@/features/adherence/dates';
import { upcomingRefills, type MedRefill } from '@/features/refill/refill';
import { type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

const WINDOW = 14;
/** Widest span the daily-trend chart will show, once tracking has run a while. */
const CHART_MAX_DAYS = 30;
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

/** A single day's bar, growing up from the baseline on mount. */
function ChartBar({ pct, color, delay }: { pct: number | null; color: string; delay: number }) {
  const height = useSharedValue(0);

  useEffect(() => {
    height.value = withDelay(delay, withTiming(pct ?? 0, { duration: 600 }));
  }, [pct, delay, height]);

  const style = useAnimatedStyle(() => ({ height: `${height.value}%` }));

  return (
    <View style={styles.barTrack}>
      <Animated.View style={[styles.barFill, { backgroundColor: color }, style]} />
    </View>
  );
}

/** One medication's refill status: name on the left, days-left badge on the right. */
function RefillRow({ refill, theme }: { refill: MedRefill; theme: Theme }) {
  const { med, status } = refill;
  const color =
    status.level === 'out'
      ? theme.danger
      : status.level === 'soon'
        ? theme.warning
        : status.level === 'ok'
          ? theme.success
          : theme.textSecondary;
  const right =
    status.level === 'out'
      ? 'Refill now'
      : status.level === 'unknown'
        ? 'As needed'
        : `${status.daysLeft}d · ≈${status.remaining} left`;
  return (
    <View style={styles.medHeader}>
      <Text style={[styles.medName, { color: theme.text }]} numberOfLines={1}>
        {med.name}
      </Text>
      <Text style={{ color, fontWeight: '600' }}>{right}</Text>
    </View>
  );
}

export default function InsightsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const medications = useAppStore((s) => s.medications);
  const logs = useAppStore((s) => s.logs);
  const symptoms = useAppStore((s) => s.symptoms);

  const data = useMemo(() => {
    const days = lastNDays(WINDOW);
    const daily = computeDaily(medications, logs, days);
    return {
      totals: overall(daily),
      byMed: perMed(medications, logs, days),
      streak: currentStreak(medications, logs, days),
      tips: generateTips(medications, logs, days),
      refills: upcomingRefills(medications),
    };
  }, [medications, logs]);

  // The trend chart begins the day the first medication was added, not a fixed
  // window back — so it never shows empty "pre-tracking" days. Capped so a
  // long-time user still gets a readable recent view.
  const chartDaily = useMemo(() => {
    if (medications.length === 0) return computeDaily(medications, logs, lastNDays(WINDOW));
    const today = new Date();
    let earliest = dateKey(today);
    for (const m of medications) {
      const k = dateKey(new Date(m.createdAt));
      if (k < earliest) earliest = k;
    }
    const span = Math.round((today.getTime() - parseDateKey(earliest).getTime()) / 86_400_000) + 1;
    return computeDaily(medications, logs, lastNDays(Math.min(Math.max(span, 1), CHART_MAX_DAYS)));
  }, [medications, logs]);

  if (medications.length === 0) {
    return (
      <Screen>
        <Animated.View entering={FadeInDown.duration(400)} style={styles.center}>
          <Ionicons name="stats-chart-outline" size={48} color={theme.textSecondary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No insights yet</Text>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Add a medication and start logging doses to see your adherence rating, trends, and tips.
          </Text>
        </Animated.View>
      </Screen>
    );
  }

  const rating = ratingFor(data.totals.pct);
  const ratingColor =
    rating.tone === 'success'
      ? theme.success
      : rating.tone === 'warning'
        ? theme.warning
        : theme.danger;

  // A gradient that shifts hue with the score, so the ring itself reads as a grade.
  const ringGradient: readonly [string, string] =
    data.totals.pct === null
      ? [theme.border, theme.border]
      : data.totals.pct >= 90
        ? ['#4FC97C', '#12B5A5']
        : data.totals.pct >= 50
          ? ['#FFAA61', '#E75A8A']
          : ['#FF7BA6', '#D14372'];

  return (
    <Screen>
      <AuroraBackground />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Rating */}
        <Animated.View entering={FadeInDown.duration(450)}>
          <Card>
            <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>
              Adherence · last {WINDOW} days
            </Text>
            <View style={styles.ringWrap}>
              <ProgressRing pct={data.totals.pct} color={ratingColor} gradient={ringGradient}>
                <Text style={[styles.ringPct, { color: ratingColor }]}>
                  {data.totals.pct === null ? '—' : `${data.totals.pct}%`}
                </Text>
                <Text style={[styles.ringLabel, { color: theme.textSecondary }]}>
                  {rating.label}
                </Text>
              </ProgressRing>
            </View>
            <Text style={[styles.blurb, { color: theme.textSecondary }]}>{rating.blurb}</Text>
            {data.streak > 0 ? (
              <View style={[styles.streakPill, { backgroundColor: theme.background }]}>
                <Text style={[styles.streak, { color: theme.text }]}>
                  🔥 {data.streak}-day perfect streak
                </Text>
              </View>
            ) : null}
          </Card>
        </Animated.View>

        {/* Refills */}
        {data.refills.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(450).delay(80)}>
            <Card>
              <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>Refills</Text>
              <View style={{ gap: Spacing.three, marginTop: Spacing.two }}>
                {data.refills.map((r) => (
                  <RefillRow key={r.med.id} refill={r} theme={theme} />
                ))}
              </View>
            </Card>
          </Animated.View>
        ) : null}

        {/* Daily trend */}
        <Animated.View entering={FadeInDown.duration(450).delay(160)}>
          <Card>
            <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>Daily adherence</Text>
            <View style={styles.chart}>
              {chartDaily.map((d, i) => (
                <ChartBar key={d.date} pct={d.pct} color={toneColor(theme, d.pct)} delay={i * 40} />
              ))}
            </View>
            <View style={styles.axis}>
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                {shortDay(chartDaily[0].date)}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                {shortDay(chartDaily[chartDaily.length - 1].date)}
              </Text>
            </View>
          </Card>
        </Animated.View>

        {/* Per medication */}
        <Animated.View entering={FadeInDown.duration(450).delay(240)}>
          <Card>
            <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>By medication</Text>
            <View style={{ gap: Spacing.three, marginTop: Spacing.two }}>
              {data.byMed.map((m, i) => (
                <View key={m.medId} style={{ gap: Spacing.one }}>
                  <View style={styles.medHeader}>
                    <View style={styles.medLabel}>
                      <View style={[styles.dot, { backgroundColor: accentFor(m.medId).solid }]} />
                      <Text style={[styles.medName, { color: theme.text }]} numberOfLines={1}>
                        {m.name}
                      </Text>
                    </View>
                    <Text style={{ color: theme.textSecondary }}>
                      {m.pct === null ? '—' : `${m.pct}%`}
                    </Text>
                  </View>
                  <ProgressBar pct={m.pct} color={accentFor(m.medId).solid} delay={300 + i * 90} />
                </View>
              ))}
            </View>
          </Card>
        </Animated.View>

        {/* Tips */}
        <Animated.View entering={FadeInDown.duration(450).delay(320)}>
          <Card>
            <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>Tips for you</Text>
            <View style={{ gap: Spacing.three, marginTop: Spacing.two }}>
              {data.tips.map((tip, i) => (
                <View key={i} style={styles.tipRow}>
                  <Ionicons
                    name="bulb-outline"
                    size={18}
                    color={theme.tint}
                    style={{ marginTop: 1 }}
                  />
                  <Text style={[styles.tipText, { color: theme.text }]}>{tip}</Text>
                </View>
              ))}
            </View>
          </Card>
        </Animated.View>

        {/* How you're feeling — symptom journal */}
        <Animated.View entering={FadeInDown.duration(450).delay(400)}>
          <Card>
            <View style={styles.rowBetween}>
              <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>How you’re feeling</Text>
              <Pressable onPress={() => router.push('/journal')} hitSlop={8}>
                <Text style={[styles.link, { color: theme.tint }]}>Log</Text>
              </Pressable>
            </View>
            {symptoms.length === 0 ? (
              <Text style={[styles.blurb, { color: theme.textSecondary, textAlign: 'left', marginTop: Spacing.two }]}>
                Track symptoms over time to spot patterns and share them with your doctor.
              </Text>
            ) : (
              <View style={{ gap: Spacing.two, marginTop: Spacing.two }}>
                {symptoms.slice(0, 3).map((s) => (
                  <View key={s.id} style={styles.medHeader}>
                    <Text style={[styles.medName, { color: theme.text }]} numberOfLines={1}>
                      {s.note || 'Symptom'}
                    </Text>
                    <Text style={{ color: theme.textSecondary }}>{severityLabel(s.severity)}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>
        </Animated.View>

        {/* Doctor visit summary */}
        <Animated.View entering={FadeInDown.duration(450).delay(460)}>
          <Button title="📄  Prepare for a doctor visit" variant="secondary" onPress={() => router.push('/visit-summary')} />
        </Animated.View>

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
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { fontSize: 14, fontWeight: '700' },
  ringWrap: { alignItems: 'center', marginVertical: Spacing.four },
  ringPct: { fontSize: 40, fontWeight: '800' },
  ringLabel: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  blurb: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  streakPill: {
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 999,
    marginTop: Spacing.three,
  },
  streak: { fontSize: 15, fontWeight: '600' },
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
  medHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  medLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  medName: { fontSize: 15, fontWeight: '600', flex: 1, marginRight: Spacing.two },
  tipRow: { flexDirection: 'row', gap: Spacing.two },
  tipText: { flex: 1, fontSize: 14, lineHeight: 20 },
});
