import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Screen } from '@/components/screen';
import { AuroraBackground } from '@/components/ui/aurora-background';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import {
  buildRefillGroups,
  composeRefillMessage,
  hasPhone,
  type PharmacyGroup,
  type RefillItem,
} from '@/features/pharmacy/pharmacy';
import { useTheme } from '@/hooks/use-theme';
import { callNumber, textNumber } from '@/lib/contact';
import { shareText } from '@/lib/share';
import { useAppStore } from '@/store/app-store';

/** Alert that also works on web (RN Web's Alert is limited to native). */
function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

export default function RefillsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const medications = useAppStore((s) => s.medications);
  const pharmacies = useAppStore((s) => s.pharmacies);
  const patientName = useAppStore((s) => s.profile?.name ?? s.session?.name ?? '');

  const groups = buildRefillGroups(medications, pharmacies);

  return (
    <Screen edges={['bottom']}>
      <AuroraBackground />
      <Stack.Screen options={{ title: 'Refills' }} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {groups.length === 0 ? (
          <EmptyState hasTracking={medications.some((m) => m.quantityOnHand != null)} />
        ) : (
          groups.map((group, i) => (
            <GroupCard
              key={group.pharmacy?.id ?? 'none'}
              group={group}
              patientName={patientName}
              index={i}
              onAssign={(medId) => router.push(`/medication/${medId}`)}
            />
          ))
        )}

        <Pressable onPress={() => router.push('/pharmacies')}>
          <Card>
            <View style={styles.navRow}>
              <View style={[styles.navIcon, { backgroundColor: theme.tint }]}>
                <Ionicons name="business" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.navTitle, { color: theme.text }]}>Manage pharmacies</Text>
                <Text style={[styles.navDesc, { color: theme.textSecondary }]}>
                  Add or edit the pharmacies that fill your prescriptions.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
            </View>
          </Card>
        </Pressable>

        <Text style={[styles.fine, { color: theme.textSecondary }]}>
          DoselyAI never contacts a pharmacy for you. It prepares the request from your own list and
          opens your phone or messages app so you can send it.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function GroupCard({
  group,
  patientName,
  index,
  onAssign,
}: {
  group: PharmacyGroup;
  patientName: string;
  index: number;
  onAssign: (medId: string) => void;
}) {
  const theme = useTheme();
  const { pharmacy, items } = group;
  const message = composeRefillMessage(patientName, pharmacy, items);
  const reachable = hasPhone(pharmacy);

  const onCall = async () => {
    if (pharmacy && !(await callNumber(pharmacy.phone))) {
      notify('Could not start a call', 'No phone app is available on this device.');
    }
  };
  const onText = async () => {
    if (pharmacy && !(await textNumber(pharmacy.phone, message))) {
      notify('Could not open messages', 'No messaging app is available on this device.');
    }
  };
  const onShare = async () => {
    const res = await shareText(message, 'Refill request');
    if (res === 'copied') notify('Copied', 'The refill request was copied to your clipboard.');
    else if (res === 'failed') notify('Could not share', 'Please try again.');
  };

  return (
    <Animated.View entering={FadeInDown.duration(360).delay(index * 60)}>
      <Card>
        {pharmacy ? (
          <>
            <Text style={[styles.pharmName, { color: theme.text }]}>{pharmacy.name}</Text>
            {pharmacy.phone ? (
              <Text style={[styles.pharmMeta, { color: theme.textSecondary }]}>{pharmacy.phone}</Text>
            ) : null}
            {pharmacy.address ? (
              <Text style={[styles.pharmMeta, { color: theme.textSecondary }]}>{pharmacy.address}</Text>
            ) : null}
          </>
        ) : (
          <>
            <Text style={[styles.pharmName, { color: theme.text }]}>No pharmacy set</Text>
            <Text style={[styles.pharmMeta, { color: theme.textSecondary }]}>
              Assign a pharmacy to these medications to call or text a refill request.
            </Text>
          </>
        )}

        <View style={styles.items}>
          {items.map(({ med, status }) => (
            <Pressable
              key={med.id}
              onPress={() => onAssign(med.id)}
              style={styles.itemRow}
              accessibilityRole="button">
              <Ionicons
                name={status.level === 'out' ? 'alert-circle' : 'time'}
                size={18}
                color={status.level === 'out' ? theme.danger : theme.warning}
              />
              <View style={styles.flex}>
                <Text style={[styles.itemName, { color: theme.text }]}>
                  {med.name}
                  {med.strength ? <Text style={styles.itemStrength}> · {med.strength}</Text> : null}
                </Text>
                <Text style={[styles.itemStatus, { color: theme.textSecondary }]}>
                  {statusLine(status.level, status.daysLeft)}
                  {med.rxNumber ? ` · Rx #${med.rxNumber}` : ''}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>

        {pharmacy ? (
          <View style={styles.actions}>
            {reachable ? (
              <>
                <View style={styles.flex}>
                  <Button title="Call" onPress={onCall} />
                </View>
                <View style={styles.flex}>
                  <Button title="Text refill" variant="secondary" onPress={onText} />
                </View>
              </>
            ) : (
              <View style={styles.flex}>
                <Button title="Share request" variant="secondary" onPress={onShare} />
              </View>
            )}
          </View>
        ) : null}

        {pharmacy && reachable ? (
          <Pressable onPress={onShare} style={styles.shareLink}>
            <Text style={[styles.shareLinkText, { color: theme.tint }]}>Share request instead</Text>
          </Pressable>
        ) : null}
        {!pharmacy ? (
          <Pressable onPress={onShare} style={styles.shareLink}>
            <Text style={[styles.shareLinkText, { color: theme.tint }]}>Share request anyway</Text>
          </Pressable>
        ) : null}
      </Card>
    </Animated.View>
  );
}

function statusLine(level: RefillItem['status']['level'], daysLeft: number | null): string {
  if (level === 'out') return 'Out — refill now';
  if (daysLeft === 0) return 'Runs out today';
  return `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
}

function EmptyState({ hasTracking }: { hasTracking: boolean }) {
  const theme = useTheme();
  return (
    <Card>
      <View style={styles.emptyHead}>
        <Ionicons name="checkmark-circle" size={24} color={theme.success} />
        <Text style={[styles.emptyTitle, { color: theme.text }]}>
          {hasTracking ? "You're all stocked up" : 'No refills to track yet'}
        </Text>
      </View>
      <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
        {hasTracking
          ? 'None of your medications are running low right now. Check back when a refill is due.'
          : 'Open a medication and add how many pills you have. DoselyAI will predict when it runs low and help you request a refill.'}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.four, gap: Spacing.three },
  flex: { flex: 1 },
  pharmName: { fontSize: 18, fontWeight: '800' },
  pharmMeta: { fontSize: 14, marginTop: 2 },
  items: { marginTop: Spacing.three, gap: Spacing.three },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  itemName: { fontSize: 16, fontWeight: '700' },
  itemStrength: { fontSize: 14, fontWeight: '500' },
  itemStatus: { fontSize: 13, marginTop: 1 },
  actions: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.four },
  shareLink: { marginTop: Spacing.three, alignItems: 'center' },
  shareLinkText: { fontSize: 14, fontWeight: '600' },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  navIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  navTitle: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  navDesc: { fontSize: 13, lineHeight: 18 },
  fine: { fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: Spacing.two },
  emptyHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.two },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptyBody: { fontSize: 14, lineHeight: 20 },
});
