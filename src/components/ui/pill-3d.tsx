import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

/**
 * Photoreal-ish medication props for the home page, drawn as layered SVG.
 *
 * Each pill is built the way a lit object actually reads: a form gradient for
 * volume, a rim light on the shaded edge, a tight specular highlight, and a
 * soft contact shadow on the surface below. The scene is a top-down flat lay,
 * so pills rotate in-plane (which is what a real overhead shot does) and gain
 * depth from parallax rather than from flipping.
 */

export type PillKind = 'capsule' | 'tablet' | 'caplet' | 'gelcap' | 'speckled';

export type PillPalette = {
  /** Main body color, lit side. */
  light: string;
  /** Main body color, shaded side. */
  dark: string;
  /** Secondary color for two-tone capsules. */
  accentLight?: string;
  accentDark?: string;
};

/** Shared soft contact shadow beneath every pill. */
function Shadow({ uid, cx, cy, rx, ry }: { uid: string; cx: number; cy: number; rx: number; ry: number }) {
  return (
    <>
      <Defs>
        <RadialGradient id={`${uid}-sh`} cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#0A1030" stopOpacity="0.38" />
          <Stop offset="60%" stopColor="#0A1030" stopOpacity="0.16" />
          <Stop offset="100%" stopColor="#0A1030" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${uid}-sh)`} />
    </>
  );
}

/** A round, scored tablet. */
function Tablet({ uid, p, speckled = false }: { uid: string; p: PillPalette; speckled?: boolean }) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 140 120">
      <Defs>
        {/* Form shading: lit from the upper-left */}
        <RadialGradient id={`${uid}-body`} cx="34%" cy="28%" r="78%">
          <Stop offset="0%" stopColor={p.light} />
          <Stop offset="55%" stopColor={p.light} />
          <Stop offset="100%" stopColor={p.dark} />
        </RadialGradient>
        {/* Rim light hugging the lower-right edge */}
        <RadialGradient id={`${uid}-rim`} cx="50%" cy="50%" r="50%">
          <Stop offset="82%" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="97%" stopColor="#FFFFFF" stopOpacity="0.5" />
          <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </RadialGradient>
        <LinearGradient id={`${uid}-spec`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
          <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
      </Defs>

      <Shadow uid={uid} cx={72} cy={98} rx={40} ry={9} />

      <G>
        <Circle cx="70" cy="54" r="44" fill={`url(#${uid}-body)`} />
        <Circle cx="70" cy="54" r="44" fill={`url(#${uid}-rim)`} />
        {/* Score line, pressed into the surface */}
        <Path d="M70,16 V92" stroke="#0A1030" strokeOpacity="0.14" strokeWidth="3" strokeLinecap="round" />
        <Path d="M71.5,16 V92" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="1.5" strokeLinecap="round" />
        {speckled ? (
          <G opacity="0.5">
            <Circle cx="52" cy="40" r="2.4" fill={p.dark} />
            <Circle cx="86" cy="47" r="2" fill={p.dark} />
            <Circle cx="60" cy="70" r="2.6" fill={p.dark} />
            <Circle cx="83" cy="74" r="1.8" fill={p.dark} />
            <Circle cx="70" cy="30" r="1.6" fill={p.dark} />
          </G>
        ) : null}
        {/* Tight specular near the light source */}
        <Ellipse cx="55" cy="32" rx="19" ry="10" fill={`url(#${uid}-spec)`} opacity="0.75" />
      </G>
    </Svg>
  );
}

