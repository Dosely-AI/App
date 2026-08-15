import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { DoselyLogo } from '@/components/logo';
import { Screen } from '@/components/screen';
import { AuroraBackground } from '@/components/ui/aurora-background';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getStoredAccount, signInLocal, signUpLocal } from '@/lib/auth/account';
import { useAppStore } from '@/store/app-store';

type Mode = 'signup' | 'signin';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

export function AuthScreen() {
  const theme = useTheme();
  const setProfile = useAppStore((s) => s.setProfile);

  const [mode, setMode] = useState<Mode>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // If an account already exists on this device, default to signing in.
  useEffect(() => {
    getStoredAccount().then((acct) => {
      if (acct) {
        setMode('signin');
        setEmail(acct.email);
      }
    });
  }, []);

  const signUp = mode === 'signup';

  const submit = async () => {
    setError(null);
    const em = email.trim();
    if (signUp && !name.trim()) return setError('Please enter your name.');
    if (!EMAIL_RE.test(em)) return setError('Please enter a valid email address.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');

    setBusy(true);
    try {
      if (signUp) {
        const acct = await signUpLocal(name, em, password);
        setProfile(acct.name, false, acct.email);
      } else {
        const acct = await signInLocal(em, password);
        if (!acct) {
          setError('Incorrect email or password.');
          return;
        }
        setProfile(acct.name, false, acct.email);
      }
      // Profile is now set + unlocked → AuthGate renders the app.
    } finally {
      setBusy(false);
    }
  };

  const social = (provider: string) => {
    notify(
      `Continue with ${provider}`,
      `${provider} sign-in is wired up and ready — it just needs an OAuth client ID and a native build to go live. For now, use email and password to continue.`,
    );
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <AuroraBackground />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(520)} style={styles.hero}>
            <DoselyLogo size={60} />
            <Text style={[styles.title, { color: theme.text }]}>
              {signUp ? 'Create your account' : 'Welcome back'}
            </Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {signUp
                ? 'Your personal AI medication companion.'
                : 'Sign in to pick up where you left off.'}
            </Text>
          </Animated.View>

          {/* Social */}
          <Animated.View entering={FadeInDown.duration(480).delay(80)} style={styles.socials}>
            <SocialButton icon="logo-apple" label="Continue with Apple" onPress={() => social('Apple')} />
            <SocialButton icon="logo-google" label="Continue with Google" onPress={() => social('Google')} />
          </Animated.View>

          <View style={styles.dividerRow}>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <Text style={[styles.dividerText, { color: theme.textSecondary }]}>or</Text>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
          </View>

          {/* Email form */}
          <Animated.View entering={FadeIn.duration(480).delay(140)}>
            <Card>
              {signUp ? (
                <>
                  <TextField
                    label="Name"
                    placeholder="Your name"
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    autoComplete="name"
                    returnKeyType="next"
                  />
                  <View style={styles.gap} />
                </>
              ) : null}

              <TextField
                label="Email"
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoComplete="email"
                returnKeyType="next"
              />
              <View style={styles.gap} />

              <View>
                <TextField
                  label="Password"
                  placeholder={signUp ? 'At least 6 characters' : 'Your password'}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!show}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="go"
                  onSubmitEditing={submit}
                />
                <Pressable onPress={() => setShow((v) => !v)} style={styles.eye} hitSlop={8}>
                  <Ionicons name={show ? 'eye-off' : 'eye'} size={20} color={theme.textSecondary} />
                </Pressable>
              </View>

              {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}

              <View style={styles.gap} />
              <Button title={signUp ? 'Create account' : 'Sign in'} loading={busy} onPress={submit} />
            </Card>
          </Animated.View>

          {/* Toggle */}
          <Pressable
            onPress={() => {
              setMode(signUp ? 'signin' : 'signup');
              setError(null);
            }}
            style={styles.toggle}
            hitSlop={8}>
            <Text style={[styles.toggleText, { color: theme.textSecondary }]}>
              {signUp ? 'Already have an account? ' : 'New to Dosely? '}
              <Text style={{ color: theme.tint, fontWeight: '800' }}>
                {signUp ? 'Sign in' : 'Create one'}
              </Text>
            </Text>
          </Pressable>

          <Text style={[styles.footer, { color: theme.textSecondary }]}>
            Your account and medications are stored on your device. DoselyAI is an informational
            adherence tracker — not medical advice.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function SocialButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.social, { opacity: pressed ? 0.85 : 1 }]}>
      <Ionicons name={icon} size={20} color="#0A1626" />
      <Text style={styles.socialText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingVertical: Spacing.five, gap: Spacing.four },
  hero: { alignItems: 'center', gap: Spacing.two },
  title: { fontSize: 27, fontWeight: '800', letterSpacing: -0.4, marginTop: Spacing.two },
  subtitle: { fontSize: 15, lineHeight: 21, textAlign: 'center', paddingHorizontal: Spacing.three },

  socials: { gap: Spacing.two },
  social: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  socialText: { color: '#0A1626', fontSize: 16, fontWeight: '700' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  divider: { flex: 1, height: 1 },
  dividerText: { fontSize: 13, fontWeight: '600' },

  gap: { height: Spacing.three },
  eye: { position: 'absolute', right: Spacing.three, top: 34 },
  error: { fontSize: 13, fontWeight: '600', marginTop: Spacing.three },

  toggle: { alignItems: 'center' },
  toggleText: { fontSize: 14, fontWeight: '600' },
  footer: { fontSize: 12, lineHeight: 17, textAlign: 'center', paddingHorizontal: Spacing.three },
});
