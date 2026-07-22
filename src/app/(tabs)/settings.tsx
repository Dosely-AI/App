import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Disclaimer } from '@/components/disclaimer';
import { Screen } from '@/components/screen';
import { AuroraBackground } from '@/components/ui/aurora-background';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { authenticate, biometricLabel, checkBiometrics } from '@/lib/auth/biometrics';
import { clearApiKey, getApiKey, setApiKey } from '@/lib/ai/key';
import {
  getReminderPermission,
  requestReminderPermission,
  syncReminders,
} from '@/lib/notifications/reminders';
import { useAppStore } from '@/store/app-store';

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const resetAll = useAppStore((s) => s.resetAll);
  const medications = useAppStore((s) => s.medications);
  const profile = useAppStore((s) => s.profile);
  const session = useAppStore((s) => s.session);
  const setProfile = useAppStore((s) => s.setProfile);
  const signOut = useAppStore((s) => s.signOut);
  const [hasKey, setHasKey] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [remindersOn, setRemindersOn] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [nameInput, setNameInput] = useState(profile?.name ?? '');
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioLabel, setBioLabel] = useState('biometric unlock');

  useEffect(() => {
    getApiKey().then((k) => setHasKey(Boolean(k)));
    getReminderPermission().then(setRemindersOn);
    checkBiometrics().then((b) => {
      setBioAvailable(b.available);
      setBioLabel(biometricLabel(b.kind));
    });
  }, []);

  const saveName = () => {
    if (!nameInput.trim()) return;
    setProfile(nameInput, profile?.biometricLock ?? false);
    Alert.alert('Saved', 'Your name has been updated.');
  };

  const toggleLock = async (next: boolean) => {
    if (!profile) return;
    if (next) {
      const ok = await authenticate(`Confirm ${bioLabel} to protect DoselyAI`);
      if (!ok) {
        Alert.alert(`Couldn't confirm ${bioLabel}`, 'The lock was not changed.');
        return;
      }
    }
    setProfile(profile.name, next);
  };

  const confirmSignOut = () => {
    const message = 'Sign out? Your medications stay on this device.';
    // Alert.alert's multi-button form doesn't fire callbacks on web.
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(message)) signOut();
      return;
    }
    Alert.alert('Sign out', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

  const enableReminders = async () => {
    setRequesting(true);
    try {
      const granted = await requestReminderPermission();
      setRemindersOn(granted);
      if (granted) {
        await syncReminders(medications);
        Alert.alert('Reminders on', "You'll get a notification at each dose time.");
      } else {
        Alert.alert(
          'Permission needed',
          'Enable notifications for DoselyAI in your device settings to get reminders.',
        );
      }
    } finally {
      setRequesting(false);
    }
  };

  const saveKey = async () => {
    if (!keyInput.trim()) return;
    setSaving(true);
    try {
      await setApiKey(keyInput.trim());
      setHasKey(true);
      setKeyInput('');
      Alert.alert('Saved', 'AI summaries are now enabled.');
    } catch {
      Alert.alert('Could not save', 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const removeKey = async () => {
    await clearApiKey();
    setHasKey(false);
  };

  const confirmReset = () => {
    Alert.alert(
      'Reset all data',
      'This permanently deletes your medications and dose history on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: resetAll },
      ],
    );
  };

  return (
    <Screen>
      <AuroraBackground />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {session ? (
          <Card>
            <Text style={[styles.title, { color: theme.text }]}>Account</Text>
            <Text style={[styles.desc, { color: theme.textSecondary }]}>
              Signed in as <Text style={{ fontWeight: '700' }}>{session.name || 'you'}</Text> with a
              passkey. Your account is verified by the server and works across your devices.
            </Text>
            <Button title="Sign out" variant="ghost" onPress={confirmSignOut} />
          </Card>
        ) : (
          <Card>
            <Text style={[styles.title, { color: theme.text }]}>Profile</Text>
            <Text style={[styles.desc, { color: theme.textSecondary }]}>
              Your profile lives only on this device. There is no account or password.
            </Text>
            <TextField
              label="Your name"
              placeholder="Your name"
              value={nameInput}
              onChangeText={setNameInput}
              autoCapitalize="words"
            />
            <View style={{ height: Spacing.three }} />
            <Button title="Save name" variant="secondary" onPress={saveName} />

            {bioAvailable ? (
              <View style={styles.lockRow}>
                <View style={styles.lockText}>
                  <Text style={[styles.lockTitle, { color: theme.text }]}>Lock with {bioLabel}</Text>
                  <Text style={[styles.lockDesc, { color: theme.textSecondary }]}>
                    Require {bioLabel} each time DoselyAI opens.
                  </Text>
                </View>
                <Switch
                  value={profile?.biometricLock ?? false}
                  onValueChange={toggleLock}
                  trackColor={{ true: theme.tint }}
                />
              </View>
            ) : null}

            <View style={{ height: Spacing.three }} />
            <Button title="Sign out" variant="ghost" onPress={confirmSignOut} />
          </Card>
        )}

        <Pressable onPress={() => router.push('/emergency')}>
          <Card>
            <View style={styles.navRow}>
              <View style={[styles.navIcon, { backgroundColor: theme.danger }]}>
                <Ionicons name="medkit" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.title, { color: theme.text, marginBottom: 2 }]}>Emergency medical card</Text>
                <Text style={[styles.desc, { color: theme.textSecondary, marginBottom: 0 }]}>
                  Allergies, conditions, and a contact — shareable in an emergency.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
            </View>
          </Card>
        </Pressable>

        <Card>
          <Text style={[styles.title, { color: theme.text }]}>Dose reminders</Text>
          <Text style={[styles.desc, { color: theme.textSecondary }]}>
            Get a notification at each dose time, with a “Mark as taken” button. Reminders are
            scheduled on your device.
          </Text>
          <Text style={[styles.status, { color: remindersOn ? theme.success : theme.textSecondary }]}>
            {remindersOn ? '● On' : '○ Off'}
          </Text>
          <Button
            title={remindersOn ? 'Reminders enabled' : 'Enable reminders'}
            onPress={enableReminders}
            loading={requesting}
            disabled={remindersOn}
          />
        </Card>

        <Card>
          <Text style={[styles.title, { color: theme.text }]}>AI summaries (optional)</Text>
          <Text style={[styles.desc, { color: theme.textSecondary }]}>
            Add your own Anthropic API key to get AI-written, plain-language summaries of your
            medications. It is stored only on this device and sent only to Anthropic. Without a key,
            DoselyAI shows official FDA label information.
          </Text>
          <Text style={[styles.status, { color: hasKey ? theme.success : theme.textSecondary }]}>
            {hasKey ? '● Connected' : '○ Not connected'}
          </Text>
          <TextField
            placeholder="sk-ant-..."
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            value={keyInput}
            onChangeText={setKeyInput}
          />
          <View style={styles.buttonRow}>
            <View style={styles.flex}>
              <Button title="Save key" onPress={saveKey} loading={saving} />
            </View>
            {hasKey ? (
              <View style={styles.flex}>
                <Button title="Remove" variant="secondary" onPress={removeKey} />
              </View>
            ) : null}
          </View>
        </Card>

        <Card>
          <Text style={[styles.title, { color: theme.text }]}>Your data</Text>
          <Text style={[styles.desc, { color: theme.textSecondary }]}>
            Everything you enter stays on this device. Nothing is uploaded to any server.
          </Text>
          <Button title="Reset all data" variant="danger" onPress={confirmReset} />
        </Card>

        <Disclaimer />

        <Text style={[styles.version, { color: theme.textSecondary }]}>
          DoselyAI v{Constants.expoConfig?.version ?? '1.0.0'}
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.four, gap: Spacing.four },
  title: { fontSize: 17, fontWeight: '700', marginBottom: Spacing.two },
  desc: { fontSize: 14, lineHeight: 20, marginBottom: Spacing.three },
  status: { fontSize: 14, fontWeight: '600', marginBottom: Spacing.three },
  buttonRow: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.three },
  flex: { flex: 1 },
  version: { textAlign: 'center', fontSize: 13 },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.four },
  lockText: { flex: 1, gap: 2 },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  navIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  lockTitle: { fontSize: 16, fontWeight: '700' },
  lockDesc: { fontSize: 13, lineHeight: 18 },
});
