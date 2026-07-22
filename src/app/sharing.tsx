import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  acceptInvite,
  createInvite,
  getPatient,
  listMyCaregivers,
  listPatients,
  revokeCaregiver,
  summarizePatient,
  type PatientRef,
} from '@/lib/caregiver/caregiver-client';
import { shareText } from '@/lib/share';
import { useAppStore } from '@/store/app-store';

/** Caregiver sharing hub: invite a caregiver, or accept a patient's invite. */
export default function SharingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const token = useAppStore((s) => s.session?.token);

  const [patients, setPatients] = useState<PatientRef[]>([]);
  const [caregivers, setCaregivers] = useState<PatientRef[]>([]);
  const [alerts, setAlerts] = useState<Record<string, number>>({});
  const [code, setCode] = useState('');
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    const ps = await listPatients(token);
    setPatients(ps);
    setCaregivers(await listMyCaregivers(token));
    // Load each patient's missed-dose count for the alert badges.
    const entries = await Promise.all(
      ps.map(async (p) => {
        const res = await getPatient(token, p.id);
        return [p.id, res ? summarizePatient(res.data).missedToday.length : 0] as const;
      }),
    );
    setAlerts(Object.fromEntries(entries));
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!token) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Caregivers' }} />
        <View style={styles.center}>
          <Ionicons name="people-outline" size={44} color={theme.textSecondary} />
          <Text style={[styles.body, { color: theme.textSecondary, textAlign: 'center' }]}>
            Caregiver sharing needs an account. Sign in with a passkey to invite a caregiver or care
            for someone.
          </Text>
        </View>
      </Screen>
    );
  }

  const makeInvite = async () => {
    setNote(null);
    const result = await createInvite(token);
    if (result) setInvite(result);
    else setNote('Could not create an invite. Is the server running?');
  };

  const redeem = async () => {
    if (!code.trim()) return;
    const result = await acceptInvite(token, code.trim());
    if (result.ok) {
      setCode('');
      setNote(`You can now see ${result.patient.name || 'this person'}.`);
      await refresh();
    } else {
      setNote(result.error);
    }
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: 'Caregivers & sharing' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {note ? <Text style={[styles.note, { color: theme.tint }]}>{note}</Text> : null}

        {/* People you care for */}
        <Card>
          <Text style={[styles.label, { color: theme.textSecondary }]}>People you care for</Text>
          {patients.length === 0 ? (
            <Text style={[styles.body, { color: theme.textSecondary, marginTop: Spacing.two }]}>
              None yet. Enter an invite code below to start caring for someone.
            </Text>
          ) : (
            <View style={{ gap: Spacing.two, marginTop: Spacing.two }}>
              {[...patients]
                .sort((a, b) => (alerts[b.id] ?? 0) - (alerts[a.id] ?? 0))
                .map((p) => {
                  const missed = alerts[p.id] ?? 0;
                  return (
                    <Pressable key={p.id} onPress={() => router.push(`/care/${p.id}`)} style={styles.row}>
                      <View style={[styles.avatar, { backgroundColor: missed > 0 ? theme.danger : theme.tint }]}>
                        <Text style={styles.avatarText}>{(p.name || '?').charAt(0).toUpperCase()}</Text>
                      </View>
                      <Text style={[styles.name, { color: theme.text }]}>{p.name || 'Someone'}</Text>
                      {missed > 0 ? (
                        <View style={[styles.badge, { backgroundColor: theme.danger }]}>
                          <Text style={styles.badgeText}>{missed} missed</Text>
                        </View>
                      ) : null}
                      <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
                    </Pressable>
                  );
                })}
            </View>
          )}
          <View style={{ height: Spacing.three }} />
          <TextField label="Enter an invite code" placeholder="e.g. A1B2C3D4" value={code} onChangeText={setCode} autoCapitalize="characters" />
          <View style={{ height: Spacing.two }} />
          <Button title="Accept invite" variant="secondary" onPress={redeem} />
        </Card>

        {/* Share your care */}
        <Card>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Share your care</Text>
          <Text style={[styles.body, { color: theme.textSecondary, marginVertical: Spacing.two }]}>
            Invite a family member or caregiver to see your medications, adherence, and refills.
          </Text>

          {invite ? (
            <View style={[styles.codeBox, { borderColor: theme.tint, backgroundColor: theme.background }]}>
              <Text style={[styles.code, { color: theme.tint }]}>{invite.code}</Text>
              <Text style={[styles.codeHint, { color: theme.textSecondary }]}>
                Share this code. It expires in 24 hours.
              </Text>
              <View style={{ height: Spacing.two }} />
              <Button title="Share code" onPress={() => shareText(`Join me on DoselyAI as my caregiver. Invite code: ${invite.code}`, 'DoselyAI caregiver invite')} />
            </View>
          ) : (
            <Button title="Invite a caregiver" onPress={makeInvite} />
          )}

          {caregivers.length > 0 ? (
            <View style={{ marginTop: Spacing.four, gap: Spacing.two }}>
              <Text style={[styles.subLabel, { color: theme.textSecondary }]}>Who can see you</Text>
              {caregivers.map((c) => (
                <View key={c.id} style={styles.row}>
                  <Text style={[styles.name, { color: theme.text }]}>{c.name || 'Someone'}</Text>
                  <Pressable
                    onPress={async () => {
                      await revokeCaregiver(token, c.id);
                      await refresh();
                    }}>
                    <Text style={[styles.revoke, { color: theme.danger }]}>Remove</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </Card>

        <Text style={[styles.fine, { color: theme.textSecondary }]}>
          Caregivers get read-only access to your medication information. You can remove them anytime.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.four, gap: Spacing.three },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  label: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  subLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  body: { fontSize: 14, lineHeight: 20 },
  note: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  avatar: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontWeight: '800' },
  name: { flex: 1, fontSize: 16, fontWeight: '600' },
  badge: { paddingHorizontal: Spacing.two, paddingVertical: 3, borderRadius: 999 },
  badgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  revoke: { fontSize: 14, fontWeight: '700' },
  codeBox: { borderWidth: 1.5, borderRadius: 16, padding: Spacing.three, alignItems: 'center' },
  code: { fontSize: 30, fontWeight: '800', letterSpacing: 4 },
  codeHint: { fontSize: 12, marginTop: Spacing.one },
  fine: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
});
