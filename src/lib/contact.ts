import { Linking, Platform } from 'react-native';

import { smsUrl, telUrl } from '@/features/pharmacy/pharmacy';

/**
 * Thin wrappers around the OS dialer and SMS composer. The user always sends the
 * message themselves — DoselyAI only opens the composer prefilled. URL building
 * lives in `features/pharmacy` (pure/tested); this file just opens the result.
 */

/** Open the phone dialer for a number. Returns false if it couldn't be opened. */
export async function callNumber(phone: string): Promise<boolean> {
  return openUrl(telUrl(phone));
}

/** Open the SMS composer prefilled with `body`. Returns false if it couldn't. */
export async function textNumber(phone: string, body: string): Promise<boolean> {
  // iOS expects `&body=`; Android and others use `?body=`.
  const separator = Platform.OS === 'ios' ? '&' : '?';
  return openUrl(smsUrl(phone, body, separator));
}

async function openUrl(url: string): Promise<boolean> {
  try {
    // canOpenURL is unreliable for tel:/sms:, so just attempt to open and report
    // failure (e.g. a desktop browser with no handler) to the caller.
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
