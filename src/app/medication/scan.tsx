import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { scanMedicationLabel, suggestTimes } from '@/lib/ai/scan-label';
import { lookupBarcode } from '@/lib/drug/ndc';

type Mode = 'barcode' | 'photo';

type Status =
  | { kind: 'ready' }
  | { kind: 'working'; note: string }
  | { kind: 'problem'; note: string };

/**
 * Add a medication by scanning. Two paths:
 *  - Barcode → looked up in the FDA NDC directory (grounded, no AI, no key).
 *  - Photo   → transcribed by Claude vision using the user's own API key.
 *
 * Neither path saves anything. Both hand their result to the normal "add
 * medication" form so the user reviews and confirms every field first.
 */
export default function ScanScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>('barcode');
  const [status, setStatus] = useState<Status>({ kind: 'ready' });
  const cameraRef = useRef<CameraView>(null);
  // Barcodes fire repeatedly while the code is in frame — latch after the first.
  const handledRef = useRef(false);

  /** Hand the extracted fields to the add-medication form for review. */
  const goToReview = useCallback(
    (params: Record<string, string>) => {
      router.replace({ pathname: '/medication/new', params });
    },
    [router],
  );

  const onBarcode = useCallback(
    async ({ data }: { data: string }) => {
      if (handledRef.current) return;
      handledRef.current = true;
      setStatus({ kind: 'working', note: 'Looking up this barcode with the FDA…' });

      const result = await lookupBarcode(data);

      if (result.status === 'found') {
        const p = result.product;
        goToReview({
          name: p.name,
          strength: p.strength ?? '',
          form: p.form ?? '',
          source: 'barcode',
        });
        return;
      }

      handledRef.current = false;
      setStatus({
        kind: 'problem',
        note:
          result.status === 'not-a-drug-code'
            ? "That barcode isn't a US medication code. Try the photo mode instead."
            : "That medication isn't in the FDA directory. Try the photo mode, or add it by hand.",
      });
    },
    [goToReview],
  );

  const onPhoto = useCallback(async () => {
    if (!cameraRef.current) return;
    setStatus({ kind: 'working', note: 'Reading the label…' });

    const shot = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.6 });
    if (!shot?.base64) {
      setStatus({ kind: 'problem', note: "Couldn't capture the photo. Try again." });
      return;
    }

    const result = await scanMedicationLabel({ base64: shot.base64 });

    if (result.status === 'ok') {
      const l = result.label;
      goToReview({
        name: l.name,
        strength: l.strength,
        form: l.form,
        quantityOnHand: l.quantity,
        times: suggestTimes(l.timesPerDay).join(','),
        confidence: l.confidence,
        source: 'photo',
      });
      return;
    }

    const note =
      result.status === 'no-key'
        ? 'Photo scanning needs your own Anthropic API key. Add one in Settings, or use barcode mode.'
        : result.status === 'not-a-label'
          ? "That doesn't look like a medication label. Try again with the label facing the camera."
          : result.message;
    setStatus({ kind: 'problem', note });
  }, [goToReview]);

  // --- Permission gates -----------------------------------------------------

  if (!permission) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Scan' }} />
        <View style={styles.center}>
          <ActivityIndicator color={theme.tint} />
        </View>
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Scan' }} />
        <View style={styles.center}>
          <Ionicons name="camera-outline" size={48} color={theme.textSecondary} />
          <Text style={[styles.title, { color: theme.text }]}>Camera access needed</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            DoselyAI uses the camera to read the barcode or label on your medication. Photos are
            never stored, and barcode lookups send only the code.
          </Text>
          <Button title="Allow camera" onPress={requestPermission} />
          <Button title="Enter it by hand instead" variant="ghost" onPress={() => router.replace('/medication/new')} />
        </View>
      </Screen>
    );
  }

  const busy = status.kind === 'working';

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: 'Scan medication' }} />
      <View style={styles.wrap}>
        <Animated.View entering={FadeIn.duration(300)} style={styles.cameraWrap}>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            // Only listen for barcodes in barcode mode, so photo mode isn't
            // interrupted by a stray code in the frame.
            barcodeScannerSettings={{ barcodeTypes: ['upc_a', 'upc_e', 'ean13', 'ean8', 'code128'] }}
            onBarcodeScanned={mode === 'barcode' && !busy ? onBarcode : undefined}
          />
          <View style={styles.reticle} pointerEvents="none">
            <View style={[styles.frame, { borderColor: busy ? theme.success : '#FFFFFF' }]} />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(360)} style={styles.controls}>
          <View style={[styles.segment, { backgroundColor: theme.backgroundElement }]}>
            {(['barcode', 'photo'] as Mode[]).map((m) => (
              <Button
                key={m}
                title={m === 'barcode' ? 'Barcode' : 'Photo of label'}
                variant={mode === m ? 'primary' : 'ghost'}
                style={styles.segmentButton}
                onPress={() => {
                  handledRef.current = false;
                  setStatus({ kind: 'ready' });
                  setMode(m);
                }}
              />
            ))}
          </View>

          <Card>
            {status.kind === 'working' ? (
              <View style={styles.row}>
                <ActivityIndicator color={theme.tint} />
                <Text style={[styles.body, { color: theme.text, flex: 1 }]}>{status.note}</Text>
              </View>
            ) : status.kind === 'problem' ? (
              <View style={styles.row}>
                <Ionicons name="alert-circle" size={22} color={theme.warning} />
                <Text style={[styles.body, { color: theme.text, flex: 1 }]}>{status.note}</Text>
              </View>
            ) : (
              <Text style={[styles.body, { color: theme.textSecondary }]}>
                {mode === 'barcode'
                  ? 'Point the camera at the barcode on the bottle. We look it up in the official FDA directory.'
                  : 'Fill the frame with the label, then tap Capture. Everything it reads is yours to review before saving.'}
              </Text>
            )}
          </Card>

          {mode === 'photo' ? (
            <Button title="Capture label" onPress={onPhoto} loading={busy} />
          ) : null}

          <Button
            title="Enter it by hand"
            variant="secondary"
            onPress={() => router.replace('/medication/new')}
          />

          <Text style={[styles.fine, { color: theme.textSecondary }]}>
            Scanning helps you fill the form faster — always check the details against your bottle.
            {Platform.OS === 'web' ? ' Camera support varies by browser.' : ''}
          </Text>
        </Animated.View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: Spacing.three, paddingVertical: Spacing.three },
  cameraWrap: { flex: 1, borderRadius: 20, overflow: 'hidden', minHeight: 220 },
  reticle: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: { width: '78%', height: '55%', borderWidth: 3, borderRadius: 16, opacity: 0.9 },
  controls: { gap: Spacing.three },
  segment: { flexDirection: 'row', borderRadius: 14, padding: 4, gap: 4 },
  segmentButton: { flex: 1, minHeight: 42 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  title: { fontSize: 20, fontWeight: '800' },
  body: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  fine: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
});
