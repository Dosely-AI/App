import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Disclaimer } from '@/components/disclaimer';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type MedSummary, summarizeMedication } from '@/lib/ai/summary';

/** Shows a grounded (FDA) or AI-written explanation of what a medication is for. */
export function MedicationOverview({ name, rxcui }: { name: string; rxcui: string | null }) {
  const theme = useTheme();
  const [summary, setSummary] = useState<MedSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    summarizeMedication({ name, rxcui, signal: controller.signal })
      .then(setSummary)
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [name, rxcui]);

  const badge =
    summary?.source === 'ai' ? 'AI summary' : summary?.source === 'fda' ? 'From FDA labeling' : null;

  return (
    <Card>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>What it&apos;s for</Text>
        {badge ? <Text style={[styles.badge, { color: theme.textSecondary }]}>{badge}</Text> : null}
      </View>

      {loading ? (
        <ActivityIndicator color={theme.tint} style={{ marginVertical: Spacing.four }} />
      ) : (
        <Text style={[styles.body, { color: theme.text }]}>{summary?.text}</Text>
      )}

      <View style={{ height: Spacing.three }} />
      <Disclaimer />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  title: { fontSize: 18, fontWeight: '700' },
  badge: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  body: { fontSize: 15, lineHeight: 22 },
});
