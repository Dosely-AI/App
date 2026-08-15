import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Disclaimer } from '@/components/disclaimer';
import { Screen } from '@/components/screen';
import { AuroraBackground } from '@/components/ui/aurora-background';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CountUp } from '@/components/ui/count-up';
import { HeroRing } from '@/components/ui/hero-ring';
import { ProgressBar } from '@/components/ui/progress-bar';
import { StatChip } from '@/components/ui/stat-chip';
import { TrendChart } from '@/components/ui/trend-chart';
import { Spacing, accentFor, type ThemeColor } from '@/constants/theme';
import {
  computeDaily,
  currentStreak,
  generateTips,
  overall,
  perMed,
  ratingFor,
} from '@/features/adherence/adherence';
import { dateKey, lastNDays, parseDateKey } from '@/features/adherence/dates';
import { severityLabel } from '@/features/health/visit-summary';
import { upcomingRefills, type MedRefill } from '@/features/refill/refill';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

const WINDOW = 14;
const CHART_MAX_DAYS = 30;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Theme = Record<ThemeColor, string>;

function shortDay(key: string): string {
  const d = parseDateKey(key);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** Grade-tinted arc gradient + glow for the hero ring. */
function grade(pct: number | null): { gradient: readonly [string, string]; glow: string } {
  if (pct === null) return { gradient: ['#3A5068', '#3A5068'], glow: '#3A5068' };
  if (pct >= 90) return { gradient: ['#2ED6A6', '#8BFFE0'], glow: '#34EBB4' };
  if (pct >= 50) return { gradient: ['#F0A03C', '#FFD37A'], glow: '#F2B84B' };
  return { gradient: ['#FF6B6B', '#FFB3C1'], glow: '#FF6B6B' };
}

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
      <Text style={{ color, fontWeight: '700' }}>{right}</Text>
    </View>
  );
}