/** A two-tone gelatin capsule. */
function Capsule({ uid, p }: { uid: string; p: PillPalette }) {
  const aLight = p.accentLight ?? '#FFFFFF';
  const aDark = p.accentDark ?? '#DCE3F0';
  return (
    <Svg width="100%" height="100%" viewBox="0 0 160 96">
      <Defs>
        <LinearGradient id={`${uid}-a`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={p.light} />
          <Stop offset="52%" stopColor={p.light} />
          <Stop offset="100%" stopColor={p.dark} />
        </LinearGradient>
        <LinearGradient id={`${uid}-b`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={aLight} />
          <Stop offset="52%" stopColor={aLight} />
          <Stop offset="100%" stopColor={aDark} />
        </LinearGradient>
        <LinearGradient id={`${uid}-gloss`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
          <Stop offset="70%" stopColor="#FFFFFF" stopOpacity="0.05" />
          <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id={`${uid}-under`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.4" />
        </LinearGradient>
      </Defs>

      <Shadow uid={uid} cx={82} cy={80} rx={58} ry={9} />

      <G>
        {/* Body halves — the cap slightly overlaps the barrel, as on a real capsule */}
        <Path d="M80,14 H36 A26,26 0 0 0 36,66 H80 Z" fill={`url(#${uid}-a)`} />
        <Path d="M78,14 H120 A26,26 0 0 1 120,66 H78 Z" fill={`url(#${uid}-b)`} />
        {/* Seam where the two halves meet */}
        <Path d="M79,14 V66" stroke="#0A1030" strokeOpacity="0.12" strokeWidth="2" />
        {/* Bounce light along the bottom edge */}
        <Path d="M36,66 H120 A26,26 0 0 0 120,58 H36 Z" fill={`url(#${uid}-under)`} opacity="0.5" />
        {/* Long gloss band across the top — the giveaway for glossy gelatin */}
        <Rect x="34" y="20" width="88" height="15" rx="7.5" fill={`url(#${uid}-gloss)`} />
      </G>
    </Svg>
  );
}

/** An oblong caplet — longer than a tablet, flatter than a capsule. */
function Caplet({ uid, p }: { uid: string; p: PillPalette }) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 160 96">
      <Defs>
        <LinearGradient id={`${uid}-c`} x1="0.15" y1="0" x2="0.6" y2="1">
          <Stop offset="0%" stopColor={p.light} />
          <Stop offset="58%" stopColor={p.light} />
          <Stop offset="100%" stopColor={p.dark} />
        </LinearGradient>
        <LinearGradient id={`${uid}-cg`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.75" />
          <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
      </Defs>

      <Shadow uid={uid} cx={80} cy={78} rx={54} ry={8} />

      <G>
        <Rect x="22" y="18" width="116" height="46" rx="23" fill={`url(#${uid}-c)`} />
        {/* Debossed score across the middle */}
        <Path d="M80,26 V56" stroke="#0A1030" strokeOpacity="0.13" strokeWidth="2.5" strokeLinecap="round" />
        <Rect x="30" y="23" width="98" height="12" rx="6" fill={`url(#${uid}-cg)`} opacity="0.8" />
      </G>
    </Svg>
  );
}

/** A translucent softgel — brighter core, strong specular. */
function Gelcap({ uid, p }: { uid: string; p: PillPalette }) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 140 110">
      <Defs>
        <RadialGradient id={`${uid}-g`} cx="38%" cy="32%" r="76%">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.92" />
          <Stop offset="34%" stopColor={p.light} />
          <Stop offset="100%" stopColor={p.dark} />
        </RadialGradient>
        <LinearGradient id={`${uid}-gg`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
          <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
      </Defs>

      <Shadow uid={uid} cx={70} cy={92} rx={38} ry={8} />

      <G>
        <Ellipse cx="68" cy="50" rx="40" ry="33" fill={`url(#${uid}-g)`} />
        {/* Bright pinpoint highlight — softgels are very glossy */}
        <Ellipse cx="54" cy="30" rx="16" ry="9" fill={`url(#${uid}-gg)`} />
        <Circle cx="46" cy="26" r="4" fill="#FFFFFF" opacity="0.9" />
      </G>
    </Svg>
  );
}

function PillShape({ kind, uid, p }: { kind: PillKind; uid: string; p: PillPalette }) {
  if (kind === 'capsule') return <Capsule uid={uid} p={p} />;
  if (kind === 'caplet') return <Caplet uid={uid} p={p} />;
  if (kind === 'gelcap') return <Gelcap uid={uid} p={p} />;
  return <Tablet uid={uid} p={p} speckled={kind === 'speckled'} />;
}

type ScatterItem = {
  kind: PillKind;
  x: number; // fraction of width
  y: number; // fraction of height
  size: number; // px width
  rotate: number; // resting in-plane rotation
  depth: number; // 0 far … 1 near
  palette: PillPalette;
};

// Palette drawn from real pharmacy colors: coral, rose, butter, sky, bone, mint.
const CORAL: PillPalette = { light: '#FF8A7A', dark: '#E2564A' };
const ROSE: PillPalette = { light: '#FFA6C4', dark: '#E76A99' };
const BUTTER: PillPalette = { light: '#FFD97A', dark: '#E8AE31' };
const SKY: PillPalette = { light: '#A8D2FF', dark: '#6BA6E8' };
const BONE: PillPalette = { light: '#F3E7D4', dark: '#D2BE9F' };
const MINT: PillPalette = { light: '#8FE6D2', dark: '#3EB39A' };
const PLUM: PillPalette = { light: '#C9A8FF', dark: '#8E63E0' };

const CAP_BONE: PillPalette = { ...BONE, accentLight: '#FFFFFF', accentDark: '#E2E7F2' };
const CAP_SKY: PillPalette = { ...SKY, accentLight: '#FFFFFF', accentDark: '#DDE6F5' };
const CAP_ROSE: PillPalette = { ...ROSE, accentLight: '#FFF3F7', accentDark: '#F0CBDA' };

/**
 * A scattered flat lay that frames the page content — dense in the corners,
 * clear through the middle so text stays legible.
 */
const SCATTER: ScatterItem[] = [
  // Top-left cluster
  { kind: 'capsule', x: 0.02, y: 0.03, size: 116, rotate: -24, depth: 1, palette: CAP_BONE },
  { kind: 'tablet', x: 0.24, y: 0.01, size: 62, rotate: 0, depth: 0.7, palette: ROSE },
  { kind: 'gelcap', x: 0.13, y: 0.16, size: 58, rotate: 14, depth: 0.85, palette: BUTTER },
  { kind: 'speckled', x: 0.33, y: 0.13, size: 46, rotate: 0, depth: 0.5, palette: SKY },
  { kind: 'tablet', x: 0.05, y: 0.28, size: 40, rotate: 0, depth: 0.42, palette: CORAL },

  // Top-right cluster
  { kind: 'caplet', x: 0.74, y: 0.02, size: 104, rotate: 32, depth: 0.95, palette: CORAL },
  { kind: 'tablet', x: 0.92, y: 0.13, size: 58, rotate: 0, depth: 0.75, palette: BUTTER },
  { kind: 'capsule', x: 0.62, y: 0.17, size: 92, rotate: -12, depth: 0.6, palette: CAP_SKY },
  { kind: 'gelcap', x: 0.86, y: 0.29, size: 44, rotate: -8, depth: 0.45, palette: ROSE },

  // Mid edges
  { kind: 'tablet', x: 0.01, y: 0.46, size: 52, rotate: 0, depth: 0.65, palette: PLUM },
  { kind: 'caplet', x: 0.9, y: 0.47, size: 84, rotate: -20, depth: 0.7, palette: MINT },

  // Lower band
  { kind: 'capsule', x: 0.06, y: 0.66, size: 100, rotate: 18, depth: 0.9, palette: CAP_ROSE },
  { kind: 'tablet', x: 0.3, y: 0.74, size: 50, rotate: 0, depth: 0.55, palette: BUTTER },
  { kind: 'speckled', x: 0.52, y: 0.8, size: 44, rotate: 0, depth: 0.4, palette: CORAL },
  { kind: 'gelcap', x: 0.72, y: 0.71, size: 56, rotate: 22, depth: 0.8, palette: MINT },
  { kind: 'tablet', x: 0.88, y: 0.82, size: 62, rotate: 0, depth: 0.62, palette: SKY },
];

export function FloatingPills({
  scrollY,
  width,
  height,
}: {
  scrollY: SharedValue<number>;
  width: number;
  height: number;
}) {
  return (
    <View style={styles.scene} pointerEvents="none">
      {SCATTER.map((item, i) => (
        <ScatterPill key={i} item={item} index={i} scrollY={scrollY} width={width} height={height} />
      ))}
    </View>
  );
}

function ScatterPill({
  item,
  index,
  scrollY,
  width,
  height,
}: {
  item: ScatterItem;
  index: number;
  scrollY: SharedValue<number>;
  width: number;
  height: number;
}) {
  const drift = useSharedValue(0);

  useEffect(() => {
    // Long, offset loops so the scatter never visibly repeats in sync.
    drift.value = withRepeat(withTiming(1, { duration: 5200 + index * 640 }), -1, true);
  }, [index, drift]);

  const style = useAnimatedStyle(() => {
    const float = interpolate(drift.value, [0, 1], [-6, 6]);
    const sway = interpolate(drift.value, [0, 1], [-3, 3]);
    // Nearer pills slide further as the page scrolls.
    const parallax = -scrollY.value * item.depth * 0.55;
    const fade = interpolate(scrollY.value, [0, 300], [1, 0], Extrapolation.CLAMP);

    return {
      opacity: fade,
      transform: [
        { translateY: parallax + float },
        { rotate: `${item.rotate + sway}deg` },
        // Near pills sit fractionally larger, reinforcing depth.
        { scale: 0.9 + item.depth * 0.16 },
      ],
    };
  });

  const w = item.size;
  // Each shape's viewBox aspect, so the SVG box matches the art.
  const ratio = item.kind === 'capsule' || item.kind === 'caplet' ? 96 / 160 : item.kind === 'gelcap' ? 110 / 140 : 120 / 140;

  return (
    <Animated.View
      style={[
        styles.item,
        { left: width * item.x - w / 2, top: height * item.y, width: w, height: w * ratio },
        style,
      ]}>
      <PillShape kind={item.kind} uid={`p${index}`} p={item.palette} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scene: { position: 'absolute', top: 0, left: -64, right: -64, bottom: 0, overflow: 'hidden' },
  item: { position: 'absolute' },
});
