import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

/**
 * A glowing area chart for the daily-adherence trend: a soft gradient fill under
 * a bright line, with a haloed dot on the latest point. Width is measured so the
 * line stays crisp (no aspect-ratio stretching).
 */
export function TrendChart({
  values,
  height = 120,
  color = '#34EBB4',
}: {
  values: (number | null)[];
  height?: number;
  color?: string;
}) {
  const [w, setW] = useState(0);
  const pts = values.length > 0 ? values.map((v) => v ?? 0) : [0];
  const n = pts.length;
  const pad = 8;
  const chartH = height - pad * 2;

  const x = (i: number) => (n <= 1 ? w / 2 : pad + (i / (n - 1)) * (w - pad * 2));
  const y = (v: number) => pad + (1 - v / 100) * chartH;

  let line = '';
  pts.forEach((v, i) => {
    line += `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
  });
  const area = `${line} L ${x(n - 1).toFixed(1)} ${height - pad} L ${x(0).toFixed(1)} ${height - pad} Z`;
  const lastX = x(n - 1);
  const lastY = y(pts[n - 1]);

  return (
    <View style={{ height }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 ? (
        <Svg width={w} height={height}>
          <Defs>
            <LinearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={color} stopOpacity="0.42" />
              <Stop offset="100%" stopColor={color} stopOpacity="0" />
            </LinearGradient>
            <LinearGradient id="trendLine" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor={color} stopOpacity="0.55" />
              <Stop offset="100%" stopColor={color} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Path d={area} fill="url(#trendArea)" />
          <Path
            d={line}
            fill="none"
            stroke="url(#trendLine)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Circle cx={lastX} cy={lastY} r={7} fill={color} fillOpacity={0.28} />
          <Circle cx={lastX} cy={lastY} r={3.5} fill="#FFFFFF" />
        </Svg>
      ) : (
        <View style={StyleSheet.absoluteFill} />
      )}
    </View>
  );
}
