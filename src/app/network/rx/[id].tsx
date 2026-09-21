import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import { dateKey } from '@/features/adherence/dates';
import { CloudAccountRequired } from '@/features/auth/cloud-account-required';
import {
  formatUnits,
  linkedMed,
  pendingPickup,
  refillsLeft,
  rxActions,
  rxStatusLabel,
  supplyAfterPickup,
} from '@/features/care/care';
import { Badge, Muted, Notice, SectionLabel } from '@/features/care/components/care-ui';
import { useCareSession } from '@/features/care/use-care';
import { errorMessage, useLoad } from '@/features/care/use-load';
import { useTheme } from '@/hooks/use-theme';
import { care, type CareRole } from '@/lib/care/care-client';
import { Role, RxStatus } from '@/lib/care/protocol.gen';
import { useAppStore } from '@/store/app-store';

const ROLE_OF: Record<CareRole, Role> = { patient: Role.PATIENT, pharmacy: Role.PHARMACY, prescriber: Role.PRESCRIBER };

/** One prescription, as the patient, pharmacy or prescriber sees it. */
export default function PrescriptionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; as?: string }>();
  const as: CareRole = params.as === 'pharmacy' || params.as === 'prescriber' ? params.as : 'patient';
  const { session, run } = useCareSession();
  const meds = useAppStore((s) => s.medications);
  const updateMedication = useAppStore((s) => s.updateMedication);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const { data: rx, error, setData } = useLoad(async () => {
    if (!session || !params.id) return null;
    return care.prescription(session.token, as, params.id);
  }, [session?.token, params.id, as]);

  if (!session) {
    return (
      <Screen edges={['bottom']}>
        <CloudAccountRequired what="Prescriptions" />
      </Screen>
    );
  }
  if (!rx) {
    return (
      <Screen edges={['bottom']}>
        <View style={styles.content}>
          <Notice message={error ?? 'Loading…'} tone={error ? 'high' : 'muted'} />
        </View>
      </Screen>
    );
  }

  const left = refillsLeft(rx.refills, rx.refillsUsed);
  const actions = rxActions(rx.status ?? 0, ROLE_OF[as], left);
  const med = as === 'patient' ? linkedMed(meds, rx) : undefined;
  const pickup = pendingPickup(med, rx);

  const act = async (status: number) => {
    setBusy(status);
    setNote(null);
    try {
      setData(await run((t) => care.setRxStatus(t, as, rx.id!, status)));
      if (status === RxStatus.SENT) setNote('Refill requested — your pharmacy has been notified.');
    } catch (err) {
      setNote(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const addPickup = () => {
    if (!med || !pickup) return;
    const { id: _id, createdAt: _created, ...rest } = med;
    updateMedication(med.id, { ...rest, ...supplyAfterPickup(med, pickup, dateKey(new Date())) });
    setNote(`Added ${formatUnits(rx.quantityMilli ?? 0)} to your ${med.name} supply.`);
  };

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Notice message={note} />

        <Card>
          <View style={styles.headRow}>
            <Text style={[styles.drug, { color: theme.text }]}>
              {rx.drugName}
              {rx.strength ? ` ${rx.strength}` : ''}
            </Text>
            <Badge
              label={rxStatusLabel(rx.status)}
              tone={rx.status === RxStatus.READY ? 'ok' : rx.status === RxStatus.CANCELLED ? 'muted' : 'info'}
            />
          </View>
          {rx.form ? <Muted>{rx.form}</Muted> : null}
          <Text style={[styles.sig, { color: theme.text }]}>{rx.sig}</Text>
          <Muted>
            Quantity {formatUnits(rx.quantityMilli ?? 0)} · {rx.daysSupply} days · {left} refill{left === 1 ? '' : 's'} left
          </Muted>
        </Card>

        <Card>
          <View style={styles.signed}>
            <Ionicons
              name={rx.signatureValid ? 'shield-checkmark' : 'warning'}
              size={22}
              color={rx.signatureValid ? theme.success : theme.danger}
            />
            <View style={styles.flex}>
              <Text style={[styles.label, { color: theme.text }]}>
                {rx.signatureValid ? `Signed by ${rx.prescriberName ?? 'the prescriber'}` : 'Signature could not be verified'}
              </Text>
              <Muted>
                {rx.signatureValid
                  ? 'Digitally signed when written; any change since would break the signature.'
                  : 'Do not dispense. The prescription may have been altered.'}
              </Muted>
            </View>
          </View>
          {rx.patientName && as !== 'patient' ? <Muted>Patient: {rx.patientName}</Muted> : null}
          {rx.pharmacyName ? <Muted>Pharmacy: {rx.pharmacyName}</Muted> : null}
        </Card>

        <Card>
          <SectionLabel>History</SectionLabel>
          {(rx.history ?? []).map((e, i) => (
            <View key={`${e.atMs}-${i}`} style={styles.event}>
              <View style={[styles.dot, { backgroundColor: theme.tint }]} />
              <Text style={[styles.flex, { color: theme.text }]}>{rxStatusLabel(e.status)}</Text>
              <Text style={{ color: theme.textSecondary }}>{e.atMs ? new Date(e.atMs).toLocaleString() : ''}</Text>
            </View>
          ))}
        </Card>

        {as === 'patient' && !med ? (
          <Button
            title="Add to my medications"
            variant="secondary"
            onPress={() =>
              router.push({
                pathname: '/medication/new',
                params: {
                  source: 'rx',
                  careRxId: rx.id!,
                  name: rx.drugName ?? '',
                  strength: rx.strength ?? '',
                  form: rx.form ?? '',
                  sig: rx.sig ?? '',
                },
              })
            }
          />
        ) : null}
        {pickup ? <Button title={`Add ${formatUnits(rx.quantityMilli ?? 0)} to my supply`} onPress={addPickup} /> : null}

        {actions.map((a) => (
          <Button
            key={a.status}
            title={a.label}
            variant={a.destructive ? 'ghost' : 'primary'}
            loading={busy === a.status}
            onPress={() => act(a.status)}
          />
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.four, gap: Spacing.three },
  flex: { flex: 1 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  drug: { flex: 1, fontSize: 20, fontWeight: '800' },
  sig: { fontSize: 16, lineHeight: 22, marginVertical: Spacing.two },
  signed: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start', marginBottom: Spacing.two },
  label: { fontSize: 15, fontWeight: '700' },
  event: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
