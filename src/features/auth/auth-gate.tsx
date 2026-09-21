import { type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

import { AuthScreen } from './auth-screen';
import { LockScreen } from './lock-screen';

/**
 * Decides what the user sees before the app.
 *
 * The front door is an email + password account (with social sign-in), the same
 * on every platform, stored on-device via `lib/auth/account`. Once signed in a
 * `profile` exists; an optional biometric lock can gate re-entry on native.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const hydrated = useAppStore((s) => s.hydrated);
  const profile = useAppStore((s) => s.profile);
  const unlocked = useAppStore((s) => s.unlocked);

  if (!hydrated) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.background,
        }}>
        <ActivityIndicator color={theme.tint} />
      </View>
    );
  }

  if (!profile) return <AuthScreen />;
  if (profile.biometricLock && !unlocked) return <LockScreen />;

  return <>{children}</>;
}
