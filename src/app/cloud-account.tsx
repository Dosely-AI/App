import { useRouter } from 'expo-router';

import { PasskeyAuth } from '@/features/auth/passkey-auth';

/** Connect the passkey cloud account used by sharing, sync and the care network. */
export default function CloudAccountScreen() {
  const router = useRouter();
  return (
    <PasskeyAuth
      intro="Your cloud account lets you share with caregivers, your pharmacy and doctors, and sync across devices. Your fingerprint or face unlocks it; there's no password."
      onDone={() => router.back()}
    />
  );
}
