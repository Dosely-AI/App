import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

/**
 * Thin wrapper around the device's biometric authentication (Face ID / Touch ID
 * / fingerprint, with device-passcode fallback). Biometrics are a native
 * capability, so everything here degrades gracefully to "unavailable" on web.
 */

export type BiometricKind = 'face' | 'fingerprint' | 'biometric';

export type BiometricAvailability = {
  /** Hardware exists and at least one biometric is enrolled. */
  available: boolean;
  /** Best label to show the user, e.g. "Face ID". */
  kind: BiometricKind;
};

/** Human label for a biometric kind. */
export function biometricLabel(kind: BiometricKind): string {
  if (kind === 'face') return Platform.OS === 'ios' ? 'Face ID' : 'Face Unlock';
  if (kind === 'fingerprint') return Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint';
  return 'biometric unlock';
}

/** Whether biometric sign-in can be offered on this device right now. */
export async function checkBiometrics(): Promise<BiometricAvailability> {
  if (Platform.OS === 'web') return { available: false, kind: 'biometric' };

  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

    const kind: BiometricKind = types.includes(
      LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
    )
      ? 'face'
      : types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
        ? 'fingerprint'
        : 'biometric';

    return { available: hasHardware && enrolled, kind };
  } catch {
    return { available: false, kind: 'biometric' };
  }
}

/**
 * Prompt for biometric authentication. Returns true on success. Falls back to
 * the device passcode when biometrics fail, so users are never locked out.
 */
export async function authenticate(promptMessage: string): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      // Allow the device passcode so a failed/absent biometric isn't a dead end.
      disableDeviceFallback: false,
      cancelLabel: 'Cancel',
    });
    return result.success;
  } catch {
    return false;
  }
}
