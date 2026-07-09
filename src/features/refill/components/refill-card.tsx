import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { parseDateKey } from '@/features/adherence/dates';
import { useTheme } from '@/hooks/use-theme';
import { refillStatus } from '@/features/refill/refill';
import type { Medication } from '@/store/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' -> 'Jan 31'. */
function formatDate(key: string): string {
  const d = parseDateKey(key);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

type Theme = Record<ThemeColor, string>;

/** Refill status for one medication. Renders nothing when tracking is off. */
export function RefillCard({ med }: { med: Medication }) {
  const theme = useTheme() as Theme;
  const status = refillStatus(med);

  if (status.level === 'untracked') return null;

  const { color, icon, headline, detail } = describe(status, theme);

  return (
    <Card>
      <Text style={[styles.label, { color: theme.textSecondary }]}>Refill</Text>
      <View style={styles.row}>
        <Ionicons name={icon} size={22} color={color} />
        <View style={styles.flex}>
          <Text style={[styles.headline, { color }]}>{headline}</Text>
          {detail ? <Text style={[styles.detail, { color: theme.textSecondary }]}>{detail}</Text> : null}
        </View>
      </View>
    </Card>
  );
}

type Described = {
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  headline: string;
  detail: string | null;
};

function describe(status: ReturnType<typeof refillStatus>, theme: Theme): Described {
  const left = `≈${status.remaining} left`;
  switch (status.level) {
    case 'out':
      return { color: theme.danger, icon: 'alert-circle', headline: 'Out of supply', detail: 'Time to refill this medication.' };
    case 'soon':
      return {
        color: theme.warning,
        icon: 'time',
        headline: `Refill soon — ${status.daysLeft} day${status.daysLeft === 1 ? '' : 's'} left`,
        detail: status.runOutDate ? `${left} · runs out ${formatDate(status.runOutDate)}` : left,
      };
    case 'unknown':
      return {
        color: theme.textSecondary,
        icon: 'help-circle',
        headline: 'Taken as needed',
        detail: 'Add scheduled times to predict when this runs out.',
      };
    default: // 'ok'
      return {
        color: theme.success,
        icon: 'checkmark-circle',
        headline: `${status.daysLeft} days of supply`,
        detail: status.runOutDate ? `${left} · refill by ${formatDate(status.runOutDate)}` : left,
      };
  }
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },
  flex: { flex: 1 },
  headline: { fontSize: 17, fontWeight: '700' },
  detail: { fontSize: 14, lineHeight: 20, marginTop: 2 },
});
