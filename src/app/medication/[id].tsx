import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';

import { Screen } from '@/components/screen';
import { AuroraBackground } from '@/components/ui/aurora-background';
import { Button } from '@/components/ui/button';
import { MedicationForm } from '@/features/medications/components/medication-form';
import { MedicationOverview } from '@/features/medications/components/medication-overview';
import { RefillCard } from '@/features/refill/components/refill-card';
import { formToInput } from '@/features/medications/to-input';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

export default function MedicationDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const med = useAppStore((s) => s.medications.find((m) => m.id === id));
  const updateMedication = useAppStore((s) => s.updateMedication);
  const removeMedication = useAppStore((s) => s.removeMedication);

  if (!med) {
    return (
      <Screen>
        <Text style={{ color: theme.textSecondary, marginTop: Spacing.four }}>
          Medication not found.
        </Text>
      </Screen>
    );
  }

  const confirmDelete = () => {
    Alert.alert('Delete medication', `Remove ${med.name} and its dose history?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          removeMedication(med.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <Screen edges={['bottom']}>
      <AuroraBackground />
      <Stack.Screen options={{ title: med.name }} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <MedicationOverview name={med.name} rxcui={med.rxcui} />

        <RefillCard med={med} />

        <MedicationForm
          initial={{
            name: med.name,
            rxcui: med.rxcui,
            strength: med.strength ?? '',
            form: med.form ?? '',
            times: med.times,
            daysOfWeek: med.daysOfWeek,
            pillsPerDose: med.pillsPerDose?.toString() ?? '',
            quantityOnHand: med.quantityOnHand?.toString() ?? '',
            refillLeadDays: med.refillLeadDays?.toString() ?? '',
          }}
          submitLabel="Save changes"
          onSubmit={(values) => {
            updateMedication(
              med.id,
              formToInput(values, {
                quantityOnHand: med.quantityOnHand ?? null,
                quantityAsOf: med.quantityAsOf ?? null,
              }),
            );
            router.back();
          }}
        />

        <Button title="Delete medication" variant="danger" onPress={confirmDelete} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.four, gap: Spacing.four },
});
