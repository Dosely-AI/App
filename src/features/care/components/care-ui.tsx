import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Small building blocks shared by the care-network screens. */

export type Tone = 'ok' | 'watch' | 'high' | 'info' | 'muted';

function toneColor(theme: ReturnType<typeof useTheme>, tone: Tone): string {
  return { ok: theme.success, watch: theme.warning, high: theme.danger, info: theme.tint, muted: theme.textSecondary }[tone];
}

export function SectionLabel({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.section, { color: theme.textSecondary }]}>{children}</Text>;
}

export function Badge({ label, tone = 'info' }: { label: string; tone?: Tone }) {
  const theme = useTheme();
  const color = toneColor(theme, tone);
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  icon,
  right,
  onPress,
}: {
  title: string;
  subtitle?: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  right?: ReactNode;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const body = (
    <View style={styles.row}>
      {icon ? (
        <View style={[styles.icon, { backgroundColor: theme.backgroundSelected }]}>
          <Ionicons name={icon} size={18} color={theme.tint} />
        </View>
      ) : null}
      <View style={styles.flex}>
        <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.rowSub, { color: theme.textSecondary }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} /> : null}
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: active ? theme.tint : theme.border, backgroundColor: active ? theme.backgroundSelected : 'transparent' },
      ]}>
      <Text style={[styles.chipText, { color: active ? theme.text : theme.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

export function Notice({ message, tone = 'info' }: { message: string | null | undefined; tone?: Tone }) {
  const theme = useTheme();
  if (!message) return null;
  return <Text style={[styles.notice, { color: toneColor(theme, tone) }]}>{message}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.muted, { color: theme.textSecondary }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: Spacing.two },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowSub: { fontSize: 13, lineHeight: 18, marginTop: 1 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: 6 },
  chipText: { fontSize: 14, fontWeight: '600' },
  notice: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  muted: { fontSize: 14, lineHeight: 20 },
});
