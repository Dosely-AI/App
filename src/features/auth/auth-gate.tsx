import { type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { passkeysAvailable } from '@/lib/auth/passkey-client';
import { useAppStore } from '@/store/app-store';

import { LockScreen } from './lock-screen';
import { Onboarding } from './onboarding';
import { PasskeyAuth } from './passkey-auth';

/**
 * Decides what the user sees before the app.
 *
 * Two auth models coexist by platform:
 *  - **Web** (passkeys supported): a real, server-backed account — sign up / in
 *    with a passkey, gated on `session`.
 *  - **Native / no-WebAuthn**: the on-device biometric lock — a local `profile`
 *    optionally gated behind Face ID / Touch ID. (Native passkeys need a custom
 *    build + Associated Domains, so they come later.)
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const hydrated = useAppStore((s) => s.hydrated);
  const profile = useAppStore((s) => s.profile);
  const session = useAppStore((s) => s.session);
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

  // Web with passkeys → server-backed accounts.
  if (passkeysAvailable()) {
    if (!session) return <PasskeyAuth />;
    return <>{children}</>;
  }

  // Native (and any browser without WebAuthn) → on-device biometric lock.
  if (!profile) return <Onboarding />;
  if (profile.biometricLock && !unlocked) return <LockScreen />;

  return <>{children}</>;
}
