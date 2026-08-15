import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Spacing, accentFor } from '@/constants/theme';
import { dateKey } from '@/features/adherence/dates';
import { formatTime12 } from '@/features/medications/schedule';
import { type DoseSlot, doseSlots, primaryDose, recentDoseSlots } from '@/features/timing/timing';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

const DONE_GRADIENT = ['#2FA45A', '#1C8546'] as const;

function relativeLabel(scheduledMs: number, nowMs: number): string {
  const diff = Math.round((nowMs - scheduledMs) / 60000);
  if (diff >= 0) {
    if (diff < 1) return 'due now';
    if (diff < 60) return `overdue by ${diff} min`;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return `overdue by ${h}h${m ? ` ${m}m` : ''}`;
  }
  const ahead = -diff;
  if (ahead < 60) return `in ${ahead} min`;
  const h = Math.floor(ahead / 60);
  const m = ahead % 60;
  return `in ${h}h${m ? ` ${m}m` : ''}`;
}

/**
 * The home-screen hero action. Tapping logs the medication that is due right now
 * (it switches to a newer dose as its time arrives). Press-and-hold opens a
 * 24-hour timeline to log any dose not yet marked taken.
 */
export function QuickDoseButton() {
  const theme = useTheme();
  const medications = useAppStore((s) => s.medications);
  const logs = useAppStore((s) => s.logs);
  const logDose = useAppStore((s) => s.logDose);

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [open, setOpen] = useState(false);

  // Refresh once a minute so the button follows the clock without interaction.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const today = dateKey(new Date(nowMs));
  const now = useMemo(() => new Date(nowMs), [nowMs]);

  const primary = useMemo(
    () => primaryDose(doseSlots(medications, logs, [today]), now),
    [medications, logs, today, now],
  );
  const timeline = useMemo(
    () => recentDoseSlots(medications, logs, now, 24),
    [medications, logs, now],
  );

  if (medications.length === 0) return null;

  const take = (slot: DoseSlot) => {
    logDose(slot.medId, slot.date, slot.time);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const openTimeline = () => {
    Haptics.selectionAsync().catch(() => {});
    setOpen(true);
  };

  const accent = primary ? accentFor(primary.medId) : null;

  return (
    <View>
      <Pressable
        onPress={() => primary && take(primary)}
        onLongPress={openTimeline}
        delayLongPress={260}
        accessibilityRole="button"
        accessibilityLabel={
          primary ? `Log ${primary.name} at ${formatTime12(primary.time)}` : 'All doses taken'
        }
        style={({ pressed }) => [styles.pressable, pressed && { transform: [{ scale: 0.98 }] }]}>
        <LinearGradient
          colors={accent ? ([accent.from, accent.to] as const) : DONE_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.button}>
          {primary ? (
            <>
              <View style={styles.flex}>
                <Text style={styles.cta}>I TOOK IT</Text>
                <Text style={styles.medName} numberOfLines={1}>
                  {primary.name}
                </Text>
                <Text style={styles.sub}>
                  {formatTime12(primary.time)} · {relativeLabel(primary.scheduledMs, nowMs)}
                </Text>
              </View>
              <View style={styles.tapCircle}>
                <Ionicons name="checkmark" size={30} color="#FFFFFF" />
              </View>
            </>
          ) : (
            <>
              <View style={styles.flex}>
                <Text style={styles.cta}>ALL CAUGHT UP</Text>
                <Text style={styles.sub}>No doses due right now — nice.</Text>
              </View>
              <Ionicons name="checkmark-done" size={34} color="#FFFFFF" />
            </>
          )}
        </LinearGradient>
      </Pressable>

      <Text style={[styles.hint, { color: theme.textSecondary }]}>
        Press and hold to log another dose
      </Text>

      <TimelineSheet
        visible={open}
        onClose={() => setOpen(false)}
        slots={timeline}
        onTake={take}
      />
    </View>
  );
}

/** Bottom-sheet timeline of the last 24 hours. Taken doses are struck through in
 * green and unselectable; untaken ones are tappable to log. */
function TimelineSheet({
  visible,
  onClose,
  slots,
  onTake,
}: {
  visible: boolean;
  onClose: () => void;
  slots: DoseSlot[];
  onTake: (slot: DoseSlot) => void;
}) {
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: theme.background }]}>
        <View style={[styles.grabber, { backgroundColor: theme.border }]} />
        <Text style={[styles.sheetTitle, { color: theme.text }]}>Last 24 hours</Text>
        <Text style={[styles.sheetSub, { color: theme.textSecondary }]}>
          Tap any dose you took. Ones you already logged are checked off.
        </Text>

        {slots.length === 0 ? (
          <Text style={[styles.empty, { color: theme.textSecondary }]}>
            No scheduled doses in the last 24 hours.
          </Text>
        ) : (
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {slots.map((slot, i) => {
              const accent = accentFor(slot.medId);
              const last = i === slots.length - 1;
              return (
                <Pressable
                  key={`${slot.medId}-${slot.date}-${slot.time}`}
                  disabled={slot.taken}
                  onPress={() => onTake(slot)}
                  style={styles.row}>
                  {/* Timeline rail */}
                  <View style={styles.rail}>
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: slot.taken ? theme.success : accent.solid },
                      ]}
                    />
                    {!last ? <View style={[styles.railLine, { backgroundColor: theme.border }]} /> : null}
                  </View>

                  <View style={styles.rowBody}>
                    <Text style={[styles.rowTime, { color: theme.textSecondary }]}>
                      {formatTime12(slot.time)}
                    </Text>
                    <View style={styles.rowText}>
                      <Text
                        style={[
                          styles.rowName,
                          { color: theme.text },
                          slot.taken && { color: theme.textSecondary, textDecorationLine: 'line-through' },
                        ]}
                        numberOfLines={1}>
                        {slot.name}
                      </Text>
                    </View>
                    {slot.taken ? (
                      <View style={styles.takenTag}>
                        <Ionicons name="checkmark-circle" size={20} color={theme.success} />
                      </View>
                    ) : (
                      <View style={[styles.logTag, { borderColor: accent.solid }]}>
                        <Text style={[styles.logText, { color: accent.solid }]}>Log</Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <Pressable onPress={onClose} style={[styles.doneBtn, { backgroundColor: theme.backgroundElement }]}>
          <Text style={[styles.doneText, { color: theme.text }]}>Done</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressable: { borderRadius: 22 },
  button: {
    minHeight: 96,
    borderRadius: 22,
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  cta: { color: '#FFFFFF', fontSize: 13, fontWeight: '900', letterSpacing: 1.4, opacity: 0.9 },
  medName: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginTop: 2 },
  sub: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', opacity: 0.9, marginTop: 2 },
  tapCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { textAlign: 'center', fontSize: 12, fontWeight: '600', marginTop: Spacing.two },

  // Sheet
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.five,
    maxHeight: '80%',
  },
  grabber: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, marginBottom: Spacing.three },
  sheetTitle: { fontSize: 20, fontWeight: '800' },
  sheetSub: { fontSize: 14, lineHeight: 19, marginTop: 2, marginBottom: Spacing.three },
  empty: { fontSize: 14, paddingVertical: Spacing.four, textAlign: 'center' },
  list: { flexGrow: 0 },

  row: { flexDirection: 'row', gap: Spacing.three },
  rail: { alignItems: 'center', width: 14 },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  railLine: { width: 2, flex: 1, marginTop: 2 },
  rowBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: Spacing.four,
  },
  rowTime: { width: 68, fontSize: 13, fontWeight: '700' },
  rowText: { flex: 1 },
  rowName: { fontSize: 16, fontWeight: '700' },
  takenTag: { flexDirection: 'row', alignItems: 'center' },
  logTag: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: 4 },
  logText: { fontSize: 13, fontWeight: '800' },

  doneBtn: { borderRadius: 14, paddingVertical: Spacing.three, alignItems: 'center', marginTop: Spacing.two },
  doneText: { fontSize: 16, fontWeight: '700' },
});
