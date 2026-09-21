import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Disclaimer } from '@/components/disclaimer';
import { DoselyLogo } from '@/components/logo';
import { Screen } from '@/components/screen';
import { AuroraBackground } from '@/components/ui/aurora-background';
import { Card } from '@/components/ui/card';
import { CountUp } from '@/components/ui/count-up';
import { HeroRing } from '@/components/ui/hero-ring';
import { FloatingPills } from '@/components/ui/pill-3d';
import { StatChip } from '@/components/ui/stat-chip';
import { TiltPress } from '@/components/ui/tilt-press';
import { Spacing, accentFor } from '@/constants/theme';
import { currentStreak, expectedSlots, missedDoses } from '@/features/adherence/adherence';
import { dateKey, lastNDays } from '@/features/adherence/dates';
import { PrnCard } from '@/features/medications/components/prn-card';
import { isAsNeeded } from '@/features/medications/as-needed';
import { formatTime12 } from '@/features/medications/schedule';
import { needsRefillAttention, refillStatus } from '@/features/refill/refill';
import { usePalette } from '@/hooks/use-palette';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import { QuickDoseButton } from '@/features/doses/quick-dose-button';

type DoseItem = { medId: string; name: string; time: string; taken: boolean; overdue: boolean };

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function encouragement(taken: number, total: number): string {
  if (total === 0) return '';
  if (taken === 0) return "Let's get today started.";
  if (taken === total) return 'All done for today — beautifully kept. 🎉';
  return `${total - taken} more to go — you've got this.`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function TodayScreen() {
  const theme = useTheme();
  const router = useRouter();
  const palette = usePalette();
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const medications = useAppStore((s) => s.medications);
  const logs = useAppStore((s) => s.logs);
  const profile = useAppStore((s) => s.profile);
  const logDose = useAppStore((s) => s.logDose);
  const unlogDose = useAppStore((s) => s.unlogDose);

  const today = dateKey(new Date());
  const now = new Date();

  const items = useMemo<DoseItem[]>(() => {
    const missed = new Set(
      missedDoses(medications, logs, new Date()).map((d) => `${d.medId}|${d.time}`),
    );
    const out: DoseItem[] = [];
    for (const med of medications) {
      for (const time of expectedSlots(med, today)) {
        const taken = logs.some((l) => l.medId === med.id && l.date === today && l.time === time);
        out.push({
          medId: med.id,
          name: med.name,
          time,
          taken,
          overdue: !taken && missed.has(`${med.id}|${time}`),
        });
      }
    }
    return out.sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name));
  }, [medications, logs, today]);

  const streak = useMemo(() => currentStreak(medications, logs, lastNDays(30)), [medications, logs]);
  const prnMeds = useMemo(() => medications.filter(isAsNeeded), [medications]);
  const refillsDue = useMemo(
    () => medications.filter((m) => needsRefillAttention(refillStatus(m))).length,
    [medications],
  );

  const takenCount = items.filter((i) => i.taken).length;
  const pct = items.length === 0 ? 0 : Math.round((takenCount / items.length) * 100);
  const nextDose = items.find((i) => !i.taken);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const ringSize = Math.max(200, Math.min(268, Math.round(winWidth * 0.66)));

  return (
    <Screen>
      <AuroraBackground />
      <FloatingPills scrollY={scrollY} width={winWidth} height={winHeight} />

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        {/* Minimal brand */}
        <Animated.View entering={FadeIn.duration(500)} style={styles.brandRow}>
          <DoselyLogo size={30} />
          <Text style={[styles.brandName, { color: theme.text }]}>
            Dosely <Text style={{ color: theme.tint }}>AI</Text>
          </Text>
        </Animated.View>

        {/* Immersive hero */}
        <Animated.View entering={FadeInDown.duration(560)} style={styles.hero}>
          <Text style={[styles.eyebrow, { color: theme.tint }]}>
            {WEEKDAYS[now.getDay()].toUpperCase()} · {MONTHS[now.getMonth()]} {now.getDate()}
          </Text>
          <Text style={[styles.greeting, { color: theme.text }]}>
            {greeting()}
            {profile?.name ? `, ${profile.name}` : ''}
          </Text>

          {items.length > 0 ? (
            <>
              <View style={styles.ringWrap}>
                <HeroRing pct={pct} size={ringSize} gradient={palette.ring} glow={palette.glow}>
                  <CountUp value={pct} suffix="%" style={[styles.ringPct, { color: theme.text }]} />
                  <Text style={[styles.ringSub, { color: theme.textSecondary }]}>
                    {takenCount} of {items.length} today
                  </Text>
                </HeroRing>
              </View>
              <Text style={[styles.encourage, { color: theme.textSecondary }]}>
                {encouragement(takenCount, items.length)}
              </Text>
            </>
          ) : null}
        </Animated.View>

        {medications.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(500).delay(80)}>
            <QuickDoseButton />
          </Animated.View>
        ) : null}

        {items.length > 0 ? (
          <>
            {/* Floating stat chips */}
            <Animated.View entering={FadeInDown.duration(480).delay(120)} style={styles.chipsRow}>
              <StatChip
                icon="flame"
                tint="#F2B84B"
                value={streak > 0 ? `${streak}d` : '—'}
                label="Streak"
              />
              <StatChip
                icon="time"
                tint={theme.tint}
                value={nextDose ? formatTime12(nextDose.time).replace(' ', '') : 'Done'}
                label="Next dose"
              />
              <StatChip
                icon="repeat"
                tint={refillsDue > 0 ? '#F2B84B' : '#5B9DFF'}
                value={refillsDue > 0 ? String(refillsDue) : '0'}
                label="Refills due"
              />
            </Animated.View>

            {/* Timeline schedule */}
            <Animated.View entering={FadeIn.duration(400).delay(220)} style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Today&apos;s schedule</Text>
              <Text style={[styles.sectionCount, { color: theme.textSecondary }]}>
                {takenCount}/{items.length}
              </Text>
            </Animated.View>

            <View style={styles.timeline}>
              {items.map((item, i) => (
                <TimelineDose
                  key={`${item.medId}-${item.time}`}
                  item={item}
                  index={i}
                  isFirst={i === 0}
                  isLast={i === items.length - 1}
                  isNext={nextDose ? item.medId === nextDose.medId && item.time === nextDose.time : false}
                  onToggle={() =>
                    item.taken
                      ? unlogDose(item.medId, today, item.time)
                      : logDose(item.medId, today, item.time)
                  }
                />
              ))}
            </View>
          </>
        ) : prnMeds.length === 0 ? (
          <Animated.View entering={FadeInDown.duration(400)}>
            <Card>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>Nothing scheduled today</Text>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                Add a medication in the Meds tab, or turn on “Take as needed” for something you take
                only when you need it.
              </Text>
            </Card>
          </Animated.View>
        ) : null}

        {prnMeds.length > 0 ? (
          <>
            <Animated.View entering={FadeIn.duration(400)} style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>As needed</Text>
            </Animated.View>
            {prnMeds.map((med, i) => (
              <PrnCard key={med.id} med={med} index={i} />
            ))}
          </>
        ) : null}

        {medications.length > 0 ? (
          <Animated.View entering={FadeIn.duration(400).delay(260)}>
            <Pressable onPress={() => router.push('/timing')}>
              <Card style={styles.timingCard}>
                <Ionicons name="time-outline" size={22} color={theme.tint} />
                <View style={styles.flex}>
                  <Text style={[styles.timingTitle, { color: theme.text }]}>Dose timing &amp; delays</Text>
                  <Text style={[styles.timingSub, { color: theme.textSecondary }]}>
                    How promptly you take your doses over time
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
              </Card>
            </Pressable>
          </Animated.View>
        ) : null}

        <View style={{ height: Spacing.two }} />
        <Disclaimer />
      </Animated.ScrollView>
    </Screen>
  );
}

