import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { CloudAccountRequired } from '@/features/auth/cloud-account-required';
import { formatDay, isValidNpi, riskLabel, rxStatusLabel, workLabel } from '@/features/care/care';
import { Badge, Chip, ListRow, Muted, Notice, SectionLabel } from '@/features/care/components/care-ui';
import { useCareSession } from '@/features/care/use-care';
import { errorMessage, useLoad } from '@/features/care/use-load';
import { useTheme } from '@/hooks/use-theme';
import { care, CareError, tokenFromInput, type CareRole } from '@/lib/care/care-client';
import { Role, RxStatus, WorkKind, type ProviderJson, type WorkJson } from '@/lib/care/protocol.gen';

/**
 * The pharmacy / prescriber side of the network: a worklist that surfaces who
 * needs help (running out, falling behind, new prescriptions), connected
 * patients, and the prescription queue.
 */
export default function ProviderPortalScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ redeem?: string }>();
  const { session, run } = useCareSession();
  const [note, setNote] = useState<string | null>(null);
  const [code, setCode] = useState('');

  // A scanned or opened invite link pre-fills the code; connecting still takes a deliberate tap.
  useEffect(() => {
    if (params.redeem) setCode(params.redeem);
  }, [params.redeem]);

  const { data, error, reload } = useLoad(async () => {
    if (!session) return null;
    let provider: ProviderJson | null = null;
    try {
      provider = await care.myProvider(session.token);
    } catch (err) {
      if (!(err instanceof CareError && err.code === 'NOT_FOUND')) throw err;
    }
    if (!provider) return { provider: null };
    const role: CareRole = provider.role === Role.PRESCRIBER ? 'prescriber' : 'pharmacy';
    const [work, patients, prescriptions] = await Promise.all([
      care.worklist(session.token, role),
      care.patients(session.token, role),
      care.prescriptions(session.token, role),
    ]);
    return { provider, role, work, patients, prescriptions };
  }, [session?.token]);

  if (!session) {
    return (
      <Screen edges={['bottom']}>
        <CloudAccountRequired what="The provider portal" />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen edges={['bottom']}>
        <View style={styles.content}>
          <Notice message={error ?? 'Loading…'} tone={error ? 'high' : 'muted'} />
        </View>
      </Screen>
    );
  }
  if (!data.provider) return <Register onDone={reload} />;

  const { provider, role, work = [], patients = [], prescriptions = [] } = data;

  const connect = async () => {
    const token = tokenFromInput(code);
    if (!token) {
      setNote("That doesn't look like a Dosely invite. Paste the whole link, or scan the patient's code.");
      return;
    }
    try {
      const grant = await run((t) => care.redeemInvite(t, role!, token));
      setCode('');
      router.setParams({ redeem: undefined });
      setNote(`Connected to ${grant.patientName || 'your patient'}.`);
      await reload();
    } catch (err) {
      setNote(errorMessage(err));
    }
  };

  const openWork = (w: WorkJson) => {
    if (w.kind === WorkKind.NEW_RX && w.rxId) {
      router.push({ pathname: '/network/rx/[id]', params: { id: w.rxId, as: role! } });
    } else {
      router.push({ pathname: '/network/provider/patient/[id]', params: { id: w.patientId!, as: role! } });
    }
  };

  const queue = prescriptions.filter((p) => p.status !== RxStatus.PICKED_UP && p.status !== RxStatus.CANCELLED);

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Notice message={note ?? error} tone={error && !note ? 'high' : 'info'} />

        <Card>
          <View style={styles.headRow}>
            <View style={styles.flex}>
              <Text style={[styles.title, { color: theme.text }]}>{provider.name}</Text>
              <Muted>
                {role === 'pharmacy' ? 'Pharmacy' : 'Prescriber'}
                {provider.org ? ` · ${provider.org}` : ''} · NPI {provider.npi}
              </Muted>
            </View>
            <Badge label={provider.verified ? 'Verified' : 'Verification pending'} tone={provider.verified ? 'ok' : 'watch'} />
          </View>
          {!provider.verified ? (
            <Muted>
              You can connect with patients now. Sending prescriptions unlocks once your identity and license are verified.
            </Muted>
          ) : null}
        </Card>

        <Card>
          <SectionLabel>Connect a patient</SectionLabel>
          <TextField placeholder="Paste the patient's invite link" value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} />
          <View style={styles.buttons}>
            <Button title="Scan code" variant="secondary" style={styles.flex} onPress={() => router.push('/network/provider/scan')} />
            <Button title="Connect" style={styles.flex} disabled={!code.trim()} onPress={connect} />
          </View>
        </Card>

        <Card>
          <SectionLabel>Needs attention</SectionLabel>
          {work.length === 0 ? (
            <Muted>All caught up. Patients running low or falling behind will appear here.</Muted>
          ) : (
            work.map((w, i) => (
              <ListRow
                key={`${w.kind}-${w.patientId}-${w.medId ?? w.rxId ?? i}`}
                icon={w.kind === WorkKind.NEW_RX ? 'document-text' : w.kind === WorkKind.MED_SYNC ? 'calendar' : 'alert-circle'}
                title={`${workLabel(w.kind)} · ${w.patientName || 'Patient'}`}
                subtitle={[w.medName, w.detail, w.dueDay ? formatDay(w.dueDay) : null].filter(Boolean).join(' · ')}
                onPress={() => openWork(w)}
              />
            ))
          )}
        </Card>

        {role === 'pharmacy' ? (
          <Card>
            <SectionLabel>Prescription queue</SectionLabel>
            {queue.length === 0 ? (
              <Muted>No open prescriptions.</Muted>
            ) : (
              queue.map((rx) => (
                <ListRow
                  key={rx.id}
                  icon="medical"
                  title={`${rx.drugName}${rx.strength ? ` ${rx.strength}` : ''}`}
                  subtitle={`${rx.patientName ?? 'Patient'} · ${rxStatusLabel(rx.status)}${rx.signatureValid ? '' : ' · signature invalid'}`}
                  onPress={() => router.push({ pathname: '/network/rx/[id]', params: { id: rx.id!, as: 'pharmacy' } })}
                />
              ))
            )}
          </Card>
        ) : null}

        <Card>
          <SectionLabel>Patients</SectionLabel>
          {patients.length === 0 ? (
            <Muted>No connected patients yet. Patients connect by sharing an invite with you.</Muted>
          ) : (
            patients.map((p) => {
              const risk = riskLabel(p.riskScore);
              return (
                <ListRow
                  key={p.id}
                  icon="person"
                  title={p.displayName || 'Patient (nothing shared yet)'}
                  subtitle={p.updatedAtMs ? `Updated ${new Date(p.updatedAtMs).toLocaleDateString()}` : undefined}
                  right={<Badge label={risk.label} tone={risk.tone} />}
                  onPress={() => router.push({ pathname: '/network/provider/patient/[id]', params: { id: p.id!, as: role! } })}
                />
              );
            })
          )}
        </Card>

        <Text style={[styles.fine, { color: theme.textSecondary }]}>
          Access is limited to what each patient chose to share and is logged with your identity and purpose.
        </Text>
      </ScrollView>
    </Screen>
  );
}

