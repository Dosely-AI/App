import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { Screen } from '@/components/screen';
import { MedicationForm } from '@/features/medications/components/medication-form';
import { formToInput } from '@/features/medications/to-input';
import { Spacing } from '@/constants/theme';
import { useAppStore } from '@/store/app-store';

export default function NewMedicationScreen() {
  const router = useRouter();
  const addMedication = useAppStore((s) => s.addMedication);

  return (
    <Screen edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <MedicationForm
          submitLabel="Add medication"
          onSubmit={(values) => {
            addMedication(formToInput(values));
            router.back();
          }}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.four },
});
