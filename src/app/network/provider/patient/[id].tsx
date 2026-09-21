import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import {
  formatDay,
  formatUnits,
  refillLevelLabel,
  riskLabel,
  riskReasons,
  rxStatusLabel,
  scopeLabels,
} from '@/features/care/care';
import { Badge, ListRow, Muted, Notice, SectionLabel, SignInRequired } from '@/features/care/components/care-ui';
import { useCareSession } from '@/features/care/use-care';
import { useLoad } from '@/features/care/use-load';
import { useTheme } from '@/hooks/use-theme';
import { care, type CareRole } from '@/lib/care/care-client';
import { RefillLevel, Scope, type MedSummaryJson } from '@/lib/care/protocol.gen';

/** A connected patient, as their pharmacy or prescriber is allowed to see them. */
export default function ProviderPatientScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; as?: string }>();
  const as: CareRole = params.as === 'prescriber' ? 'prescriber' : 'pharmacy';
  const { session } = useCareSession();

  const { data, error } = useLoad(async () => {
    if (!session || !params.id) return null;
    const [summary, prescriptions] = await Promise.all([
      care.summary(session.token, as, params.id),
      care.prescriptions(session.token, as, { patientId: params.id }),
    ]);
    return { summary, prescriptions };
  }, [session?.token, params.id, as]);

  if (!session) {
    return (
      <Screen edges={['bottom']}>
        <SignInRequired what="Patient records" />
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

  const { summary, prescriptions } = data;
  const scopes = summary.scopes ?? 0;
  const risk = riskLabel(summary.riskScore);
  const reasons = riskReasons(summary.riskReasons);
  const canPrescribe = as === 'prescriber' && (scopes & Scope.PRESCRIBE) !== 0;

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: summary.displayName || 'Patient' }} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card>
          <View style={styles.headRow}>
            <Text style={[styles.title, { color: theme.text }]}>{summary.displayName || 'Patient'}</Text>
            {summary.riskScore !== undefined ? <Badge label={risk.label} tone={risk.tone} /> : null}
          </View>
          {reasons.length ? <Muted>Why: {reasons.join(', ')}</Muted> : null}
          <Muted>Shared with you: {scopeLabels(scopes).join(', ')}</Muted>
          {summary.updatedAtMs ? <Muted>Last updated {new Date(summary.updatedAtMs).toLocaleString()}</Muted> : null}
        </Card>

        {summary.sync ? (
          <Card>
            <SectionLabel>Med sync opportunity</SectionLabel>
            <Muted>
              Align refills to one pickup on {formatDay(summary.sync.syncDay ?? 0)} with short fills:
            </Muted>
            {(summary.sync.shortFill ?? []).map((s) => (
              <Text key={s.medId} style={[styles.item, { color: theme.text }]}>
                • {s.name}: {s.days} days ({formatUnits(s.unitsMilli ?? 0)} units)
              </Text>
            ))}
          </Card>
        ) : null}

        <Card>
          <SectionLabel>Medications</SectionLabel>
          {(summary.med ?? []).length === 0 ? <Muted>No medications shared.</Muted> : null}
          {(summary.med ?? []).map((m) => (
            <MedRow key={m.medId} med={m} />
          ))}
        </Card>

        <Card>
          <SectionLabel>Prescriptions</SectionLabel>
          {prescriptions.length === 0 ? (
            <Muted>None yet.</Muted>
          ) : (
            prescriptions.map((rx) => (
              <ListRow
                key={rx.id}
                icon="document-text"
                title={`${rx.drugName}${rx.strength ? ` ${rx.strength}` : ''}`}
                subtitle={rxStatusLabel(rx.status)}
                onPress={() => router.push({ pathname: '/network/rx/[id]', params: { id: rx.id!, as } })}
              />
            ))
          )}
        </Card>

        {canPrescribe ? (
          <Button
            title="Write a prescription"
            onPress={() => router.push({ pathname: '/network/provider/prescribe', params: { patientId: params.id } })}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function MedRow({ med: m }: { med: MedSummaryJson }) {
  const theme = useTheme();
  const tone = m.level === RefillLevel.OUT ? 'high' : m.level === RefillLevel.SOON ? 'watch' : 'muted';
  const facts = [
    m.pdcValid && m.pdcPermille !== undefined ? `Days covered ${Math.round(m.pdcPermille / 10)}%` : null,
    m.selfAdherencePct !== undefined ? `Took ${m.selfAdherencePct}% of doses` : null,
    m.dosesLate ? `${m.dosesLate} late${m.avgDelayMin ? `, avg ${m.avgDelayMin} min` : ''}` : null,
    m.runOutDay ? `Runs out ${formatDay(m.runOutDay)}` : null,
    m.fillCount ? `${m.fillCount} fill${m.fillCount === 1 ? '' : 's'}` : null,
  ].filter(Boolean);

  return (
    <View style={[styles.med, { borderColor: theme.border }]}>
      <View style={styles.headRow}>
        <Text style={[styles.medName, { color: theme.text }]}>
          {m.name}
          {m.strength ? ` ${m.strength}` : ''}
        </Text>
        {m.level !== undefined ? <Badge label={refillLevelLabel(m.level, m.daysLeft)} tone={tone} /> : null}
      </View>
      {facts.length ? <Muted>{facts.join(' · ')}</Muted> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.four, gap: Spacing.three },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  title: { flex: 1, fontSize: 20, fontWeight: '800', marginBottom: Spacing.one },
  item: { fontSize: 14, lineHeight: 22 },
  med: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: Spacing.two, gap: 2 },
  medName: { flex: 1, fontSize: 16, fontWeight: '600' },
});
