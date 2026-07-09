import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { formatTime12 } from '@/features/medications/schedule';
import type { Medication } from '@/store/types';

/**
 * Local dose reminders. Everything is scheduled on-device with repeating
 * calendar triggers (daily or weekly) — no server, works offline, and works in
 * Expo Go (only remote push needs a dev build).
 */

const CHANNEL_ID = 'dose-reminders';
export const DOSE_CATEGORY = 'dose-reminder';
export const TAKEN_ACTION = 'TAKEN';

let configured = false;

/** Set the foreground behavior, Android channel, and the "Mark as taken" action. */
export async function configureNotifications(): Promise<void> {
  if (configured) return;
  configured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Dose reminders',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }

  await Notifications.setNotificationCategoryAsync(DOSE_CATEGORY, [
    {
      identifier: TAKEN_ACTION,
      buttonTitle: 'Mark as taken',
      options: { opensAppToForeground: false },
    },
  ]);
}

export async function getReminderPermission(): Promise<boolean> {
  const { granted } = await Notifications.getPermissionsAsync();
  return granted;
}

export async function requestReminderPermission(): Promise<boolean> {
  const { granted } = await Notifications.requestPermissionsAsync();
  return granted;
}

/** JS day (0=Sun..6=Sat) -> expo weekday (1=Sun..7=Sat). */
function toExpoWeekday(day: number): number {
  return day + 1;
}

/**
 * Cancel all existing reminders and reschedule from the current medications.
 * Does nothing (beyond cancelling) if notification permission isn't granted.
 */
export async function syncReminders(medications: Medication[]): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!(await getReminderPermission())) return;

  for (const med of medications) {
    for (const time of [...new Set(med.times)]) {
      const [hour, minute] = time.split(':').map(Number);
      if (Number.isNaN(hour) || Number.isNaN(minute)) continue;

      const content: Notifications.NotificationContentInput = {
        title: 'Time for your medication',
        body: `${med.name}${med.strength ? ` (${med.strength})` : ''} — ${formatTime12(time)}`,
        data: { medId: med.id, time },
        categoryIdentifier: DOSE_CATEGORY,
        sound: 'default',
      };

      const days = med.daysOfWeek;
      try {
        if (days.length === 0) {
          await Notifications.scheduleNotificationAsync({
            content,
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DAILY,
              hour,
              minute,
              channelId: CHANNEL_ID,
            },
          });
        } else {
          for (const day of days) {
            await Notifications.scheduleNotificationAsync({
              content,
              trigger: {
                type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
                weekday: toExpoWeekday(day),
                hour,
                minute,
                channelId: CHANNEL_ID,
              },
            });
          }
        }
      } catch {
        // Ignore individual scheduling failures so one bad entry can't block the rest.
      }
    }
  }
}

/** Cancel every scheduled reminder. */
export async function disableReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
