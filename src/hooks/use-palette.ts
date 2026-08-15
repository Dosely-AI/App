import { paletteById, type Palette } from '@/constants/palettes';
import { useAppStore } from '@/store/app-store';

/** The user's currently selected appearance palette. */
export function usePalette(): Palette {
  const id = useAppStore((s) => s.palette);
  return paletteById(id);
}
