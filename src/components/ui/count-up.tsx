import { useEffect, useRef, useState } from 'react';
import { type StyleProp, Text, type TextStyle } from 'react-native';

/**
 * A number that counts up from 0 to `value` on mount (ease-out), so headline
 * figures animate into place instead of just appearing. Isolated in its own
 * component so only this text re-renders each frame.
 */
export function CountUp({
  value,
  duration = 1000,
  delay = 150,
  suffix = '',
  style,
}: {
  value: number;
  duration?: number;
  delay?: number;
  suffix?: string;
  style?: StyleProp<TextStyle>;
}) {
  const [n, setN] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    let start = 0;
    const step = (t: number) => {
      if (!start) start = t + delay;
      const p = Math.max(0, Math.min(1, (t - start) / duration));
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setN(Math.round(value * eased));
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, [value, duration, delay]);

  return (
    <Text style={style}>
      {n}
      {suffix}
    </Text>
  );
}
