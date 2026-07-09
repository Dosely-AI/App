import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

import { dateKey } from '@/features/adherence/dates';
import { TAKEN_ACTION, configureNotifications, syncReminders } from '@/lib/notifications/reminders';
import { useAppStore } from '@/store/app-store';

/**
 * Wires up dose reminders: configures notifications once, logs a dose when the
 * user taps "Mark as taken", and re-schedules whenever medications change.
 */
export function useReminders(): void {
  const medications = useAppStore((s) => s.medications);

  useEffect(() => {
    configureNotifications();

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.actionIdentifier !== TAKEN_ACTION) return;
      const data = response.notification.request.content.data as {
        medId?: string;
        time?: string;
      };
      if (data.medId && data.time) {
        useAppStore.getState().logDose(data.medId, dateKey(new Date()), data.time);
      }
    });

    return () => sub.remove();
  }, []);

  useEffect(() => {
    void syncReminders(medications);
  }, [medications]);
}
