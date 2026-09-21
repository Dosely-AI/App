import QRCode from 'qrcode';
import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

/**
 * A QR code drawn with SVG: the matrix comes from `qrcode`, and every dark
 * module becomes part of one path, so it renders crisply at any size on
 * iOS, Android and web. Always dark-on-white for reliable scanning.
 */
export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const { path, cells } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.modules.get(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
      }
    }
    return { path: d, cells: n + 8 }; // 4-module quiet zone on each side
  }, [value]);

  return (
    <View accessible accessibilityRole="image" accessibilityLabel="QR code">
      <Svg width={size} height={size} viewBox={`0 0 ${cells} ${cells}`}>
        <Rect x={0} y={0} width={cells} height={cells} fill="#FFFFFF" />
        <Path d={path} fill="#0A1626" />
      </Svg>
    </View>
  );
}
