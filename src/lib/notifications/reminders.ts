import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { formatTime12 } from '@/features/medications/schedule';
import { refillStatus } from '@/features/refill/refill';
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

/**
 * Scheduled local notifications are a native capability. On web the
 * expo-notifications scheduling/category APIs don't exist and throw, so every
 * entry point here no-ops on web (the app still runs, just without reminders).
 */
const SUPPORTS_NOTIFICATIONS = Platform.OS !== 'web';

/** Set the foreground behavior, Android channel, and the "Mark as taken" action. */
export async function configureNotifications(): Promise<void> {
  if (configured || !SUPPORTS_NOTIFICATIONS) return;
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
  if (!SUPPORTS_NOTIFICATIONS) return false;
  const { granted } = await Notifications.getPermissionsAsync();
  return granted;
}

export async function requestReminderPermission(): Promise<boolean> {
  if (!SUPPORTS_NOTIFICATIONS) return false;
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
  if (!SUPPORTS_NOTIFICATIONS) return;
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

    await scheduleRefillReminder(med);
  }
}

/** Notify once, `leadDays` before a tracked medication is projected to run out. */
async function scheduleRefillReminder(med: Medication): Promise<void> {
  const status = refillStatus(med);
  if (status.level !== 'ok' && status.level !== 'soon') return;
  if (status.daysLeft == null) return;

  // Fire at 9am, leadDays before the run-out date. If that moment is already
  // past (supply is low now), the in-app Refills view surfaces it instead.
  const leadOffset = status.daysLeft - status.leadDays;
  if (leadOffset <= 0) return;

  const when = new Date();
  when.setHours(9, 0, 0, 0);
  when.setDate(when.getDate() + leadOffset);
  if (when.getTime() <= Date.now()) return;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Refill reminder',
        body: `${med.name} runs low in about ${status.leadDays} day${status.leadDays === 1 ? '' : 's'}. Time to arrange a refill.`,
        data: { medId: med.id, kind: 'refill' },
        sound: 'default',
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: CHANNEL_ID },
    });
  } catch {
    // Non-fatal: a failed refill reminder must not block dose reminders.
  }
}

/** Cancel every scheduled reminder. */
export async function disableReminders(): Promise<void> {
  if (!SUPPORTS_NOTIFICATIONS) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}
