/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePalette } from '@/hooks/use-palette';

export function useTheme() {
  const scheme = useColorScheme();
  const theme = scheme === 'unspecified' ? 'light' : scheme;
  const palette = usePalette();

  // The primary accent follows the user's chosen palette; the deep-ink glass
  // surfaces and semantic colors stay fixed so legibility never regresses.
  return {
    ...Colors[theme],
    tint: theme === 'dark' ? palette.accent : palette.accentLight,
    onTint: palette.onAccent,
  };
}
