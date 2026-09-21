import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Disclaimer } from '@/components/disclaimer';
import { Screen } from '@/components/screen';
import { AuroraBackground } from '@/components/ui/aurora-background';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TextField } from '@/components/ui/text-field';
import { PALETTES, type Palette } from '@/constants/palettes';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { authenticate, biometricLabel, checkBiometrics } from '@/lib/auth/biometrics';
import { clearApiKey, getApiKey, setApiKey } from '@/lib/ai/key';
import { passkeysAvailable } from '@/lib/auth/passkey-client';
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
  const clearSession = useAppStore((s) => s.clearSession);
  const palette = useAppStore((s) => s.palette);
  const setPalette = useAppStore((s) => s.setPalette);
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
        <Card>
          <Text style={[styles.title, { color: theme.text }]}>Account</Text>
          <Text style={[styles.desc, { color: theme.textSecondary }]}>
            {profile?.email ? (
              <>
                Signed in as{' '}
                <Text style={{ fontWeight: '700', color: theme.text }}>{profile.email}</Text>. Your
                account and medications are stored on this device.
              </>
            ) : (
              'Your profile is stored on this device.'
            )}
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

        {/* The cloud (passkey) account behind sharing, sync and the care network. */}
        {session || passkeysAvailable() ? (
          <Card>
            <Text style={[styles.title, { color: theme.text }]}>Cloud account</Text>
            <Text style={[styles.desc, { color: theme.textSecondary }]}>
              {session ? (
                <>
                  Connected as <Text style={{ fontWeight: '700', color: theme.text }}>{session.name || 'you'}</Text>{' '}
                  with a passkey. Caregiver sharing, sync, and your pharmacy and doctors use it.
                </>
              ) : (
                'Not connected. Connect it to share with caregivers, your pharmacy and doctors, and to sync across your devices.'
              )}
            </Text>
            {session ? (
              <Button title="Disconnect" variant="ghost" onPress={clearSession} />
            ) : (
              <Button title="Connect cloud account" variant="secondary" onPress={() => router.push('/cloud-account')} />
            )}
          </Card>
        ) : null}

        {/* Appearance */}
        <Card>
          <Text style={[styles.title, { color: theme.text }]}>Appearance</Text>
          <Text style={[styles.desc, { color: theme.textSecondary }]}>
            Pick a color theme — it recolors your background wallpaper and accents across the app.
          </Text>
          <View style={styles.swatchGrid}>
            {PALETTES.map((p) => (
              <PaletteSwatch
                key={p.id}
                palette={p}
                active={palette === p.id}
                onPress={() => setPalette(p.id)}
              />
            ))}
          </View>
        </Card>

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

        <Pressable onPress={() => router.push('/refills')}>
          <Card>
            <View style={styles.navRow}>
              <View style={[styles.navIcon, { backgroundColor: theme.warning }]}>
                <Ionicons name="repeat" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.title, { color: theme.text, marginBottom: 2 }]}>Refills & pharmacies</Text>
                <Text style={[styles.desc, { color: theme.textSecondary, marginBottom: 0 }]}>
                  See what&apos;s running low and request refills by call or text.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
            </View>
          </Card>
        </Pressable>

        <Pressable onPress={() => router.push('/sharing')}>
          <Card>
            <View style={styles.navRow}>
              <View style={[styles.navIcon, { backgroundColor: theme.tint }]}>
                <Ionicons name="people" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.title, { color: theme.text, marginBottom: 2 }]}>Caregivers & sharing</Text>
                <Text style={[styles.desc, { color: theme.textSecondary, marginBottom: 0 }]}>
                  Invite a family member to see your meds, or care for someone else.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
            </View>
          </Card>
        </Pressable>

        <Pressable onPress={() => router.push('/network')}>
          <Card>
            <View style={styles.navRow}>
              <View style={[styles.navIcon, { backgroundColor: theme.success }]}>
                <Ionicons name="git-network" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.title, { color: theme.text, marginBottom: 2 }]}>Pharmacy & doctor network</Text>
                <Text style={[styles.desc, { color: theme.textSecondary, marginBottom: 0 }]}>
                  Connect your pharmacy and doctors, follow prescriptions, and control who sees what.
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

/** A palette preview chip: a mini gradient wallpaper with the theme name. */
function PaletteSwatch({
  palette,
  active,
  onPress,
}: {
  palette: Palette;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={styles.swatchWrap}
      accessibilityRole="button"
      accessibilityLabel={`${palette.name} theme`}
      accessibilityState={{ selected: active }}>
      <View style={[styles.swatch, { borderColor: active ? theme.text : 'transparent' }]}>
        <LinearGradient
          colors={[palette.aurora[0], palette.aurora[1], palette.aurora[2] ?? palette.aurora[0]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {active ? (
          <View style={styles.swatchCheck}>
            <Ionicons name="checkmark" size={20} color="#FFFFFF" />
          </View>
        ) : null}
      </View>
      <Text style={[styles.swatchName, { color: active ? theme.text : theme.textSecondary }]}>
        {palette.name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.four, gap: Spacing.four },
  swatchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, marginTop: Spacing.three },
  swatchWrap: { alignItems: 'center', gap: Spacing.one },
  swatch: { width: 54, height: 54, borderRadius: 16, overflow: 'hidden', borderWidth: 3 },
  swatchCheck: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(4, 8, 16, 0.28)',
  },
  swatchName: { fontSize: 12, fontWeight: '700' },
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