/** First visit: register the pharmacy or practice this account represents. */
function Register({ onDone }: { onDone: () => void }) {
  const { run } = useCareSession();
  const [role, setRole] = useState<Role>(Role.PHARMACY);
  const [name, setName] = useState('');
  const [org, setOrg] = useState('');
  const [npi, setNpi] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const npiError = npi.length === 10 && !isValidNpi(npi) ? 'That NPI fails its check digit.' : undefined;

  const submit = async () => {
    setBusy(true);
    setNote(null);
    try {
      await run((t) => care.registerProvider(t, { role, name: name.trim(), org: org.trim() || undefined, npi }));
      onDone();
    } catch (err) {
      setNote(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <SectionLabel>Register your practice</SectionLabel>
          <Muted>Patients connect with you by invitation. Your National Provider Identifier (NPI) identifies you to them.</Muted>
          <View style={[styles.buttons, { marginBottom: Spacing.three }]}>
            <Chip label="Pharmacy" active={role === Role.PHARMACY} onPress={() => setRole(Role.PHARMACY)} />
            <Chip label="Prescriber" active={role === Role.PRESCRIBER} onPress={() => setRole(Role.PRESCRIBER)} />
          </View>
          <TextField label={role === Role.PHARMACY ? 'Pharmacy name' : 'Your name'} value={name} onChangeText={setName} />
          <TextField label={role === Role.PHARMACY ? 'Chain or organization (optional)' : 'Practice (optional)'} value={org} onChangeText={setOrg} />
          <TextField
            label="NPI"
            value={npi}
            onChangeText={(t) => setNpi(t.replace(/\D/g, '').slice(0, 10))}
            keyboardType="number-pad"
            error={npiError}
          />
          <Notice message={note} tone="high" />
          <Button title="Register" loading={busy} disabled={!name.trim() || !isValidNpi(npi)} onPress={submit} />
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.four, gap: Spacing.three },
  flex: { flex: 1 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginBottom: Spacing.two },
  title: { fontSize: 18, fontWeight: '700' },
  buttons: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  fine: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
});
