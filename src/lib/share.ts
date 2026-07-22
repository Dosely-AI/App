import { Platform, Share } from 'react-native';

/**
 * Share plain text via the OS share sheet on native, or the Web Share API /
 * clipboard on web. Returns a short status so the caller can confirm.
 */
export async function shareText(text: string, title?: string): Promise<'shared' | 'copied' | 'failed'> {
  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    try {
      if (nav?.share) {
        await nav.share({ title, text });
        return 'shared';
      }
      if (nav?.clipboard) {
        await nav.clipboard.writeText(text);
        return 'copied';
      }
    } catch {
      return 'failed';
    }
    return 'failed';
  }

  try {
    await Share.share({ message: text, title });
    return 'shared';
  } catch {
    return 'failed';
  }
}
