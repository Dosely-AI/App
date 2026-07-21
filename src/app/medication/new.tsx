import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Screen } from '@/components/screen';
import { AuroraBackground } from '@/components/ui/aurora-background';
import { Card } from '@/components/ui/card';
import { MedicationForm } from '@/features/medications/components/medication-form';
import { formToInput } from '@/features/medications/to-input';
import { prefillFrom, type ScanParams } from '@/features/medications/scan-prefill';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

export default function NewMedicationScreen() {
  const theme = useTheme();
  const router = useRouter();
  const addMedication = useAppStore((s) => s.addMedication);
  const params = useLocalSearchParams<ScanParams>();

  const initial = prefillFrom(params);
  const scanned = params.source === 'barcode' || params.source === 'photo';
  const lowConfidence = params.confidence === 'low';

  return (
    <Screen edges={['bottom']}>
      <AuroraBackground />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {scanned ? (
          <Animated.View entering={FadeInDown.duration(380)}>
            <Card style={styles.banner}>
              <Ionicons
                name={lowConfidence ? 'alert-circle' : 'checkmark-circle'}
                size={22}
                color={lowConfidence ? theme.warning : theme.success}
              />
              <View style={styles.flex}>
                <Text style={[styles.bannerTitle, { color: theme.text }]}>
                  {params.source === 'barcode'
                    ? 'Found in the FDA directory'
                    : 'Read from your label'}
                </Text>
                <Text style={[styles.bannerBody, { color: theme.textSecondary }]}>
                  {lowConfidence
                    ? 'The photo was hard to read — please check every field against your bottle before saving.'
                    : 'Check these details against your bottle, then add your dose times.'}
                </Text>
              </View>
            </Card>
          </Animated.View>
        ) : null}

        <MedicationForm
          initial={initial}
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
  content: { paddingVertical: Spacing.four, gap: Spacing.four },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  flex: { flex: 1 },
  bannerTitle: { fontSize: 15, fontWeight: '700' },
  bannerBody: { fontSize: 13, lineHeight: 19, marginTop: 2 },
});
