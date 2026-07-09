import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Optional Anthropic API key, provided by the user, stored ONLY in the device
 * secure store (Keychain / Keystore). It never syncs anywhere and is sent only
 * to api.anthropic.com over TLS. There is no shared app key to leak.
 */
const KEY = 'dosely.anthropicApiKey';

export async function getApiKey(): Promise<string | null> {
  if (Platform.OS === 'web') return null; // SecureStore is unavailable on web
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function setApiKey(value: string): Promise<void> {
  if (Platform.OS === 'web') return;
  await SecureStore.setItemAsync(KEY, value.trim());
}

export async function clearApiKey(): Promise<void> {
  if (Platform.OS === 'web') return;
  await SecureStore.deleteItemAsync(KEY);
}