/** One dose as a node on a glowing vertical timeline. */
function TimelineDose({
  item,
  index,
  isFirst,
  isLast,
  isNext,
  onToggle,
}: {
  item: DoseItem;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  isNext: boolean;
  onToggle: () => void;
}) {
  const theme = useTheme();
  const accent = accentFor(item.medId);
  const nodeColor = item.taken ? theme.success : item.overdue ? theme.danger : accent.solid;
  const line = 'rgba(140, 200, 190, 0.16)';

  const pop = useSharedValue(1);
  const fade = useSharedValue(item.taken ? 0.62 : 1);
  useEffect(() => {
    pop.value = withSequence(
      withSpring(1.3, { damping: 9, stiffness: 340 }),
      withSpring(1, { damping: 14, stiffness: 250 }),
    );
    fade.value = withTiming(item.taken ? 0.62 : 1, { duration: 220 });
  }, [item.taken, pop, fade]);
  const nodeAnim = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const nameStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  const status = item.taken ? 'Logged' : item.overdue ? 'Overdue' : isNext ? 'Up next' : 'Scheduled';
  const filled = item.taken || item.overdue;

  return (
    <Animated.View entering={FadeInDown.duration(360).delay(260 + index * 60)}>
      <TiltPress onPress={onToggle} haptic accessibilityRole="button">
        <View style={styles.tRow}>
          <View style={styles.tLeft}>
            {!isFirst ? <View style={[styles.tLineTop, { backgroundColor: line }]} /> : null}
            {!isLast ? <View style={[styles.tLineBot, { backgroundColor: line }]} /> : null}
            <Animated.View
              style={[
                styles.tNode,
                {
                  backgroundColor: filled ? nodeColor : 'transparent',
                  borderColor: nodeColor,
                  shadowColor: nodeColor,
                },
                isNext && !filled ? styles.tNodeNext : null,
                nodeAnim,
              ]}>
              {item.taken ? <Ionicons name="checkmark" size={14} color="#04231C" /> : null}
              {item.overdue ? <Ionicons name="alert" size={14} color="#2A0A0A" /> : null}
            </Animated.View>
          </View>

          <View style={styles.tContent}>
            <Text style={[styles.tTime, { color: accent.solid }]}>{formatTime12(item.time)}</Text>
            <Animated.Text
              style={[
                styles.tName,
                { color: theme.text },
                item.taken && styles.tNameTaken,
                nameStyle,
              ]}>
              {item.name}
            </Animated.Text>
          </View>

          <Text
            style={[
              styles.tStatus,
              { color: item.overdue ? theme.danger : isNext ? theme.tint : theme.textSecondary },
            ]}>
            {status}
          </Text>
        </View>
      </TiltPress>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.four, gap: Spacing.four },
  flex: { flex: 1 },

  // Timing entry
  timingCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  timingTitle: { fontSize: 16, fontWeight: '700' },
  timingSub: { fontSize: 13, marginTop: 1 },

  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandName: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },

  // Hero
  hero: { alignItems: 'center', gap: Spacing.two, marginTop: Spacing.two },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.6 },
  greeting: { fontSize: 30, fontWeight: '800', letterSpacing: -0.6, textAlign: 'center' },
  ringWrap: { marginTop: Spacing.three, alignItems: 'center', justifyContent: 'center' },
  ringPct: { fontSize: 56, fontWeight: '800', letterSpacing: -1.5 },
  ringSub: { fontSize: 13, fontWeight: '600', marginTop: -2 },
  encourage: { fontSize: 15, fontWeight: '600', textAlign: 'center', marginTop: Spacing.two },

  // Stat chips
  chipsRow: { flexDirection: 'row', gap: Spacing.three },
  glassBase: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(132, 240, 208, 0.14)',
    backgroundColor: 'rgba(16, 34, 57, 0.6)',
  },
  chip: {},
  chipIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  chipValue: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  chipLabel: { fontSize: 11, fontWeight: '600', marginTop: 1 },

  // Section header
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  sectionCount: { fontSize: 14, fontWeight: '700' },

  // Timeline
  timeline: { marginTop: -Spacing.two },
  tRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  tLeft: { width: 40, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  tLineTop: { position: 'absolute', top: 0, height: '50%', width: 2, borderRadius: 1 },
  tLineBot: { position: 'absolute', bottom: 0, height: '50%', width: 2, borderRadius: 1 },
  tNode: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.7,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 0 },
  },
  tNodeNext: { transform: [{ scale: 1.12 }] },
  tContent: { flex: 1, gap: 1 },
  tTime: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  tName: { fontSize: 17, fontWeight: '700' },
  tNameTaken: { textDecorationLine: 'line-through' },
  tStatus: { fontSize: 12, fontWeight: '700' },

  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: Spacing.two },
  emptyText: { fontSize: 15, lineHeight: 21 },
});
