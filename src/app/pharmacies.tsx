import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { AuroraBackground } from '@/components/ui/aurora-background';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import type { Pharmacy } from '@/store/types';

type Form = { name: string; phone: string; address: string; notes: string };
const EMPTY: Form = { name: '', phone: '', address: '', notes: '' };

export default function PharmaciesScreen() {
  const theme = useTheme();
  const pharmacies = useAppStore((s) => s.pharmacies);
  const addPharmacy = useAppStore((s) => s.addPharmacy);
  const updatePharmacy = useAppStore((s) => s.updatePharmacy);
  const removePharmacy = useAppStore((s) => s.removePharmacy);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);

  const set = (k: keyof Form) => (v: string) => setForm((prev) => ({ ...prev, [k]: v }));
  const reset = () => {
    setEditingId(null);
    setForm(EMPTY);
  };

  const startEdit = (p: Pharmacy) => {
    setEditingId(p.id);
    setForm({ name: p.name, phone: p.phone, address: p.address, notes: p.notes });
  };

  const save = () => {
    const name = form.name.trim();
    if (!name) {
      notify('Name required', 'Give the pharmacy a name so you can recognize it.');
      return;
    }
    const input = { name, phone: form.phone.trim(), address: form.address.trim(), notes: form.notes.trim() };
    if (editingId) updatePharmacy(editingId, input);
    else addPharmacy(input);
    reset();
  };

  const confirmDelete = (p: Pharmacy) => {
    const message = `Remove ${p.name}? Medications filled here will keep their details but lose the pharmacy link.`;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(message)) {
        removePharmacy(p.id);
        if (editingId === p.id) reset();
      }
      return;
    }
    Alert.alert('Remove pharmacy', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          removePharmacy(p.id);
          if (editingId === p.id) reset();
        },
      },
    ]);
  };

  return (
    <Screen edges={['bottom']}>
      <AuroraBackground />
      <Stack.Screen options={{ title: 'Pharmacies' }} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {pharmacies.map((p) => (
          <Card key={p.id}>
            <View style={styles.row}>
              <View style={styles.flex}>
                <Text style={[styles.name, { color: theme.text }]}>{p.name}</Text>
                {p.phone ? <Text style={[styles.meta, { color: theme.textSecondary }]}>{p.phone}</Text> : null}
                {p.address ? <Text style={[styles.meta, { color: theme.textSecondary }]}>{p.address}</Text> : null}
                {p.notes ? <Text style={[styles.meta, { color: theme.textSecondary }]}>{p.notes}</Text> : null}
              </View>
              <Pressable onPress={() => startEdit(p)} hitSlop={8} style={styles.iconBtn}>
                <Ionicons name="create-outline" size={22} color={theme.tint} />
              </Pressable>
              <Pressable onPress={() => confirmDelete(p)} hitSlop={8} style={styles.iconBtn}>
                <Ionicons name="trash-outline" size={22} color={theme.danger} />
              </Pressable>
            </View>
          </Card>
        ))}

        <Card>
          <Text style={[styles.formTitle, { color: theme.text }]}>
            {editingId ? 'Edit pharmacy' : 'Add a pharmacy'}
          </Text>
          <TextField label="Name" placeholder="e.g. CVS on Main St" value={form.name} onChangeText={set('name')} />
          <View style={styles.gap} />
          <TextField
            label="Phone"
            placeholder="e.g. (555) 123-4567"
            keyboardType="phone-pad"
            value={form.phone}
            onChangeText={set('phone')}
          />
          <View style={styles.gap} />
          <TextField label="Address (optional)" placeholder="Street, city" value={form.address} onChangeText={set('address')} />
          <View style={styles.gap} />
          <TextField label="Notes (optional)" placeholder="Hours, which location, etc." value={form.notes} onChangeText={set('notes')} />

          <View style={{ height: Spacing.three }} />
          <Button title={editingId ? 'Save changes' : 'Add pharmacy'} onPress={save} />
          {editingId ? (
            <>
              <View style={{ height: Spacing.two }} />
              <Button title="Cancel" variant="ghost" onPress={reset} />
            </>
          ) : null}
        </Card>

        <Text style={[styles.fine, { color: theme.textSecondary }]}>
          Pharmacies are stored with the rest of your data and used only to prepare refill requests
          you send yourself.
        </Text>
      </ScrollView>
    </Screen>
  );
}

/** Alert that also works on web (RN Web's Alert is limited to native). */
function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.four, gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  flex: { flex: 1 },
  name: { fontSize: 17, fontWeight: '700' },
  meta: { fontSize: 14, marginTop: 2 },
  iconBtn: { padding: Spacing.one },
  formTitle: { fontSize: 17, fontWeight: '700', marginBottom: Spacing.three },
  gap: { height: Spacing.three },
  fine: { fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: Spacing.two },
});
