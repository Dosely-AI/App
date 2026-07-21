import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signInWithPasskey, signUpWithPasskey, type AuthResult } from '@/lib/auth/passkey-client';
import { useAppStore } from '@/store/app-store';

type Mode = 'signup' | 'signin';

/**
 * Passkey account screen (web). Sign-up creates a server-backed account and
 * registers this device's passkey via the browser's Touch ID / Face ID prompt;
 * sign-in authenticates an existing passkey — usernameless, so the platform
 * offers whichever passkey it has for this site.
 */
export function PasskeyAuth() {
  const theme = useTheme();
  const setSession = useAppStore((s) => s.setSession);

  const [mode, setMode] = useState<Mode>('signup');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = (result: AuthResult) => {
    if (result.status === 'ok') {
      setSession(result.session);
      return;
    }
    if (result.status === 'cancelled') {
      setError(null); // user backed out — no error, let them retry
      return;
    }
    setError(
      result.status === 'unsupported'
        ? 'This browser does not support passkeys. Try Safari or Chrome on a recent device.'
        : result.message,
    );
  };

  const doSignUp = async () => {
    if (!name.trim()) {
      setError('Enter a name for your account.');
      return;
    }
    setBusy(true);
    setError(null);
    apply(await signUpWithPasskey(name.trim()));
    setBusy(false);
  };

  const doSignIn = async () => {
    setBusy(true);
    setError(null);
    apply(await signInWithPasskey(name.trim() || undefined));
    setBusy(false);
  };

  return (
    <Screen>
      <View style={styles.content}>
        <Animated.View entering={FadeInDown.duration(500)} style={styles.hero}>
          <View style={[styles.logo, { backgroundColor: theme.tint }]}>
            <Ionicons name="finger-print" size={34} color={theme.onTint} />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>
            {mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {mode === 'signup'
              ? 'Sign up with a passkey — your fingerprint or face unlocks it, and it works across your devices. No password to remember.'
              : 'Sign in with the passkey on this device.'}
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(500).delay(140)}>
          <Card>
            {mode === 'signup' ? (
              <TextField
                label="Your name"
                placeholder="e.g. Jordan"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoFocus
                editable={!busy}
                onSubmitEditing={doSignUp}
                returnKeyType="done"
              />
            ) : (
              <TextField
                label="Name (optional)"
                placeholder="Leave blank to pick a passkey"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                editable={!busy}
                onSubmitEditing={doSignIn}
                returnKeyType="done"
              />
            )}

            {error ? (
              <Animated.View entering={FadeIn.duration(200)} style={styles.errorRow}>
                <Ionicons name="alert-circle" size={18} color={theme.danger} />
                <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>
              </Animated.View>
            ) : null}

            <View style={{ height: Spacing.three }} />

            {mode === 'signup' ? (
              <Button title="Sign up with passkey" loading={busy} onPress={doSignUp} />
            ) : (
              <Button title="Sign in with passkey" loading={busy} onPress={doSignIn} />
            )}
          </Card>
        </Animated.View>

        <Animated.View entering={FadeIn.duration(500).delay(280)} style={styles.switchRow}>
          <Text style={{ color: theme.textSecondary }}>
            {mode === 'signup' ? 'Already have an account?' : 'New to DoselyAI?'}
          </Text>
          <Button
            title={mode === 'signup' ? 'Sign in' : 'Create one'}
            variant="ghost"
            onPress={() => {
              setError(null);
              setMode((m) => (m === 'signup' ? 'signin' : 'signup'));
            }}
          />
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
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.three },
  error: { flex: 1, fontSize: 13, lineHeight: 18 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.one },
});
