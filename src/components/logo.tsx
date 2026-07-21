import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { HeroGradient } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The Dosely mark: a two-tone capsule set on a gradient badge, with an AI
 * sparkle. Reads as "medication + intelligence" at any size. Pure SVG, so it
 * stays crisp on every screen density.
 */
export function DoselyLogo({ size = 44 }: { size?: number }) {
  const scheme = useColorScheme();
  const [g0, g1, g2] = HeroGradient[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <LinearGradient id="doselyBadge" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor={g0} />
          <Stop offset="55%" stopColor={g1} />
          <Stop offset="100%" stopColor={g2} />
        </LinearGradient>
        <LinearGradient id="doselyPillTop" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#FFFFFF" />
          <Stop offset="100%" stopColor="#EAF0FF" />
        </LinearGradient>
        <LinearGradient id="doselyPillBottom" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#DDE6FF" />
          <Stop offset="100%" stopColor="#C4D2FA" />
        </LinearGradient>
      </Defs>

      {/* Gradient badge */}
      <Rect x="0" y="0" width="64" height="64" rx="17" fill="url(#doselyBadge)" />

      {/* Capsule, tilted — two halves with a seam */}
      <G rotation={-38} originX={30} originY={34}>
        <Rect x={9} y={26} width={42} height={16} rx={8} fill="url(#doselyPillTop)" />
        {/* Bottom half overlaid to two-tone it */}
        <Path
          d="M30 26 H43 A8 8 0 0 1 43 42 H30 Z"
          fill="url(#doselyPillBottom)"
        />
        {/* Seam */}
        <Rect x={29} y={26} width={2} height={16} rx={1} fill="#0A1030" opacity={0.14} />
        {/* Gloss */}
        <Rect x={13} y={28.5} width={30} height={4} rx={2} fill="#FFFFFF" opacity={0.55} />
      </G>

      {/* AI sparkle */}
      <G>
        <Path
          d="M47 13 L48.7 17.3 L53 19 L48.7 20.7 L47 25 L45.3 20.7 L41 19 L45.3 17.3 Z"
          fill="#FFFFFF"
        />
        <Circle cx={17} cy={47} r={2.2} fill="#FFFFFF" opacity={0.85} />
      </G>
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
