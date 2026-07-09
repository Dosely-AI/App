import { type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

import { LockScreen } from './lock-screen';
import { Onboarding } from './onboarding';

/**
 * Decides what the user sees before the app:
 *  - nothing loaded yet  → a brief spinner (avoids flashing sign-up at returning users)
 *  - no profile          → sign up (Onboarding)
 *  - locked profile      → sign in (LockScreen) until unlocked this session
 *  - otherwise           → the app
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const hydrated = useAppStore((s) => s.hydrated);
  const profile = useAppStore((s) => s.profile);
  const unlocked = useAppStore((s) => s.unlocked);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.tint} />
      </View>
    );
  }

  if (!profile) return <Onboarding />;
  if (profile.biometricLock && !unlocked) return <LockScreen />;

  return <>{children}</>;
}
