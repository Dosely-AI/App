import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Screen } from '@/components/screen';
import { AuroraBackground } from '@/components/ui/aurora-background';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TextField } from '@/components/ui/text-field';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { parseDateKey } from '@/features/adherence/dates';
import { severityLabel } from '@/features/health/visit-summary';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LEVELS = [1, 2, 3, 4, 5];

/** Green (mild) → red (severe) for a 1–5 severity. */
function severityColor(theme: Record<ThemeColor, string>, n: number): string {
  if (n <= 2) return theme.success;
  if (n === 3) return theme.warning;
  return theme.danger;
}

/** How-you-feel journal: log a symptom with a severity, review past entries. */
export default function JournalScreen() {
  const theme = useTheme() as Record<ThemeColor, string>;
  const symptoms = useAppStore((s) => s.symptoms);
  const addSymptom = useAppStore((s) => s.addSymptom);
  const removeSymptom = useAppStore((s) => s.removeSymptom);

  const [note, setNote] = useState('');
  const [severity, setSeverity] = useState(2);

  const save = () => {
    if (!note.trim()) return;
    addSymptom(note, severity);
    setNote('');
    setSeverity(2);
  };

  return (
    <Screen edges={['bottom']}>
      <AuroraBackground />
      <Stack.Screen options={{ title: 'How you feel' }} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Card>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Log how you feel</Text>
          <TextField
            placeholder="e.g. Mild headache after my morning dose"
            value={note}
            onChangeText={setNote}
            autoFocus
          />
          <Text style={[styles.severityLabel, { color: theme.text }]}>
            Severity: {severityLabel(severity)}
          </Text>
          <View style={styles.levels}>
            {LEVELS.map((n) => {
              const on = severity >= n;
              return (
                <Pressable
                  key={n}
                  onPress={() => setSeverity(n)}
                  style={[
                    styles.level,
                    {
                      backgroundColor: on ? severityColor(theme, severity) : theme.background,
                      borderColor: on ? severityColor(theme, severity) : theme.border,
                    },
                  ]}>
                  <Text style={{ color: on ? '#FFFFFF' : theme.textSecondary, fontWeight: '700' }}>
                    {n}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ height: Spacing.three }} />
          <Button title="Add to journal" onPress={save} />
        </Card>

        {symptoms.length === 0 ? (
          <Text style={[styles.empty, { color: theme.textSecondary }]}>
            Your entries will appear here. Tracking how you feel over time helps you and your doctor
            spot patterns.
          </Text>
        ) : (
          symptoms.map((s, i) => (
            <Animated.View key={s.id} entering={FadeInDown.duration(300).delay(i * 40)}>
              <Card style={styles.entry}>
                <View style={[styles.dot, { backgroundColor: severityColor(theme, s.severity) }]} />
                <View style={styles.flex}>
                  <Text style={[styles.entryTop, { color: theme.textSecondary }]}>
                    {formatDate(s.date)} · {severityLabel(s.severity)}
                  </Text>
                  {s.note ? <Text style={[styles.entryNote, { color: theme.text }]}>{s.note}</Text> : null}
                </View>
                <Pressable onPress={() => removeSymptom(s.id)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color={theme.textSecondary} />
                </Pressable>
              </Card>
            </Animated.View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

function formatDate(key: string): string {
  const d = parseDateKey(key);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.four, gap: Spacing.three },
  label: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: Spacing.two },
  severityLabel: { fontSize: 15, fontWeight: '600', marginTop: Spacing.three },
  levels: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  level: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: Spacing.three, marginTop: Spacing.two },
  entry: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  flex: { flex: 1 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  entryTop: { fontSize: 12, fontWeight: '700' },
  entryNote: { fontSize: 15, lineHeight: 20, marginTop: 2 },
});
