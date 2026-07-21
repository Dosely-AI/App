import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Optional Anthropic API key, provided by the user.
 *
 * On native it lives ONLY in the device secure store (Keychain / Keystore).
 * On web, SecureStore is unavailable, so we fall back to localStorage — enough
 * to enable the AI features in the browser build, but note localStorage is
 * readable by any script on the page, so a hosted build should proxy AI calls
 * through the backend with a server-held key instead of storing one here.
 */
const KEY = 'dosely.anthropicApiKey';

const isWeb = Platform.OS === 'web';

export async function getApiKey(): Promise<string | null> {
  if (isWeb) {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    } catch {
      return null;
    }
  }
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function setApiKey(value: string): Promise<void> {
  const v = value.trim();
  if (isWeb) {
    try {
      localStorage.setItem(KEY, v);
    } catch {
      // localStorage can be disabled (private mode) — fail quietly.
    }
    return;
  }
  await SecureStore.setItemAsync(KEY, v);
}

export async function clearApiKey(): Promise<void> {
  if (isWeb) {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  await SecureStore.deleteItemAsync(KEY);
}
