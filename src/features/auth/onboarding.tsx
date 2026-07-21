import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  authenticate,
  biometricLabel,
  checkBiometrics,
  type BiometricAvailability,
} from '@/lib/auth/biometrics';
import { useAppStore } from '@/store/app-store';

/** Sign-up: create a local profile (name) and optionally turn on biometric lock. */
export function Onboarding() {
  const theme = useTheme();
  const setProfile = useAppStore((s) => s.setProfile);

  const [name, setName] = useState('');
  const [lockOn, setLockOn] = useState(false);
  const [bio, setBio] = useState<BiometricAvailability>({ available: false, kind: 'biometric' });

  useEffect(() => {
    checkBiometrics().then(setBio);
  }, []);

  const label = biometricLabel(bio.kind);

  const toggleLock = async (next: boolean) => {
    if (!next) {
      setLockOn(false);
      return;
    }
    // Verify the biometric works before committing to lock, so a user can never
    // enable a lock they can't pass.
    const ok = await authenticate(`Confirm ${label} to protect DoselyAI`);
    if (ok) {
      setLockOn(true);
    } else {
      Alert.alert(`Couldn't confirm ${label}`, 'You can turn this on later in Settings.');
    }
  };

  const submit = () => {
    if (!name.trim()) {
      Alert.alert('Add your name', 'Enter your name so we can personalize DoselyAI.');
      return;
    }
    setProfile(name, lockOn);
  };

  return (
    <Screen>
      <View style={styles.content}>
        <Animated.View entering={FadeInDown.duration(550)} style={styles.hero}>
          <View style={[styles.logo, { backgroundColor: theme.tint }]}>
            <Ionicons name="medkit" size={34} color={theme.onTint} />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>Welcome to DoselyAI</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Let&apos;s set up your profile. Everything stays on this device — no account, no password.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(500).delay(160)}>
        <Card>
          <TextField
            label="Your name"
            placeholder="e.g. Jordan"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
          />

          {bio.available ? (
            <View style={styles.lockRow}>
              <View style={styles.lockText}>
                <Text style={[styles.lockTitle, { color: theme.text }]}>Protect with {label}</Text>
                <Text style={[styles.lockDesc, { color: theme.textSecondary }]}>
                  Unlock DoselyAI with {label} each time you open it.
                </Text>
              </View>
              <Switch
                value={lockOn}
                onValueChange={toggleLock}
                trackColor={{ true: theme.tint }}
              />
            </View>
          ) : (
            <Text style={[styles.bioHint, { color: theme.textSecondary }]}>
              Tip: on your phone you can lock DoselyAI with Face ID or Touch ID.
            </Text>
          )}
        </Card>
        </Animated.View>

        <Animated.View entering={FadeIn.duration(500).delay(320)}>
          <Button title="Get started" onPress={submit} />
        </Animated.View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: 'center', gap: Spacing.four, paddingBottom: Spacing.six },
  hero: { alignItems: 'center', gap: Spacing.three },
  logo: {
    width: 68,
    height: 68,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 15, lineHeight: 22, textAlign: 'center', paddingHorizontal: Spacing.three },
  lockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.four,
  },
  lockText: { flex: 1, gap: 2 },
  lockTitle: { fontSize: 16, fontWeight: '700' },
  lockDesc: { fontSize: 13, lineHeight: 18 },
  bioHint: { fontSize: 13, lineHeight: 18, marginTop: Spacing.four },
});
