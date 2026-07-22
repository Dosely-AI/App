import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { GradientCard } from '@/components/ui/gradient-card';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { shareText } from '@/lib/share';
import { useAppStore } from '@/store/app-store';
import type { EmergencyInfo } from '@/store/types';

const EMPTY: EmergencyInfo = {
  allergies: '',
  conditions: '',
  bloodType: '',
  contactName: '',
  contactPhone: '',
  notes: '',
};

/** Assemble the shareable/printable card text from the user's data. */
function cardText(name: string, meds: string[], info: EmergencyInfo): string {
  const L: string[] = ['EMERGENCY MEDICAL CARD'];
  if (name) L.push(name);
  L.push('');
  L.push(`Medications: ${meds.length ? meds.join(', ') : 'none recorded'}`);
  if (info.allergies) L.push(`Allergies: ${info.allergies}`);
  if (info.conditions) L.push(`Conditions: ${info.conditions}`);
  if (info.bloodType) L.push(`Blood type: ${info.bloodType}`);
  if (info.contactName || info.contactPhone)
    L.push(`Emergency contact: ${[info.contactName, info.contactPhone].filter(Boolean).join(' · ')}`);
  if (info.notes) L.push(`Notes: ${info.notes}`);
  L.push('', 'Shared from DoselyAI');
  return L.join('\n');
}

export default function EmergencyScreen() {
  const theme = useTheme();
  const medications = useAppStore((s) => s.medications);
  const stored = useAppStore((s) => s.emergency);
  const setEmergency = useAppStore((s) => s.setEmergency);
  const profileName = useAppStore((s) => s.profile?.name ?? s.session?.name ?? '');

  const [info, setInfo] = useState<EmergencyInfo>(stored ?? EMPTY);
  const [saved, setSaved] = useState(false);

  const medNames = medications.map((m) => [m.name, m.strength].filter(Boolean).join(' '));
  const set = (k: keyof EmergencyInfo) => (v: string) => {
    setInfo((prev) => ({ ...prev, [k]: v }));
    setSaved(false);
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: 'Emergency card' }} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {/* Live preview */}
        <GradientCard colors={['#E2564A', '#B5322A']} glow="#E2564A">
          <View style={styles.previewHead}>
            <Ionicons name="medkit" size={22} color="#FFFFFF" />
            <Text style={styles.previewTitle}>Emergency Medical Card</Text>
          </View>
          {profileName ? <Text style={styles.previewName}>{profileName}</Text> : null}

          <Row label="Medications" value={medNames.join(', ') || 'None recorded'} />
          {info.allergies ? <Row label="Allergies" value={info.allergies} /> : null}
          {info.conditions ? <Row label="Conditions" value={info.conditions} /> : null}
          {info.bloodType ? <Row label="Blood type" value={info.bloodType} /> : null}
          {info.contactName || info.contactPhone ? (
            <Row label="Emergency contact" value={[info.contactName, info.contactPhone].filter(Boolean).join(' · ')} />
          ) : null}
        </GradientCard>

        <Button
          title="Share card"
          onPress={() => shareText(cardText(profileName, medNames, info), 'Emergency Medical Card')}
        />

        {/* Editable details */}
        <Card>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Details</Text>
          <TextField label="Allergies" placeholder="e.g. Penicillin, peanuts" value={info.allergies} onChangeText={set('allergies')} />
          <View style={styles.gap} />
          <TextField label="Medical conditions" placeholder="e.g. Type 2 diabetes, asthma" value={info.conditions} onChangeText={set('conditions')} />
          <View style={styles.gap} />
          <View style={styles.row}>
            <View style={styles.flex}>
              <TextField label="Blood type" placeholder="e.g. O+" value={info.bloodType} onChangeText={set('bloodType')} autoCapitalize="characters" />
            </View>
            <View style={styles.flex}>
              <TextField label="Contact name" placeholder="e.g. Alex" value={info.contactName} onChangeText={set('contactName')} />
            </View>
          </View>
          <View style={styles.gap} />
          <TextField label="Contact phone" placeholder="e.g. (555) 123-4567" value={info.contactPhone} onChangeText={set('contactPhone')} keyboardType="phone-pad" />
          <View style={styles.gap} />
          <TextField label="Other notes" placeholder="Anything a responder should know" value={info.notes} onChangeText={set('notes')} />

          <View style={{ height: Spacing.three }} />
          <Button
            title={saved ? 'Saved ✓' : 'Save card'}
            variant="secondary"
            onPress={() => {
              setEmergency(info);
              setSaved(true);
            }}
          />
        </Card>

        <Text style={[styles.fine, { color: theme.textSecondary }]}>
          Stored only on this device. Your medications update automatically from your list.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.previewRow}>
      <Text style={styles.previewLabel}>{label}</Text>
      <Text style={styles.previewValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.four, gap: Spacing.three },
  previewHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  previewTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  previewName: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginTop: Spacing.two },
  previewRow: { marginTop: Spacing.three },
  previewLabel: { color: '#FFFFFF', opacity: 0.8, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  previewValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', marginTop: 2 },
  label: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: Spacing.three },
  row: { flexDirection: 'row', gap: Spacing.three },
  flex: { flex: 1 },
  gap: { height: Spacing.three },
  fine: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
});
