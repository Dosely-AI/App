import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { authenticate, biometricLabel, checkBiometrics } from '@/lib/auth/biometrics';
import { useAppStore } from '@/store/app-store';

/** Sign-in: unlock a biometric-locked profile before the app is shown. */
export function LockScreen() {
  const theme = useTheme();
  const name = useAppStore((s) => s.profile?.name ?? '');
  const unlock = useAppStore((s) => s.unlock);
  const signOut = useAppStore((s) => s.signOut);

  const [label, setLabel] = useState('biometric unlock');
  const [busy, setBusy] = useState(false);
  const promptedRef = useRef(false);

  const tryUnlock = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const ok = await authenticate('Unlock DoselyAI');
    setBusy(false);
    if (ok) unlock();
  }, [busy, unlock]);

  // Prompt automatically on first mount for a one-tap unlock.
  useEffect(() => {
    checkBiometrics().then((b) => setLabel(biometricLabel(b.kind)));
    if (!promptedRef.current) {
      promptedRef.current = true;
      void tryUnlock();
    }
  }, [tryUnlock]);

  const iconName = label.includes('Face') ? 'scan-outline' : 'finger-print';

  return (
    <Screen>
      <View style={styles.content}>
        <PulsingIcon name={iconName} />
        <Animated.View entering={FadeInDown.duration(500).delay(120)} style={styles.headings}>
          <Text style={[styles.title, { color: theme.text }]}>
            {name ? `Welcome back, ${name}` : 'Welcome back'}
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Unlock DoselyAI with {label} to continue.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeIn.duration(500).delay(280)} style={styles.actions}>
          <Button title={`Unlock with ${label}`} onPress={tryUnlock} loading={busy} />
          <Button title="Not you? Sign out" variant="ghost" onPress={signOut} />
        </Animated.View>
      </View>
    </Screen>
  );
}

/** The lock badge, breathing gently so the screen feels alive while waiting. */
function PulsingIcon({ name }: { name: 'scan-outline' | 'finger-print' }) {
  const theme = useTheme();
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 1100 }),
        withTiming(1, { duration: 1100 }),
      ),
      -1,
      false,
    );
  }, [scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      entering={FadeIn.duration(500)}
      style={[styles.iconWrap, { backgroundColor: theme.backgroundElement }, style]}>
      <Ionicons name={name} size={44} color={theme.tint} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  headings: { alignItems: 'center', gap: Spacing.three },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  title: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 15, lineHeight: 22, textAlign: 'center', paddingHorizontal: Spacing.four },
  actions: { alignSelf: 'stretch', gap: Spacing.two, marginTop: Spacing.five },
});
