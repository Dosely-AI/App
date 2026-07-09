import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { medicationFormSchema, type MedicationFormValues } from '@/features/medications/schema';

import { DaysSelector } from './days-selector';
import { DrugNameField } from './drug-name-field';
import { TimesEditor } from './times-editor';

const DEFAULTS: MedicationFormValues = {
  name: '',
  rxcui: null,
  strength: '',
  form: '',
  times: [],
  daysOfWeek: [],
};

type Props = {
  initial?: Partial<MedicationFormValues>;
  submitLabel: string;
  submitting?: boolean;
  onSubmit: (values: MedicationFormValues) => void;
};

export function MedicationForm({ initial, submitLabel, submitting, onSubmit }: Props) {
  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<MedicationFormValues>({
    resolver: zodResolver(medicationFormSchema),
    defaultValues: { ...DEFAULTS, ...initial },
  });

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

      <Button title={submitLabel} loading={submitting} onPress={handleSubmit(onSubmit)} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.four },
  row: { flexDirection: 'row', gap: Spacing.three },
  flex: { flex: 1 },
});
