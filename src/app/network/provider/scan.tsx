import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { Muted, Notice } from '@/features/care/components/care-ui';
import { tokenFromInput } from '@/lib/care/care-client';

/**
 * Scan a patient's invite QR at the counter. The code only pre-fills the
 * portal's connect box; connecting is still an explicit tap there.
 */
export default function ScanInviteScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [note, setNote] = useState<string | null>(null);
  // Codes fire repeatedly while in frame — latch after the first good one.
  const handled = useRef(false);

  const onScan = useCallback(
    ({ data }: { data: string }) => {
      if (handled.current) return;
      const token = tokenFromInput(data);
      if (!token) {
        setNote("That isn't a Dosely invite code.");
        return;
      }
      handled.current = true;
      router.replace({ pathname: '/network/provider', params: { redeem: token } });
    },
    [router],
  );

  if (!permission?.granted) {
    return (
      <Screen edges={['bottom']}>
        <View style={styles.center}>
          <Muted>The camera is used only to read the patient&apos;s invite code. Nothing is recorded.</Muted>
          <Button title="Allow camera" onPress={requestPermission} />
          <Button title="Paste the link instead" variant="ghost" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <View style={styles.camera}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={onScan}
        />
        <View style={styles.reticle} pointerEvents="none">
          <View style={styles.frame} />
        </View>
      </View>
      <View style={styles.footer}>
        <Notice message={note} tone="high" />
        <Muted>Point the camera at the code on the patient&apos;s screen.</Muted>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', gap: Spacing.three },
  camera: { flex: 1, borderRadius: 24, overflow: 'hidden', marginTop: Spacing.three },
  reticle: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 240, height: 240, borderWidth: 3, borderColor: '#FFFFFF', borderRadius: 24 },
  footer: { paddingVertical: Spacing.three, gap: Spacing.two, alignItems: 'center' },
});
