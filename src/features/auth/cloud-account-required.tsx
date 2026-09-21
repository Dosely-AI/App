import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { passkeysAvailable } from '@/lib/auth/passkey-client';

/**
 * Shown where a feature needs the cloud account: the passkey-backed server
 * account behind sharing, sync and the care network. The email account that
 * opens the app lives on this device only, so these features connect the
 * cloud account separately, right where it's needed.
 */
export function CloudAccountRequired({ what }: { what: string }) {
  const theme = useTheme();
  const router = useRouter();
  const canConnect = passkeysAvailable();

  return (
    <View style={styles.center}>
      <Ionicons name="shield-checkmark-outline" size={44} color={theme.textSecondary} />
      <Text style={[styles.body, { color: theme.textSecondary }]}>
        {what} uses your Dosely cloud account: a passkey (your fingerprint or face) that keeps shared health data tied
        to you alone.
      </Text>
      {canConnect ? (
        <Button title="Connect cloud account" onPress={() => router.push('/cloud-account')} />
      ) : (
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          For now, open DoselyAI on the web to connect it. Passkeys on phones are coming.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  body: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
