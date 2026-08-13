import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Extrapolation,
  FadeIn,
  FadeInDown,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Disclaimer } from '@/components/disclaimer';
import { DoselyWordmark } from '@/components/logo';
import { Screen } from '@/components/screen';
import { AuroraBackground } from '@/components/ui/aurora-background';
import { Card } from '@/components/ui/card';
import { CountUp } from '@/components/ui/count-up';
import { HeroCard } from '@/components/ui/hero-card';
import { FloatingPills } from '@/components/ui/pill-3d';
import { ProgressRing } from '@/components/ui/progress-ring';
import { TiltPress } from '@/components/ui/tilt-press';
import { HeroGradient, Spacing, accentFor } from '@/constants/theme';
import { currentStreak, expectedSlots, missedDoses } from '@/features/adherence/adherence';
import { dateKey, lastNDays } from '@/features/adherence/dates';
import { PrnCard } from '@/features/medications/components/prn-card';
import { isAsNeeded } from '@/features/medications/prn';
import { formatTime12 } from '@/features/medications/schedule';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

type DoseItem = { medId: string; name: string; time: string; taken: boolean; overdue: boolean };

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function encouragement(taken: number, total: number): string {
  if (total === 0) return '';
  if (taken === 0) return "Let's get started on today's doses.";
  if (taken === total) return 'All done for today — nice work! 🎉';
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
  const scheme = useColorScheme();
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

  const streak = useMemo(
    () => currentStreak(medications, logs, lastNDays(30)),
    [medications, logs],
  );

  const prnMeds = useMemo(() => medications.filter(isAsNeeded), [medications]);

  const takenCount = items.filter((i) => i.taken).length;
  const overdueCount = items.filter((i) => i.overdue).length;
  const remaining = items.length - takenCount;
  const pct = items.length === 0 ? 0 : Math.round((takenCount / items.length) * 100);
  const allDone = items.length > 0 && takenCount === items.length;
  const nextDose = items.find((i) => !i.taken);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const heroStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: scrollY.value * 0.3 },
      { scale: interpolate(scrollY.value, [-120, 0], [1.06, 1], Extrapolation.CLAMP) },
    ],
    opacity: interpolate(scrollY.value, [0, 260], [1, 0.55], Extrapolation.CLAMP),
  }));

  return (
    <Screen>
      <AuroraBackground />
      <FloatingPills scrollY={scrollY} width={winWidth} height={winHeight} />

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeIn.duration(500)} style={styles.brandRow}>
          <DoselyWordmark />
        </Animated.View>

        {items.length > 0 ? (
          <>
            {/* Layered hero: ring, headline, and a segmented stat strip */}
            <Animated.View style={heroStyle}>
              <Animated.View entering={FadeInDown.duration(520)}>
                <HeroCard colors={HeroGradient[scheme === 'dark' ? 'dark' : 'light']}>
                  <Text style={styles.eyebrow}>
                    {WEEKDAYS[now.getDay()].toUpperCase()} · {MONTHS[now.getMonth()]} {now.getDate()}
                  </Text>
                  <Text style={styles.greeting}>
                    {greeting()}
                    {profile?.name ? `, ${profile.name}` : ''}
                  </Text>

                  <View style={styles.heroBody}>
                    <ProgressRing
                      pct={pct}
                      color="#FFFFFF"
                      gradient={['#FFFFFF', '#BFF3E4']}
                      size={112}
                      thickness={11}>
                      <CountUp value={pct} suffix="%" style={styles.ringPct} />
                    </ProgressRing>

                    <View style={styles.heroCopy}>
                      <Text style={styles.heroCount}>
                        {takenCount}
                        <Text style={styles.heroTotal}> / {items.length}</Text>
                      </Text>
                      <Text style={styles.heroCaption}>doses taken today</Text>
                      <Text style={styles.heroBlurb}>{encouragement(takenCount, items.length)}</Text>
                    </View>
                  </View>

                  <View style={styles.statStrip}>
                    <Stat value={String(takenCount)} label="Taken" />
                    <View style={styles.divider} />
                    <Stat value={String(remaining)} label="Remaining" />
                    <View style={styles.divider} />
                    <Stat value={streak > 0 ? `🔥 ${streak}` : '—'} label="Day streak" />
                  </View>
                </HeroCard>
              </Animated.View>
            </Animated.View>

            {/* Up next callout */}
            {nextDose ? (
              <Animated.View entering={FadeInDown.duration(420).delay(120)}>
                <Card style={styles.nextCard}>
                  <View style={[styles.nextIcon, { backgroundColor: accentFor(nextDose.medId).solid }]}>
                    <Ionicons name="alarm" size={18} color="#FFFFFF" />
                  </View>
                  <View style={styles.flex}>
                    <Text style={[styles.nextLabel, { color: theme.textSecondary }]}>Up next</Text>
                    <Text style={[styles.nextName, { color: theme.text }]}>
                      {nextDose.name} · {formatTime12(nextDose.time)}
                    </Text>
                  </View>
                </Card>
              </Animated.View>
            ) : null}

            {/* Overdue callout */}
            {overdueCount > 0 ? (
              <Animated.View entering={FadeInDown.duration(420).delay(90)}>
                <Card style={styles.overdueCard}>
                  <Ionicons name="alert-circle" size={20} color={theme.danger} />
                  <Text style={[styles.overdueText, { color: theme.danger }]}>
                    {overdueCount} dose{overdueCount === 1 ? '' : 's'} overdue today — tap to log if you&apos;ve taken it.
                  </Text>
                </Card>
              </Animated.View>
            ) : null}

            {/* Section header */}
            <Animated.View entering={FadeIn.duration(400).delay(180)} style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Today&apos;s schedule</Text>
              <View style={[styles.countPill, { backgroundColor: theme.backgroundElement }]}>
                <Text style={[styles.countText, { color: theme.textSecondary }]}>
                  {takenCount}/{items.length}
                </Text>
              </View>
            </Animated.View>

            {items.map((item, i) => (
              <DoseRow
                key={`${item.medId}-${item.time}`}
                item={item}
                index={i}
                onToggle={() =>
                  item.taken
                    ? unlogDose(item.medId, today, item.time)
                    : logDose(item.medId, today, item.time)
                }
              />
            ))}
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

        <Disclaimer />
      </Animated.ScrollView>
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** One tappable dose: 3D tilt, its medication's accent, a time chip, and a popping check. */
function DoseRow({ item, index, onToggle }: { item: DoseItem; index: number; onToggle: () => void }) {
  const theme = useTheme();
  const accent = accentFor(item.medId);
  const pop = useSharedValue(1);
  const fade = useSharedValue(item.taken ? 0.66 : 1);

  useEffect(() => {
    pop.value = withSequence(
      withSpring(1.32, { damping: 9, stiffness: 340 }),
      withSpring(1, { damping: 14, stiffness: 250 }),
    );
    fade.value = withTiming(item.taken ? 0.66 : 1, { duration: 220 });
  }, [item.taken, pop, fade]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const rowStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  return (
    <Animated.View entering={FadeInDown.duration(380).delay(220 + index * 65)}>
      <TiltPress onPress={onToggle} haptic accessibilityRole="button">
        <Animated.View style={rowStyle}>
          <Card style={styles.doseRow}>
            <View style={[styles.spine, { backgroundColor: accent.solid }]} />

            {/* Time chip anchors each dose to its slot */}
            <View style={[styles.timeChip, { backgroundColor: theme.background }]}>
              <Text style={[styles.timeText, { color: accent.solid }]}>
                {formatTime12(item.time).replace(' ', '\n')}
              </Text>
            </View>

            <View style={styles.doseText}>
              <Text
                style={[styles.doseName, { color: theme.text }, item.taken && styles.doseTakenName]}>
                {item.name}
              </Text>
              <Text style={{ color: item.overdue ? theme.danger : theme.textSecondary, fontSize: 13 }}>
                {item.taken ? 'Logged' : item.overdue ? 'Overdue' : 'Not taken yet'}
              </Text>
            </View>

            <Animated.View style={iconStyle}>
              {item.taken ? (
                <View style={[styles.check, { backgroundColor: theme.success, shadowColor: theme.success }]}>
                  <Ionicons name="checkmark" size={19} color="#04231C" />
                </View>
              ) : (
                <View style={[styles.checkOpen, { borderColor: accent.solid }]} />
              )}
            </Animated.View>
          </Card>
        </Animated.View>
      </TiltPress>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.four, gap: Spacing.three },
  brandRow: { marginBottom: Spacing.one },
  flex: { flex: 1 },

  // Hero
  eyebrow: {
    color: '#FFFFFF',
    opacity: 0.75,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  greeting: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginTop: Spacing.one },
  heroBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    marginTop: Spacing.four,
  },
  heroCopy: { flex: 1 },
  ringPct: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
  heroCount: { color: '#FFFFFF', fontSize: 34, fontWeight: '800' },
  heroTotal: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', opacity: 0.7 },
  heroCaption: { color: '#FFFFFF', opacity: 0.85, fontSize: 13, fontWeight: '600' },
  heroBlurb: { color: '#FFFFFF', opacity: 0.9, fontSize: 13, lineHeight: 18, marginTop: Spacing.two },

  statStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.four,
    paddingTop: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.22)',
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  statLabel: { color: '#FFFFFF', opacity: 0.75, fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  divider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.22)' },

  // Overdue callout
  overdueCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three },
  overdueText: { flex: 1, fontSize: 14, fontWeight: '700', lineHeight: 19 },

  // Up next
  nextCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three },
  nextIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  nextLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  nextName: { fontSize: 16, fontWeight: '700', marginTop: 1 },

  // Section header
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  countPill: { paddingHorizontal: Spacing.three, paddingVertical: 4, borderRadius: 999 },
  countText: { fontSize: 13, fontWeight: '700' },

  // Dose rows
  doseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingLeft: Spacing.four,
    overflow: 'hidden',
  },
  spine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  timeChip: {
    width: 54,
    paddingVertical: Spacing.two,
    borderRadius: 14,
    alignItems: 'center',
  },
  timeText: { fontSize: 13, fontWeight: '800', textAlign: 'center', lineHeight: 16 },
  doseText: { flex: 1, gap: 2 },
  doseName: { fontSize: 16, fontWeight: '700' },
  doseTakenName: { textDecorationLine: 'line-through' },
  check: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.55,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 0 },
  },
  checkOpen: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, opacity: 0.85 },

  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: Spacing.two },
  emptyText: { fontSize: 15, lineHeight: 21 },
});
