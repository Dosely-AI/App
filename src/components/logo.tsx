import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

/**
 * The Dosely mark: a mint droplet with a forward chevron notched out of it, set
 * on a deep-ink tile — "medication, moving forward / staying on track." Pure SVG
 * so it stays crisp at any density, and self-contained so it reads on any
 * background. Brand colors are fixed (they don't follow the theme).
 */
export function DoselyLogo({ size = 44 }: { size?: number }) {
  const INK = '#0A1626';
  const MINT = '#34EBB4';

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="doselyTile" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#13253E" />
          <Stop offset="100%" stopColor={INK} />
        </LinearGradient>
        <LinearGradient id="doselyDrop" x1="0.3" y1="0.05" x2="0.7" y2="1">
          <Stop offset="0%" stopColor="#5FF2C8" />
          <Stop offset="100%" stopColor="#2ED6A6" />
        </LinearGradient>
      </Defs>

      {/* Ink tile with a faint mint-lit edge so it reads on any dark ground */}
      <Rect x="0" y="0" width="100" height="100" rx="26" fill="url(#doselyTile)" />
      <Rect x="1.25" y="1.25" width="97.5" height="97.5" rx="24.75" fill="none" stroke={MINT} strokeOpacity="0.16" strokeWidth="2" />

      {/* Mark: an upright mint droplet with a horizontal checkmark */}
      <Path
        d="M50 22 C 59 38, 72 48, 72 60 A 22 22 0 1 1 28 60 C 28 48, 41 38, 50 22 Z"
        fill="url(#doselyDrop)"
      />
      <Path
        d="M39 60 L47 67 L63 50"
        fill="none"
        stroke={INK}
        strokeWidth={7.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Icon + "Dosely AI" wordmark, for headers and the home screen. */
export function DoselyWordmark({ size = 34 }: { size?: number }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <DoselyLogo size={size} />
      <View style={styles.words}>
        <Text style={[styles.name, { color: theme.text }]}>
          Dosely <Text style={{ color: theme.tint }}>AI</Text>
        </Text>
        <Text style={[styles.tag, { color: theme.textSecondary }]}>Your medication companion</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  words: { gap: 1 },
  name: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  tag: { fontSize: 12, fontWeight: '600' },
});
