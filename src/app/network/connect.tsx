import * as Linking from 'expo-linking';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import { CloudAccountRequired } from '@/features/auth/cloud-account-required';
import {
  DEFAULT_SCOPES,
  buildSnapshot,
  refillLevelLabel,
  scopesFor,
} from '@/features/care/care';
import { Chip, Muted, Notice, SectionLabel } from '@/features/care/components/care-ui';
import { QrCode } from '@/features/care/components/qr-code';
import { useCareSession } from '@/features/care/use-care';
import { errorMessage } from '@/features/care/use-load';
import { useTheme } from '@/hooks/use-theme';
import { care, inviteLink } from '@/lib/care/care-client';
import { Role, Scope, type InviteJson, type SummaryJson } from '@/lib/care/protocol.gen';
import { shareText } from '@/lib/share';
import { useAppStore } from '@/store/app-store';

const DURATIONS = [30, 90, 180, 365] as const;

/** Create a one-time, expiring invite for a pharmacy or doctor, with exactly the access you choose. */
export default function ConnectScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ role?: string }>();
  const { session, run } = useCareSession();
  const meds = useAppStore((s) => s.medications);
  const logs = useAppStore((s) => s.logs);
  const displayName = useAppStore((s) => s.profile?.name ?? s.session?.name ?? '');
  const setCareSharing = useAppStore((s) => s.setCareSharing);

  const [role, setRole] = useState<Role>(Number(params.role) === Role.PRESCRIBER ? Role.PRESCRIBER : Role.PHARMACY);
  const [scopes, setScopes] = useState<number>(DEFAULT_SCOPES[role]);
  const [days, setDays] = useState<number>(180);
  const [preview, setPreview] = useState<SummaryJson | null>(null);
  const [invite, setInvite] = useState<InviteJson | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setScopes(DEFAULT_SCOPES[role]);
    setPreview(null);
    setInvite(null);
  }, [role]);

  // Countdown for the invite's expiry.
  useEffect(() => {
    if (!invite) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [invite]);

  if (!session) {
    return (
      <Screen edges={['bottom']}>
        <CloudAccountRequired what="Connecting a provider" />
      </Screen>
    );
  }

  /** Share the latest snapshot first, so the provider sees today's list. */
  const shareNow = (token: string) => care.share(token, buildSnapshot(displayName, meds, logs));

  const showPreview = async () => {
    setNote(null);
    try {
      const summary = await run(async (t) => {
        await shareNow(t);
        return care.summary(t, 'patient', session.userId, scopes);
      });
      setPreview(summary);
    } catch (err) {
      setNote(errorMessage(err));
    }
  };

  const create = async () => {
    setBusy(true);
    setNote(null);
    try {
      const result = await run(async (t) => {
        await shareNow(t);
        return care.createInvite(t, { role, scopes, grantDays: days });
      });
      setCareSharing(true);
      setInvite(result);
    } catch (err) {
      setNote(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (flag: number) => {
    if (flag === Scope.READ_MEDS) return; // always included
    setScopes((s) => s ^ flag);
    setPreview(null);
    setInvite(null);
  };

  const who = role === Role.PHARMACY ? 'pharmacy' : 'doctor';
  const link = invite?.token ? inviteLink(Linking.createURL('/network/provider'), invite.token) : null;
  const secondsLeft = invite?.expiresAtMs ? Math.max(0, Math.round((invite.expiresAtMs - now) / 1000)) : 0;

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: role === Role.PHARMACY ? 'Connect a pharmacy' : 'Connect a doctor' }} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Notice message={note} tone="high" />

        <Card>
          <SectionLabel>Who are you connecting?</SectionLabel>
          <View style={styles.chips}>
            <Chip label="Pharmacy" active={role === Role.PHARMACY} onPress={() => setRole(Role.PHARMACY)} />
            <Chip label="Doctor or prescriber" active={role === Role.PRESCRIBER} onPress={() => setRole(Role.PRESCRIBER)} />
          </View>
        </Card>

        <Card>
          <SectionLabel>What they can see</SectionLabel>
          {scopesFor(role).map((s) => (
            <View key={s.flag} style={styles.scope}>
              <View style={styles.flex}>
                <Text style={[styles.scopeTitle, { color: theme.text }]}>{s.label}</Text>
                <Text style={[styles.scopeDetail, { color: theme.textSecondary }]}>{s.detail}</Text>
              </View>
              <Switch
                value={(scopes & s.flag) !== 0}
                disabled={s.flag === Scope.READ_MEDS}
                onValueChange={() => toggle(s.flag)}
                accessibilityLabel={s.label}
              />
            </View>
          ))}
          <SectionLabel>For how long</SectionLabel>
          <View style={styles.chips}>
            {DURATIONS.map((d) => (
              <Chip key={d} label={d === 365 ? '1 year' : `${d} days`} active={days === d} onPress={() => setDays(d)} />
            ))}
          </View>
          <View style={{ height: Spacing.three }} />
          <Button title={`Preview what the ${who} will see`} variant="secondary" onPress={showPreview} />
        </Card>

        {preview ? (
          <Card>
            <SectionLabel>Exactly what they will see</SectionLabel>
            {(preview.med ?? []).length === 0 ? (
              <Muted>Your medication list is empty.</Muted>
            ) : (
              (preview.med ?? []).map((m) => (
                <View key={m.medId} style={styles.previewRow}>
                  <Text style={[styles.scopeTitle, { color: theme.text }]}>
                    {m.name}
                    {m.strength ? ` ${m.strength}` : ''}
                  </Text>
                  <Text style={[styles.scopeDetail, { color: theme.textSecondary }]}>
                    {[
                      m.level !== undefined && refillLevelLabel(m.level, m.daysLeft),
                      m.selfAdherencePct !== undefined && `${m.selfAdherencePct}% of doses taken`,
                      m.dosesLate !== undefined && `${m.dosesLate} late`,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Name only'}
                  </Text>
                </View>
              ))
            )}
          </Card>
        ) : null}

        {invite && link ? (
          <Card style={styles.center}>
            <SectionLabel>Show this to your {who}</SectionLabel>
            <QrCode value={link} />
            <Muted>
              {secondsLeft > 0
                ? `Works once, for ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')} more.`
                : 'This invite has expired. Create a new one.'}
            </Muted>
            <View style={styles.buttons}>
              <Button
                title="Send link instead"
                variant="secondary"
                style={styles.flex}
                onPress={() => shareText(`Connect to my Dosely record (one-time link): ${link}`, 'Dosely care invite')}
              />
            </View>
          </Card>
        ) : (
          <Button title={`Create invite for my ${who}`} loading={busy} onPress={create} />
        )}

        <Text style={[styles.fine, { color: theme.textSecondary }]}>
          You can remove access at any time from Care network. Removing access takes effect immediately.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.four, gap: Spacing.three },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginBottom: Spacing.two },
  scope: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginBottom: Spacing.three },
  scopeTitle: { fontSize: 15, fontWeight: '600' },
  scopeDetail: { fontSize: 13, lineHeight: 18 },
  previewRow: { marginBottom: Spacing.two },
  center: { alignItems: 'center', gap: Spacing.three },
  buttons: { flexDirection: 'row', gap: Spacing.two, alignSelf: 'stretch' },
  fine: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
});
