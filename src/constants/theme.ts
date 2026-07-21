/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#11181C',
    // Softly tinted rather than pure white, so cards read as raised surfaces.
    background: '#F4F6FB',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E4E8F2',
    textSecondary: '#60646C',
    /** Brand / primary accent (matches the splash blue). */
    tint: '#1573E6',
    onTint: '#ffffff',
    border: '#E2E3E8',
    success: '#1F9D55',
    warning: '#B7791F',
    danger: '#D7373F',
  },
  dark: {
    text: '#ECEDEE',
    // Deep blue-charcoal rather than pure black — gives the color washes and
    // card shadows something to sit against instead of a flat void.
    background: '#0B1020',
    backgroundElement: '#161D33',
    backgroundSelected: '#222B45',
    textSecondary: '#B0B4BA',
    tint: '#5EA9FF',
    onTint: '#06121F',
    border: '#2A2C30',
    success: '#3FBF77',
    warning: '#E0A100',
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
  { solid: '#5B7CFA', from: '#7B97FF', to: '#4356DC' }, // indigo
  { solid: '#12B5A5', from: '#33D6C3', to: '#0B9184' }, // teal
  { solid: '#F0883E', from: '#FFAA61', to: '#DD6B1B' }, // amber
  { solid: '#E75A8A', from: '#FF83AC', to: '#CF3E70' }, // rose
  { solid: '#8C5BF6', from: '#AA85FF', to: '#7038DF' }, // violet
  { solid: '#2FA45A', from: '#4FC97C', to: '#1C8546' }, // green
] as const;

export type Accent = (typeof Accents)[number];

/** Stable accent for a medication id, so a med keeps its color across renders. */
export function accentFor(seed: string): Accent {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return Accents[Math.abs(hash) % Accents.length];
}

/** Hero gradients for the headline card on Today, per color scheme. */
export const HeroGradient = {
  light: ['#6D8DFF', '#5B4BE0', '#8B4DD8'] as const,
  dark: ['#3B5BD9', '#4634B0', '#6B2FA8'] as const,
};
