/**
 * Appearance palettes the user can pick in Settings. Each recolors the primary
 * accent, the drifting aurora "wallpaper", and the Today hero ring — while the
 * deep-ink glass surfaces and semantic colors (success/warning/danger) stay put,
 * so every palette keeps the same premium, legible foundation.
 */
export type Palette = {
  id: string;
  name: string;
  /** Primary accent in dark mode (bright). */
  accent: string;
  /** Primary accent in light mode (deepened for contrast on paper). */
  accentLight: string;
  /** Text/icon color on accent-filled surfaces (buttons, etc.). */
  onAccent: string;
  /** Drifting background wash colors. */
  aurora: readonly string[];
  /** Hero ring gradient (deep → bright). */
  ring: readonly [string, string];
  /** Ring halo + comet-endpoint glow. */
  glow: string;
};

export const PALETTES: readonly Palette[] = [
  {
    id: 'mint',
    name: 'Mint',
    accent: '#34EBB4',
    accentLight: '#0AA47C',
    onAccent: '#0A1626',
    aurora: ['#34EBB4', '#12B5A5', '#2C7DBF', '#3BEAD0', '#1CC7A6'],
    ring: ['#1FC79C', '#8BFFE0'],
    glow: '#34EBB4',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    accent: '#45B6FF',
    accentLight: '#0A78C4',
    onAccent: '#03203A',
    aurora: ['#45B6FF', '#2C7DBF', '#1FC7C7', '#5A9BFF', '#2AA7C4'],
    ring: ['#2C86D6', '#9AD8FF'],
    glow: '#45B6FF',
  },
  {
    id: 'violet',
    name: 'Violet',
    accent: '#B79BFF',
    accentLight: '#7A4FE0',
    onAccent: '#190A2E',
    aurora: ['#B79BFF', '#8C5BF6', '#6C7BFF', '#C77BFF', '#7A67F0'],
    ring: ['#8C5BF6', '#D8C2FF'],
    glow: '#B79BFF',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    accent: '#FF9E6B',
    accentLight: '#E0662B',
    onAccent: '#2A0F04',
    aurora: ['#FF9E6B', '#F0883E', '#FF6FA3', '#FFC96B', '#E75A8A'],
    ring: ['#F0883E', '#FFD49A'],
    glow: '#FF9E6B',
  },
  {
    id: 'rose',
    name: 'Rose',
    accent: '#FF8FB8',
    accentLight: '#D14372',
    onAccent: '#2E0A18',
    aurora: ['#FF8FB8', '#E75A8A', '#C77BFF', '#FF9BB2', '#F0883E'],
    ring: ['#E75A8A', '#FFC2D8'],
    glow: '#FF8FB8',
  },
  {
    id: 'emerald',
    name: 'Emerald',
    accent: '#46E08A',
    accentLight: '#0FA35C',
    onAccent: '#04231C',
    aurora: ['#46E08A', '#12B58A', '#2FA45A', '#5AE0B0', '#1C8546'],
    ring: ['#1F9D6A', '#8BFFC0'],
    glow: '#46E08A',
  },
  {
    id: 'gold',
    name: 'Gold',
    accent: '#F7CB5B',
    accentLight: '#C99418',
    onAccent: '#2A1E04',
    aurora: ['#F7CB5B', '#F0883E', '#F5B24C', '#FFD98A', '#E0A100'],
    ring: ['#E0A100', '#FFE7A6'],
    glow: '#F7CB5B',
  },
];

export const DEFAULT_PALETTE = 'mint';

export function paletteById(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}
