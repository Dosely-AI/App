import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { Chip, Muted, Notice, SectionLabel, SignInRequired } from '@/features/care/components/care-ui';
import { useCareSession } from '@/features/care/use-care';
import { errorMessage, useLoad } from '@/features/care/use-load';
import { DrugNameField } from '@/features/medications/components/drug-name-field';
import { useTheme } from '@/hooks/use-theme';
import { care } from '@/lib/care/care-client';

/** Whole or decimal units -> positive integer milli-units, or null. */
function toMilli(text: string): number | null {
  const n = Number(text);
  return Number.isFinite(n) && n > 0 && n <= 100_000 ? Math.round(n * 1000) : null;
}

/**
 * Write and send a prescription to the pharmacy the patient chose. It is
 * signed with this prescriber's key inside the vault; sending asks the
 * prescriber to confirm it's them (passkey) if they haven't just signed in.
 */
export default function PrescribeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  const { session, run } = useCareSession();

  const [medId, setMedId] = useState<string | null>(null);
  const [drugName, setDrugName] = useState('');
  const [rxcui, setRxcui] = useState<string | null>(null);
  const [strength, setStrength] = useState('');
  const [form, setForm] = useState('');
  const [sig, setSig] = useState('');
  const [quantity, setQuantity] = useState('30');
  const [daysSupply, setDaysSupply] = useState('30');
  const [refills, setRefills] = useState(0);
  const [pharmacyId, setPharmacyId] = useState<string | null>(null);
  const [controlled, setControlled] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: summary, error } = useLoad(async () => {
    if (!session || !patientId) return null;
    const s = await care.summary(session.token, 'prescriber', patientId);
    if (s.pharmacy?.length === 1) setPharmacyId(s.pharmacy[0].id ?? null);
    return s;
  }, [session?.token, patientId]);

  if (!session) {
    return (
      <Screen edges={['bottom']}>
        <SignInRequired what="Prescribing" />
      </Screen>
    );
  }

  const quantityMilli = toMilli(quantity);
  const days = Number(daysSupply);
  const valid =
    drugName.trim() && sig.trim() && quantityMilli && Number.isInteger(days) && days >= 1 && days <= 365 && pharmacyId && !controlled;

  const send = async () => {
    if (!valid || !patientId || !pharmacyId || !quantityMilli) return;
    setBusy(true);
    setNote(null);
    try {
      const rx = await run((t) =>
        care.prescribe(t, {
          patientId,
          pharmacyId,
          medId: medId ?? undefined,
          drugName: drugName.trim(),
          rxcui: rxcui ?? undefined,
          strength: strength.trim() || undefined,
          form: form.trim() || undefined,
          sig: sig.trim(),
          quantityMilli,
          daysSupply: days,
          refills,
          controlled: false,
        }),
      );
      router.replace({ pathname: '/network/rx/[id]', params: { id: rx.id!, as: 'prescriber' } });
    } catch (err) {
      setNote(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const pharmacies = summary?.pharmacy ?? [];

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Notice message={note ?? error} tone="high" />

        {summary?.med?.length ? (
          <Card>
            <SectionLabel>Continue a current medication</SectionLabel>
            <View style={styles.chips}>
              {summary.med.map((m) => (
                <Chip
                  key={m.medId}
                  label={`${m.name}${m.strength ? ` ${m.strength}` : ''}`}
                  active={medId === m.medId}
                  onPress={() => {
                    const same = medId === m.medId;
                    setMedId(same ? null : m.medId ?? null);
                    setDrugName(same ? '' : m.name ?? '');
                    setStrength(same ? '' : m.strength ?? '');
                    setForm(same ? '' : m.form ?? '');
                    setRxcui(null);
                  }}
                />
              ))}
            </View>
          </Card>
        ) : null}

        <Card>
          <SectionLabel>Prescription</SectionLabel>
          {medId ? (
            <Text style={[styles.drug, { color: theme.text }]}>{drugName}</Text>
          ) : (
            <DrugNameField
              value={drugName}
              onSelect={(name, cui) => {
                setDrugName(name);
                setRxcui(cui);
              }}
            />
          )}
          <View style={styles.pair}>
            <View style={styles.flex}>
              <TextField label="Strength" placeholder="20 mg" value={strength} onChangeText={setStrength} />
            </View>
            <View style={styles.flex}>
              <TextField label="Form" placeholder="tablet" value={form} onChangeText={setForm} />
            </View>
          </View>
          <TextField label="Directions (sig)" placeholder="Take 1 tablet by mouth at bedtime" value={sig} onChangeText={setSig} multiline />
          <View style={styles.pair}>
            <View style={styles.flex}>
              <TextField label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
            </View>
            <View style={styles.flex}>
              <TextField label="Days supply" value={daysSupply} onChangeText={setDaysSupply} keyboardType="number-pad" />
            </View>
          </View>
          <SectionLabel>Refills</SectionLabel>
          <View style={styles.chips}>
            {[0, 1, 2, 3, 5, 11].map((n) => (
              <Chip key={n} label={String(n)} active={refills === n} onPress={() => setRefills(n)} />
            ))}
          </View>
          <View style={styles.controlled}>
            <View style={styles.flex}>
              <Text style={[styles.label, { color: theme.text }]}>Controlled substance</Text>
              <Muted>Schedule II–V drugs need a DEA-certified e-prescribing system.</Muted>
            </View>
            <Switch value={controlled} onValueChange={setControlled} accessibilityLabel="Controlled substance" />
          </View>
          {controlled ? (
            <Notice
              tone="watch"
              message="This network can't send controlled-substance prescriptions. Use your EHR's certified EPCS workflow."
            />
          ) : null}
        </Card>

        <Card>
          <SectionLabel>Send to</SectionLabel>
          {pharmacies.length === 0 ? (
            <Muted>The patient hasn&apos;t connected a pharmacy that can receive prescriptions yet.</Muted>
          ) : (
            <View style={styles.chips}>
              {pharmacies.map((p) => (
                <Chip
                  key={p.id}
                  label={`${p.name}${p.verified ? '' : ' (unverified)'}`}
                  active={pharmacyId === p.id}
                  onPress={() => setPharmacyId(p.id ?? null)}
                />
              ))}
            </View>
          )}
        </Card>

        <Button title="Sign and send" loading={busy} disabled={!valid} onPress={send} />
        <Text style={[styles.fine, { color: theme.textSecondary }]}>
          Pilot network — not a certified e-prescribing system. Confirm clinical details before sending.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.four, gap: Spacing.three },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginBottom: Spacing.two },
  pair: { flexDirection: 'row', gap: Spacing.two },
  drug: { fontSize: 18, fontWeight: '700', marginBottom: Spacing.two },
  label: { fontSize: 15, fontWeight: '600' },
  controlled: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.two },
  fine: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
});
