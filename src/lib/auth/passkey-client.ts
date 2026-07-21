import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * The WebAuthn browser helpers are loaded lazily (only when a ceremony actually
 * runs on web) so that merely importing this module never pulls browser-only
 * code into the native bundle.
 */
async function browserApi() {
  return import('@simplewebauthn/browser');
}

/**
 * Client for the DoselyAI passkey backend. This is the WEB path: passkeys use
 * the browser's WebAuthn API, so `startRegistration`/`startAuthentication` drive
 * the platform's Touch ID / Face ID / security-key UI.
 *
 * Native (iOS/Android) passkeys need a custom dev build plus Associated Domains
 * and will use a native module — this file guards to web so it never runs an
 * unsupported ceremony inside Expo Go.
 */

/** Base URL of the auth server. Override with EXPO_PUBLIC_AUTH_URL in prod. */
export const AUTH_URL =
  (Constants.expoConfig?.extra?.authUrl as string | undefined) ??
  process.env.EXPO_PUBLIC_AUTH_URL ??
  'http://localhost:8787';

/**
 * Whether passkey sign-in can run here right now. Checked without importing the
 * browser lib so it's safe to call on native (always false there).
 */
export function passkeysAvailable(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential === 'function'
  );
}

export type Session = { token: string; userId: string; name: string };

export type AuthResult =
  | { status: 'ok'; session: Session }
  | { status: 'unsupported' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

async function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(`${AUTH_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Pull a human-readable error out of a non-OK response. */
async function errorText(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? `Request failed (${res.status}).`;
  } catch {
    return `Request failed (${res.status}).`;
  }
}

/** WebAuthn ceremonies throw a DOMException when the user dismisses the sheet. */
function isCancellation(err: unknown): boolean {
  return err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'AbortError');
}

/**
 * Create a new account and register this device's passkey. The browser prompts
 * for Touch ID / Face ID to create the credential.
 */
export async function signUpWithPasskey(name: string): Promise<AuthResult> {
  if (!passkeysAvailable()) return { status: 'unsupported' };

  try {
    const optionsRes = await postJson('/auth/register/options', { name });
    if (!optionsRes.ok) return { status: 'error', message: await errorText(optionsRes) };
    const { flowId, options } = (await optionsRes.json()) as { flowId: string; options: unknown };

    // Browser prompts for the biometric and creates the credential.
    const { startRegistration } = await browserApi();
    const response = await startRegistration({ optionsJSON: options as never });

    const verifyRes = await postJson('/auth/register/verify', { flowId, response });
    if (!verifyRes.ok) return { status: 'error', message: await errorText(verifyRes) };

    return { status: 'ok', session: (await verifyRes.json()) as Session };
  } catch (err) {
    if (isCancellation(err)) return { status: 'cancelled' };
    return { status: 'error', message: (err as Error).message };
  }
}

/**
 * Sign in with a passkey. Omit `name` for usernameless login — the platform
 * offers whichever discoverable passkey matches this site.
 */
export async function signInWithPasskey(name?: string): Promise<AuthResult> {
  if (!passkeysAvailable()) return { status: 'unsupported' };

  try {
    const optionsRes = await postJson('/auth/login/options', name ? { name } : {});
    if (!optionsRes.ok) return { status: 'error', message: await errorText(optionsRes) };
    const { flowId, options } = (await optionsRes.json()) as { flowId: string; options: unknown };

    const { startAuthentication } = await browserApi();
    const response = await startAuthentication({ optionsJSON: options as never });

    const verifyRes = await postJson('/auth/login/verify', { flowId, response });
    if (!verifyRes.ok) return { status: 'error', message: await errorText(verifyRes) };

    return { status: 'ok', session: (await verifyRes.json()) as Session };
  } catch (err) {
    if (isCancellation(err)) return { status: 'cancelled' };
    return { status: 'error', message: (err as Error).message };
  }
}

/** Validate a stored session token against the server; null if it's no longer valid. */
export async function fetchMe(token: string): Promise<{ userId: string; name: string } | null> {
  try {
    const res = await fetch(`${AUTH_URL}/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as { userId: string; name: string };
  } catch {
    return null;
  }
}
