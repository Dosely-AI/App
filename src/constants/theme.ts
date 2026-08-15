/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0A1626',
    // Mint-tinted "paper", so cards read as raised surfaces.
    background: '#EAF3F1',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#D6E8E2',
    textSecondary: '#4C5F68',
    /** Brand / primary accent — Dosely mint, deepened for contrast on light. */
    tint: '#0AA47C',
    onTint: '#FFFFFF',
    border: '#CFE0DA',
    success: '#0FA576',
    warning: '#B7791F',
    danger: '#D7373F',
  },
  dark: {
    text: '#EAF3F1',
    // Deep navy "ink" ground.
    background: '#0A1626',
    // Raised "panel" surface, a step up from the ink ground.
    backgroundElement: '#10233B',
    backgroundSelected: '#183250',
    textSecondary: '#8CA0AE',
    /** Brand / primary accent — Dosely mint. */
    tint: '#34EBB4',
    onTint: '#0A1626',
    border: '#20374F',
    success: '#2FD9A0',
    warning: '#F2B84B',
    danger: '#FF6B6B',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

/**
 * Accent palette. Each medication gets its own hue so a list of meds reads as
 * distinct items at a glance instead of a wall of one color. `from`/`to` drive
 * gradients; `solid` is for text, icons, and bars.
 */
export const Accents = [
  { solid: '#34EBB4', from: '#5FF2C8', to: '#17C79A' }, // mint (brand)
  { solid: '#2CC7D4', from: '#54DBE6', to: '#159FB0' }, // aqua
  { solid: '#5B9DFF', from: '#7FB4FF', to: '#3D7FE6' }, // sky
  { solid: '#9B8CFF', from: '#B7ACFF', to: '#7A67F0' }, // violet
  { solid: '#F5B24C', from: '#FFC96B', to: '#E0912A' }, // amber
  { solid: '#F27897', from: '#FF9BB2', to: '#D9587A' }, // rose
] as const;

export type Accent = (typeof Accents)[number];

/** Stable accent for a medication id, so a med keeps its color across renders. */
export function accentFor(seed: string): Accent {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return Accents[Math.abs(hash) % Accents.length];
}

/** Hero gradients for the headline card on Today, per color scheme. A rich
 * teal→emerald→mint sweep — brand mint, but deep enough for white text. */
export const HeroGradient = {
  light: ['#0E3B44', '#115E52', '#1A9A7B'] as const,
  dark: ['#0E3B44', '#115E52', '#1A9A7B'] as const,
};
