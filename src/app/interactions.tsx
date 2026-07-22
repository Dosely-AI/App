import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Disclaimer } from '@/components/disclaimer';
import { Screen } from '@/components/screen';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import { checkInteractions, type InteractionReport } from '@/features/interactions/interactions';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

/** Cross-checks the user's medications against each other's FDA interaction labeling. */
export default function InteractionsScreen() {
  const theme = useTheme();
  const medications = useAppStore((s) => s.medications);
  const [report, setReport] = useState<InteractionReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    checkInteractions(medications, controller.signal)
      .then(setReport)
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [medications]);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: 'Interactions' }} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {medications.length < 2 ? (
          <Card>
            <Text style={[styles.body, { color: theme.text }]}>
              Add at least two medications and Dosely will cross-check their FDA labels for
              interactions.
            </Text>
          </Card>
        ) : loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.tint} />
            <Text style={[styles.body, { color: theme.textSecondary }]}>
              Checking your medications against FDA labeling…
            </Text>
          </View>
        ) : (
          <>
            {/* Headline: pairs that name each other */}
            {report && report.pairs.length > 0 ? (
              <Animated.View entering={FadeInDown.duration(400)}>
                <Card style={[styles.flag, { borderColor: theme.warning }]}>
                  <View style={styles.flagHead}>
                    <Ionicons name="warning" size={22} color={theme.warning} />
                    <Text style={[styles.flagTitle, { color: theme.text }]}>Worth asking about</Text>
                  </View>
                  <Text style={[styles.body, { color: theme.textSecondary }]}>
                    These medications name each other in their interaction labeling. Ask your
                    pharmacist whether they’re safe to take together:
                  </Text>
                  <View style={{ gap: Spacing.two, marginTop: Spacing.three }}>
                    {report.pairs.map(([a, b]) => (
                      <View key={`${a}-${b}`} style={styles.pairRow}>
                        <Text style={[styles.pairText, { color: theme.text }]}>{a}</Text>
                        <Ionicons name="swap-horizontal" size={16} color={theme.warning} />
                        <Text style={[styles.pairText, { color: theme.text }]}>{b}</Text>
                      </View>
                    ))}
                  </View>
                </Card>
              </Animated.View>
            ) : report && report.hasAnyText ? (
              <Animated.View entering={FadeInDown.duration(400)}>
                <Card>
                  <View style={styles.flagHead}>
                    <Ionicons name="checkmark-circle" size={22} color={theme.success} />
                    <Text style={[styles.flagTitle, { color: theme.text }]}>
                      No named overlaps found
                    </Text>
                  </View>
                  <Text style={[styles.body, { color: theme.textSecondary }]}>
                    None of your medications name another one you take in their FDA interaction
                    labeling. This isn’t a full interaction check — see the note below.
                  </Text>
                </Card>
              </Animated.View>
            ) : null}

            {/* Per-medication label sections */}
            {report?.entries.map((e, i) => (
              <Animated.View key={e.name} entering={FadeInDown.duration(400).delay(80 + i * 60)}>
                <Card>
                  <Text style={[styles.medName, { color: theme.text }]}>{e.name}</Text>
                  {e.mentions.length > 0 ? (
                    <Text style={[styles.mentions, { color: theme.warning }]}>
                      Names your {e.mentions.join(', ')}
                    </Text>
                  ) : null}
                  <Text style={[styles.labelText, { color: theme.textSecondary }]}>
                    {e.text ?? 'No drug-interaction section is published for this medication.'}
                  </Text>
                </Card>
              </Animated.View>
            ))}

            <Card style={{ borderColor: theme.border }}>
              <Text style={[styles.caveat, { color: theme.textSecondary }]}>
                Dosely highlights where one medication’s label names another you take. It can’t catch
                every interaction — labels often describe them by drug class (e.g. “NSAIDs”) rather
                than by name — so always have your pharmacist review your full list.
              </Text>
            </Card>

            <Disclaimer />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.four, gap: Spacing.three },
  center: { alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.six },
  body: { fontSize: 14, lineHeight: 20 },
  flag: { borderWidth: 1.5 },
  flagHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.two },
  flagTitle: { fontSize: 17, fontWeight: '700' },
  pairRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  pairText: { fontSize: 15, fontWeight: '700' },
  medName: { fontSize: 17, fontWeight: '700' },
  mentions: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  labelText: { fontSize: 14, lineHeight: 20, marginTop: Spacing.two },
  caveat: { fontSize: 13, lineHeight: 19 },
});