export default function InsightsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width: winWidth } = useWindowDimensions();
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
        <AuroraBackground />
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
  const g = grade(data.totals.pct);
  const ringSize = Math.max(190, Math.min(250, Math.round(winWidth * 0.6)));

  return (
    <Screen>
      <AuroraBackground />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Immersive rating hero */}
        <Animated.View entering={FadeInDown.duration(520)} style={styles.hero}>
          <Text style={[styles.eyebrow, { color: theme.tint }]}>ADHERENCE · LAST {WINDOW} DAYS</Text>
          <View style={styles.ringWrap}>
            <HeroRing pct={data.totals.pct ?? 0} size={ringSize} gradient={g.gradient} glow={g.glow}>
              {data.totals.pct === null ? (
                <Text style={[styles.ringPct, { color: theme.textSecondary }]}>—</Text>
              ) : (
                <CountUp value={data.totals.pct} suffix="%" style={[styles.ringPct, { color: theme.text }]} />
              )}
              <Text style={[styles.ringLabel, { color: g.glow }]}>{rating.label}</Text>
            </HeroRing>
          </View>
          <Text style={[styles.blurb, { color: theme.textSecondary }]}>{rating.blurb}</Text>
        </Animated.View>

        {/* Floating stat chips */}
        <Animated.View entering={FadeInDown.duration(460).delay(120)} style={styles.chipsRow}>
          <StatChip icon="flame" tint="#F2B84B" value={data.streak > 0 ? `${data.streak}d` : '—'} label="Streak" />
          <StatChip
            icon="repeat"
            tint={data.refills.some((r) => r.status.level === 'out' || r.status.level === 'soon') ? '#F2B84B' : '#5B9DFF'}
            value={String(data.refills.filter((r) => r.status.level === 'out' || r.status.level === 'soon').length)}
            label="Refills due"
          />
          <StatChip icon="pulse" tint={theme.tint} value={String(symptoms.length)} label="Journal" />
        </Animated.View>

        {/* Glowing daily trend */}
        <Animated.View entering={FadeInDown.duration(460).delay(180)}>
          <Card>
            <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>Daily adherence</Text>
            <View style={{ marginTop: Spacing.two }}>
              <TrendChart values={chartDaily.map((d) => d.pct)} color={theme.tint} />
            </View>
            <View style={styles.axis}>
              <Text style={styles.axisText}>{shortDay(chartDaily[0].date)}</Text>
              <Text style={styles.axisText}>{shortDay(chartDaily[chartDaily.length - 1].date)}</Text>
            </View>
          </Card>
        </Animated.View>

        {/* Per medication */}
        <Animated.View entering={FadeInDown.duration(460).delay(240)}>
          <Card>
            <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>By medication</Text>
            <View style={{ gap: Spacing.three, marginTop: Spacing.three }}>
              {data.byMed.map((m, i) => (
                <View key={m.medId} style={{ gap: Spacing.one }}>
                  <View style={styles.medHeader}>
                    <View style={styles.medLabel}>
                      <View style={[styles.dot, { backgroundColor: accentFor(m.medId).solid }]} />
                      <Text style={[styles.medName, { color: theme.text }]} numberOfLines={1}>
                        {m.name}
                      </Text>
                    </View>
                    <Text style={{ color: theme.textSecondary, fontWeight: '700' }}>
                      {m.pct === null ? '—' : `${m.pct}%`}
                    </Text>
                  </View>
                  <ProgressBar pct={m.pct} color={accentFor(m.medId).solid} delay={300 + i * 90} />
                </View>
              ))}
            </View>
          </Card>
        </Animated.View>

        {/* Refills */}
        {data.refills.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(460).delay(300)}>
            <Card>
              <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>Refills</Text>
              <View style={{ gap: Spacing.three, marginTop: Spacing.three }}>
                {data.refills.map((r) => (
                  <RefillRow key={r.med.id} refill={r} theme={theme} />
                ))}
              </View>
            </Card>
          </Animated.View>
        ) : null}

        {/* Tips */}
        <Animated.View entering={FadeInDown.duration(460).delay(360)}>
          <Card>
            <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>Tips for you</Text>
            <View style={{ gap: Spacing.three, marginTop: Spacing.three }}>
              {data.tips.map((tip, i) => (
                <View key={i} style={styles.tipRow}>
                  <Ionicons name="bulb-outline" size={18} color={theme.tint} style={{ marginTop: 1 }} />
                  <Text style={[styles.tipText, { color: theme.text }]}>{tip}</Text>
                </View>
              ))}
            </View>
          </Card>
        </Animated.View>

        {/* Symptom journal */}
        <Animated.View entering={FadeInDown.duration(460).delay(420)}>
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
              <View style={{ gap: Spacing.two, marginTop: Spacing.three }}>
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

        <Animated.View entering={FadeIn.duration(460).delay(480)}>
          <Button title="📄  Prepare for a doctor visit" variant="secondary" onPress={() => router.push('/visit-summary')} />
        </Animated.View>

        <Disclaimer />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.four, gap: Spacing.three },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, paddingHorizontal: Spacing.four },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptyText: { fontSize: 15, lineHeight: 21, textAlign: 'center' },

  hero: { alignItems: 'center', gap: Spacing.two },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.4 },
  ringWrap: { marginTop: Spacing.two },
  ringPct: { fontSize: 48, fontWeight: '800', letterSpacing: -1.2 },
  ringLabel: { fontSize: 14, fontWeight: '700', marginTop: 0 },
  blurb: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: Spacing.two },

  chipsRow: { flexDirection: 'row', gap: Spacing.three },

  cardLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { fontSize: 14, fontWeight: '700' },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.two },
  axisText: { color: 'rgba(140,160,174,0.9)', fontSize: 12, fontWeight: '600' },
  medHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  medLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  medName: { fontSize: 15, fontWeight: '600', flex: 1, marginRight: Spacing.two },
  tipRow: { flexDirection: 'row', gap: Spacing.two },
  tipText: { flex: 1, fontSize: 14, lineHeight: 20 },
});
