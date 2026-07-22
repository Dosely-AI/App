import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Disclaimer } from '@/components/disclaimer';
import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import { buildVisitSummary } from '@/features/health/visit-summary';
import { useTheme } from '@/hooks/use-theme';
import { shareText } from '@/lib/share';
import { useAppStore } from '@/store/app-store';

/** A shareable summary for a doctor's appointment, generated from the user's data. */
export default function VisitSummaryScreen() {
  const theme = useTheme();
  const medications = useAppStore((s) => s.medications);
  const logs = useAppStore((s) => s.logs);
  const symptoms = useAppStore((s) => s.symptoms);
  const name = useAppStore((s) => s.profile?.name ?? s.session?.name ?? '');
  const [status, setStatus] = useState<string | null>(null);

  const summary = useMemo(
    () => buildVisitSummary({ name, medications, logs, symptoms }),
    [name, medications, logs, symptoms],
  );

  const onShare = async () => {
    const result = await shareText(summary, 'Doctor Visit Summary');
    setStatus(result === 'copied' ? 'Copied to clipboard' : result === 'failed' ? 'Could not share' : null);
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: 'Visit summary' }} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <Ionicons name="document-text" size={22} color={theme.tint} />
          <Text style={[styles.introText, { color: theme.textSecondary }]}>
            A snapshot of your medications, adherence, refills, and symptoms to bring to your next
            appointment. Built from your own data — review it before sharing.
          </Text>
        </View>

        <Button title="Share / export" onPress={onShare} />
        {status ? <Text style={[styles.status, { color: theme.textSecondary }]}>{status}</Text> : null}

        <Card>
          <Text style={[styles.summary, { color: theme.text }]}>{summary}</Text>
        </Card>

        <Disclaimer />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.four, gap: Spacing.three },
  intro: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  introText: { flex: 1, fontSize: 14, lineHeight: 20 },
  status: { fontSize: 13, textAlign: 'center' },
  summary: { fontSize: 14, lineHeight: 21, fontFamily: 'ui-monospace' },
});
