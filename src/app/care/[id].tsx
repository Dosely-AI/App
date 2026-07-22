import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Disclaimer } from '@/components/disclaimer';
import { Screen } from '@/components/screen';
import { Card } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { parseDateKey } from '@/features/adherence/dates';
import { formatTime12 } from '@/features/medications/schedule';
import { severityLabel } from '@/features/health/visit-summary';
import { getPatient, summarizePatient, type PatientSummary } from '@/lib/caregiver/caregiver-client';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDate(key: string): string {
  const d = parseDateKey(key);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** Read-only caregiver dashboard for one linked patient. */
export default function PatientCareScreen() {
  const theme = useTheme() as Record<ThemeColor, string>;
  const { id } = useLocalSearchParams<{ id: string }>();
  const token = useAppStore((s) => s.session?.token);

  const [name, setName] = useState('');
  const [summary, setSummary] = useState<PatientSummary | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    if (!token || !id) return;
    let cancelled = false;
    getPatient(token, id).then((res) => {
      if (cancelled) return;
      if (!res) {
        setState('error');
        return;
      }
      setName(res.patient.name);
      setSummary(summarizePatient(res.data));
      setState('ok');
    });
    return () => {
      cancelled = true;
    };
  }, [token, id]);

  const pct = summary?.adherencePct ?? null;
  const pctColor = pct === null ? theme.border : pct >= 90 ? theme.success : pct >= 50 ? theme.warning : theme.danger;
  const allDoneToday = summary ? summary.todayTotal > 0 && summary.todayTaken === summary.todayTotal : false;

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: name || 'Patient' }} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {state === 'loading' ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.tint} />
          </View>
        ) : state === 'error' || !summary ? (
          <Card>
            <Text style={{ color: theme.text }}>Couldn’t load this person’s information right now.</Text>
          </Card>
        ) : (
          <>
            {/* Missed-dose alert — the caregiver's most important signal */}
            {summary.missedToday.length > 0 ? (
              <Animated.View entering={FadeInDown.duration(400)}>
                <Card style={{ borderColor: theme.danger, borderWidth: 1.5 }}>
                  <View style={styles.flagHead}>
                    <Ionicons name="alert-circle" size={22} color={theme.danger} />
                    <Text style={[styles.flagTitle, { color: theme.danger }]}>
                      {summary.missedToday.length} missed dose{summary.missedToday.length === 1 ? '' : 's'} today
                    </Text>
                  </View>
                  <View style={{ gap: Spacing.two, marginTop: Spacing.two }}>
                    {summary.missedToday.map((mDose, i) => (
                      <View key={i} style={styles.rowBetween}>
                        <Text style={[styles.name, { color: theme.text }]}>{mDose.name}</Text>
                        <Text style={{ color: theme.danger, fontWeight: '600' }}>
                          {formatTime12(mDose.time)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </Card>
              </Animated.View>
            ) : null}

            {/* Today */}
            <Animated.View entering={FadeInDown.duration(400).delay(40)}>
              <Card>
                <Text style={[styles.label, { color: theme.textSecondary }]}>Today</Text>
                {summary.todayTotal === 0 ? (
                  <Text style={[styles.big, { color: theme.text }]}>Nothing scheduled</Text>
                ) : (
                  <>
                    <View style={styles.rowBetween}>
                      <Text style={[styles.big, { color: theme.text }]}>
                        {summary.todayTaken}
                        <Text style={{ color: theme.textSecondary, fontSize: 22 }}> / {summary.todayTotal}</Text>
                      </Text>
                      <Text style={{ color: allDoneToday ? theme.success : theme.warning, fontWeight: '800' }}>
                        {allDoneToday ? 'All taken' : 'In progress'}
                      </Text>
                    </View>
                    <Text style={[styles.body, { color: theme.textSecondary }]}>doses taken today</Text>
                  </>
                )}
              </Card>
            </Animated.View>

            {/* Adherence */}
            <Animated.View entering={FadeInDown.duration(400).delay(80)}>
              <Card>
                <Text style={[styles.label, { color: theme.textSecondary }]}>Adherence · 14 days</Text>
                <View style={styles.rowBetween}>
                  <Text style={[styles.big, { color: pctColor }]}>{pct === null ? '—' : `${pct}%`}</Text>
                  <Text style={{ color: pctColor, fontWeight: '700' }}>{summary.ratingLabel}</Text>
                </View>
                <ProgressBar pct={pct} color={pctColor} height={10} delay={150} />
                {summary.streak > 0 ? (
                  <Text style={[styles.body, { color: theme.text, marginTop: Spacing.three }]}>
                    🔥 {summary.streak}-day streak
                  </Text>
                ) : null}
              </Card>
            </Animated.View>

            {/* Refills */}
            {summary.refillsLow.length > 0 ? (
              <Animated.View entering={FadeInDown.duration(400).delay(160)}>
                <Card style={{ borderColor: theme.warning }}>
                  <View style={styles.flagHead}>
                    <Ionicons name="alert-circle" size={20} color={theme.warning} />
                    <Text style={[styles.flagTitle, { color: theme.text }]}>Refills running low</Text>
                  </View>
                  <View style={{ gap: Spacing.two, marginTop: Spacing.two }}>
                    {summary.refillsLow.map((r) => (
                      <View key={r.name} style={styles.rowBetween}>
                        <Text style={[styles.name, { color: theme.text }]}>{r.name}</Text>
                        <Text style={{ color: theme.warning, fontWeight: '600' }}>
                          {r.out ? 'Out' : `${r.daysLeft}d left`}
                        </Text>
                      </View>
                    ))}
                  </View>
                </Card>
              </Animated.View>
            ) : null}

            {/* Symptoms */}
            {summary.recentSymptoms.length > 0 ? (
              <Animated.View entering={FadeInDown.duration(400).delay(240)}>
                <Card>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>Recent symptoms</Text>
                  <View style={{ gap: Spacing.two, marginTop: Spacing.two }}>
                    {summary.recentSymptoms.map((s, i) => (
                      <View key={i} style={styles.rowBetween}>
                        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
                          {shortDate(s.date)} — {s.note || 'Symptom'}
                        </Text>
                        <Text style={{ color: theme.textSecondary }}>{severityLabel(s.severity)}</Text>
                      </View>
                    ))}
                  </View>
                </Card>
              </Animated.View>
            ) : null}

            <Text style={[styles.fine, { color: theme.textSecondary }]}>
              Read-only view shared by {name || 'this person'}.
            </Text>
            <Disclaimer />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.four, gap: Spacing.three },
  center: { paddingVertical: Spacing.six, alignItems: 'center' },
  label: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: Spacing.two },
  big: { fontSize: 34, fontWeight: '800' },
  body: { fontSize: 14, lineHeight: 20 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flagHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flagTitle: { fontSize: 16, fontWeight: '700' },
  name: { flex: 1, fontSize: 15, fontWeight: '600', marginRight: Spacing.two },
  fine: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
});
