import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import { rxStatusLabel, scopeLabels } from '@/features/care/care';
import { Badge, ListRow, Muted, Notice, SectionLabel, SignInRequired } from '@/features/care/components/care-ui';
import { useCareSession } from '@/features/care/use-care';
import { errorMessage, useLoad } from '@/features/care/use-load';
import { useTheme } from '@/hooks/use-theme';
import { care } from '@/lib/care/care-client';
import { Role, RxStatus } from '@/lib/care/protocol.gen';
import { useAppStore } from '@/store/app-store';

/**
 * The patient's care network: who can see their record (and exactly what),
 * prescriptions on their way, and full control — revoke anyone, see every
 * access, or erase everything shared.
 */
export default function CareNetworkScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session, run } = useCareSession();
  const sharing = useAppStore((s) => s.careSharing);
  const setCareSharing = useAppStore((s) => s.setCareSharing);
  const [note, setNote] = useState<string | null>(null);
  const [confirmErase, setConfirmErase] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data, error, reload } = useLoad(async () => {
    if (!session) return null;
    const [grants, prescriptions] = await Promise.all([
      care.grants(session.token),
      care.prescriptions(session.token, 'patient'),
    ]);
    return { grants, prescriptions };
  }, [session?.token]);

  if (!session) {
    return (
      <Screen edges={['bottom']}>
        <SignInRequired what="The care network" />
      </Screen>
    );
  }

  const revoke = async (grantId: string, name: string) => {
    try {
      await run((t) => care.revokeGrant(t, 'patient', grantId));
      setNote(`${name} can no longer see your record.`);
      await reload();
    } catch (err) {
      setNote(errorMessage(err));
    }
  };

  const erase = async () => {
    setBusy(true);
    try {
      await run((t) => care.erase(t));
      setCareSharing(false);
      setConfirmErase(false);
      setNote('Your shared data was erased and its encryption keys destroyed.');
      await reload();
    } catch (err) {
      setNote(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const grants = data?.grants ?? [];
  const prescriptions = data?.prescriptions ?? [];
  const ready = prescriptions.filter((p) => p.status === RxStatus.READY);

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Notice message={note ?? error} tone={error && !note ? 'high' : 'info'} />

        <Card>
          <Text style={[styles.title, { color: theme.text }]}>Your pharmacy and doctors, connected</Text>
          <Muted>
            Share your medication list with the people who care for you. You choose exactly what each one sees, it is
            encrypted with a key only for you, and every view is recorded.
          </Muted>
          <View style={styles.status}>
            <Badge label={sharing ? 'Sharing on — updates automatically' : 'Not sharing yet'} tone={sharing ? 'ok' : 'muted'} />
          </View>
          <View style={styles.buttons}>
            <Button
              title="Connect a pharmacy"
              style={styles.flex}
              onPress={() => router.push({ pathname: '/network/connect', params: { role: String(Role.PHARMACY) } })}
            />
            <Button
              title="Connect a doctor"
              variant="secondary"
              style={styles.flex}
              onPress={() => router.push({ pathname: '/network/connect', params: { role: String(Role.PRESCRIBER) } })}
            />
          </View>
        </Card>

        {ready.length > 0 ? (
          <Card>
            <Text style={[styles.title, { color: theme.success }]}>Ready for pickup</Text>
            {ready.map((rx) => (
              <ListRow
                key={rx.id}
                icon="bag-check"
                title={`${rx.drugName}${rx.strength ? ` ${rx.strength}` : ''}`}
                subtitle={rx.pharmacyName ? `at ${rx.pharmacyName}` : undefined}
                onPress={() => router.push({ pathname: '/network/rx/[id]', params: { id: rx.id!, as: 'patient' } })}
              />
            ))}
          </Card>
        ) : null}

        <Card>
          <SectionLabel>Prescriptions</SectionLabel>
          {prescriptions.length === 0 ? (
            <Muted>When a connected doctor sends a prescription to your pharmacy, you can follow it here.</Muted>
          ) : (
            prescriptions.map((rx) => (
              <ListRow
                key={rx.id}
                icon="document-text"
                title={`${rx.drugName}${rx.strength ? ` ${rx.strength}` : ''}`}
                subtitle={[rxStatusLabel(rx.status), rx.prescriberName && `from ${rx.prescriberName}`].filter(Boolean).join(' · ')}
                onPress={() => router.push({ pathname: '/network/rx/[id]', params: { id: rx.id!, as: 'patient' } })}
              />
            ))
          )}
        </Card>

        <Card>
          <SectionLabel>Who can see your record</SectionLabel>
          {grants.length === 0 ? (
            <Muted>No one yet. Connect your pharmacy or doctor above.</Muted>
          ) : (
            grants.map((g) => {
              const name = g.providerName ?? 'Provider';
              const until = g.expiresAtMs ? new Date(g.expiresAtMs).toLocaleDateString() : '';
              return (
                <View key={g.id} style={styles.grant}>
                  <ListRow
                    icon={g.providerRole === Role.PHARMACY ? 'storefront' : 'medkit'}
                    title={name}
                    subtitle={`${scopeLabels(g.scopes ?? 0).join(', ')}${until ? ` · until ${until}` : ''}`}
                    right={g.providerVerified ? <Badge label="Verified" tone="ok" /> : <Badge label="Unverified" tone="watch" />}
                  />
                  <Button title="Remove access" variant="ghost" onPress={() => revoke(g.id!, name)} />
                </View>
              );
            })
          )}
        </Card>

        <Card>
          <ListRow
            icon="eye"
            title="Who viewed my record"
            subtitle="Every view, prescription and connection — including refused attempts."
            onPress={() => router.push('/network/activity')}
          />
          <ListRow
            icon="business"
            title="I'm a pharmacist or prescriber"
            subtitle="Open the provider portal."
            onPress={() => router.push('/network/provider')}
          />
        </Card>

        <Card>
          <SectionLabel>Delete shared data</SectionLabel>
          <Muted>
            Removes everyone&apos;s access and destroys the key that encrypts your shared record, so it can never be
            read again. Your medications on this device are not affected.
          </Muted>
          <View style={{ height: Spacing.three }} />
          {confirmErase ? (
            <View style={styles.buttons}>
              <Button title="Cancel" variant="secondary" style={styles.flex} onPress={() => setConfirmErase(false)} />
              <Button title="Erase for good" variant="danger" style={styles.flex} loading={busy} onPress={erase} />
            </View>
          ) : (
            <Button title="Erase my shared data" variant="ghost" onPress={() => setConfirmErase(true)} />
          )}
        </Card>

        <Text style={[styles.fine, { color: theme.textSecondary }]}>
          Pilot network — not a certified e-prescribing system. Controlled substances are not supported.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.four, gap: Spacing.three },
  flex: { flex: 1 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: Spacing.two },
  status: { flexDirection: 'row', marginTop: Spacing.three },
  buttons: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three },
  grant: { marginBottom: Spacing.two },
  fine: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
});
