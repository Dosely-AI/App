import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { medicationFormSchema, type MedicationFormValues } from '@/features/medications/schema';
import { useTheme } from '@/hooks/use-theme';
import { Text } from 'react-native';

import { DaysSelector } from './days-selector';
import { DrugNameField } from './drug-name-field';
import { PharmacyPicker } from './pharmacy-picker';
import { TimesEditor } from './times-editor';

const DEFAULTS: MedicationFormValues = {
  name: '',
  rxcui: null,
  strength: '',
  form: '',
  times: [],
  daysOfWeek: [],
  asNeeded: false,
  pillsPerDose: '',
  quantityOnHand: '',
  refillLeadDays: '',
  maxPerDay: '',
  rxNumber: '',
  pharmacyId: null,
};

type Props = {
  initial?: Partial<MedicationFormValues>;
  submitLabel: string;
  submitting?: boolean;
  onSubmit: (values: MedicationFormValues) => void;
};

export function MedicationForm({ initial, submitLabel, submitting, onSubmit }: Props) {
  const theme = useTheme();
  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<MedicationFormValues>({
    resolver: zodResolver(medicationFormSchema),
    defaultValues: { ...DEFAULTS, ...initial },
  });

  const asNeeded = watch('asNeeded');

  return (
    <View style={styles.form}>
      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <DrugNameField
            value={field.value}
            error={errors.name?.message}
            onSelect={(name, rxcui) => {
              field.onChange(name);
              setValue('rxcui', rxcui);
            }}
          />
        )}
      />

      <View style={styles.row}>
        <View style={styles.flex}>
          <Controller
            control={control}
            name="strength"
            render={({ field }) => (
              <TextField
                label="Strength"
                placeholder="e.g. 200 mg"
                value={field.value}
                onChangeText={field.onChange}
              />
            )}
          />
        </View>
        <View style={styles.flex}>
          <Controller
            control={control}
            name="form"
            render={({ field }) => (
              <TextField
                label="Form"
                placeholder="e.g. tablet"
                value={field.value}
                onChangeText={field.onChange}
              />
            )}
          />
        </View>
      </View>

      <Controller
        control={control}
        name="asNeeded"
        render={({ field }) => (
          <View style={styles.toggleRow}>
            <View style={styles.flex}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Take as needed</Text>
              <Text style={[styles.toggleHint, { color: theme.textSecondary }]}>
                For medications taken only when you need them, not on a set schedule.
              </Text>
            </View>
            <Switch value={field.value} onValueChange={field.onChange} trackColor={{ true: theme.tint }} />
          </View>
        )}
      />

      {asNeeded ? (
        <Controller
          control={control}
          name="maxPerDay"
          render={({ field }) => (
            <TextField
              label="Safe maximum per day (optional)"
              placeholder="e.g. 4"
              keyboardType="numeric"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.maxPerDay?.message}
            />
          )}
        />
      ) : (
        <>
          <Controller
            control={control}
            name="times"
            render={({ field }) => (
              <TimesEditor value={field.value} onChange={field.onChange} error={errors.times?.message} />
            )}
          />

          <Controller
            control={control}
            name="daysOfWeek"
            render={({ field }) => <DaysSelector value={field.value} onChange={field.onChange} />}
          />
        </>
      )}

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Refill tracking</Text>
        <Text style={[styles.sectionHint, { color: theme.textSecondary }]}>
          Optional. Enter how many you have and Dosely predicts when you&apos;ll run out.
        </Text>

        <View style={styles.row}>
          <View style={styles.flex}>
            <Controller
              control={control}
              name="quantityOnHand"
              render={({ field }) => (
                <TextField
                  label="Pills on hand"
                  placeholder="e.g. 30"
                  keyboardType="numeric"
                  value={field.value}
                  onChangeText={field.onChange}
                  error={errors.quantityOnHand?.message}
                />
              )}
            />
          </View>
          <View style={styles.flex}>
            <Controller
              control={control}
              name="pillsPerDose"
              render={({ field }) => (
                <TextField
                  label="Per dose"
                  placeholder="1"
                  keyboardType="numeric"
                  value={field.value}
                  onChangeText={field.onChange}
                  error={errors.pillsPerDose?.message}
                />
              )}
            />
          </View>
        </View>

        <Controller
          control={control}
          name="refillLeadDays"
          render={({ field }) => (
            <TextField
              label="Remind me this many days before running out"
              placeholder="7"
              keyboardType="numeric"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.refillLeadDays?.message}
            />
          )}
        />
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Pharmacy</Text>
        <Text style={[styles.sectionHint, { color: theme.textSecondary }]}>
          Optional. Link a pharmacy and Rx number to request refills by call or text when this runs
          low.
        </Text>

        <Controller
          control={control}
          name="pharmacyId"
          render={({ field }) => <PharmacyPicker value={field.value} onChange={field.onChange} />}
        />

        <Controller
          control={control}
          name="rxNumber"
          render={({ field }) => (
            <TextField
              label="Prescription (Rx) number"
              placeholder="e.g. 1234567"
              autoCapitalize="characters"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.rxNumber?.message}
            />
          )}
        />
      </View>

      <Button title={submitLabel} loading={submitting} onPress={handleSubmit(onSubmit)} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.four },
  row: { flexDirection: 'row', gap: Spacing.three },
  flex: { flex: 1 },
  section: { gap: Spacing.three },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  sectionHint: { fontSize: 13, lineHeight: 18, marginTop: -Spacing.two },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  toggleHint: { fontSize: 13, lineHeight: 18, marginTop: 2 },
});
