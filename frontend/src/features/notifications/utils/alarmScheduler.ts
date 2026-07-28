import * as Notifications from 'expo-notifications';
import { FeedingPlan } from '@/types/aquaculture';

export const FEEDING_ALARM_DATA_TYPE = 'feeding_alarm';
export const FEEDING_ALARM_CATEGORY_ID = 'feeding_alarm_actions';
export const FEEDING_ALARM_ACTION_FEED_NOW = 'feed_now';
export const FEEDING_ALARM_ACTION_SNOOZE_10M = 'snooze_10m';
export const FEEDING_ALARM_RELAUNCH_SECONDS: number[] = [0, 30, 60, 90];

export interface FeedingAlarmMessages {
  title: string;
  body: string; // Supports {{cycleName}} and {{time}}
  actionFeedNow: string;
  actionSnooze10m: string;
}

export interface FeedingAlarmScheduleResult {
  ids: string[];
  permissionGranted: boolean;
}

type MealTime = { hour: number; minute: number };

/**
 * Mapping AquaCare des horaires de repas selon meals_per_day
 * Source : spécifications backend (horaires fixes validés terrain)
 */
export const getMealTimes = (mealsPerDay: number): MealTime[] => {
  switch (mealsPerDay) {
    case 1:
      return [{ hour: 13, minute: 0 }];
    case 2:
      return [
        { hour: 8, minute: 0 },
        { hour: 17, minute: 0 },
      ];
    case 3:
      return [
        { hour: 8, minute: 0 },
        { hour: 13, minute: 0 },
        { hour: 18, minute: 0 },
      ];
    case 4:
      return [
        { hour: 7, minute: 0 },
        { hour: 11, minute: 0 },
        { hour: 15, minute: 0 },
        { hour: 18, minute: 0 },
      ];
    default:
      return [{ hour: 8, minute: 0 }];
  }
};

/**
 * Formate un horaire en string lisible (ex: "08h00")
 */
export const formatMealTime = ({ hour, minute }: { hour: number; minute: number }): string => {
  const h = hour.toString().padStart(2, '0');
  const m = minute.toString().padStart(2, '0');
  return `${h}h${m}`;
};

const interpolateTemplate = (template: string, values: Record<string, string>): string => {
  let rendered = template;
  Object.entries(values).forEach(([key, value]) => {
    rendered = rendered.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), value);
  });
  return rendered;
};

const getTimeWithOffset = (mealTime: MealTime, offsetSeconds: number): { hour: number; minute: number; second: number } => {
  const base = new Date(2024, 0, 1, mealTime.hour, mealTime.minute, 0, 0);
  base.setSeconds(base.getSeconds() + offsetSeconds);
  return {
    hour: base.getHours(),
    minute: base.getMinutes(),
    second: base.getSeconds(),
  };
};

export const registerFeedingAlarmCategory = async (
  messages: Pick<FeedingAlarmMessages, 'actionFeedNow' | 'actionSnooze10m'>
): Promise<void> => {
  await Notifications.setNotificationCategoryAsync(FEEDING_ALARM_CATEGORY_ID, [
    {
      identifier: FEEDING_ALARM_ACTION_FEED_NOW,
      buttonTitle: messages.actionFeedNow,
      options: {
        opensAppToForeground: false,
      },
    },
    {
      identifier: FEEDING_ALARM_ACTION_SNOOZE_10M,
      buttonTitle: messages.actionSnooze10m,
      options: {
        opensAppToForeground: false,
      },
    },
  ]);
};

/**
 * Programme des alarmes locales quotidiennes pour un plan d'alimentation.
 * Déclenche même sans internet et app fermée.
 *
 * @returns tableau des notificationIds planifiées
 */
export const scheduleFeedingAlarms = async (
  plan: FeedingPlan,
  cycleName: string,
  messages: FeedingAlarmMessages
): Promise<FeedingAlarmScheduleResult> => {
  const mealTimes = getMealTimes(plan.meals_per_day);
  const scheduledIds: string[] = [];

  // Vérifier les permissions avant de planifier
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    const { status: newStatus } = await Notifications.requestPermissionsAsync();
    if (newStatus !== 'granted') {
      return { ids: [], permissionGranted: false };
    }
  }

  for (const mealTime of mealTimes) {
    for (const offsetSeconds of FEEDING_ALARM_RELAUNCH_SECONDS) {
      const alarmTime = getTimeWithOffset(mealTime, offsetSeconds);
      const notifId = await Notifications.scheduleNotificationAsync({
        content: {
          title: messages.title,
          body: interpolateTemplate(messages.body, {
            cycleName,
            time: formatMealTime(mealTime),
          }),
          sound: 'default',
          categoryIdentifier: FEEDING_ALARM_CATEGORY_ID,
          data: {
            type: FEEDING_ALARM_DATA_TYPE,
            planId: plan.id,
            cycleId: plan.cycle,
            cycleName,
            mealHour: mealTime.hour,
            mealMinute: mealTime.minute,
            offsetSeconds,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
          hour: alarmTime.hour,
          minute: alarmTime.minute,
          second: alarmTime.second,
          repeats: true,
        },
      });

      scheduledIds.push(notifId);
    }
  }

  return { ids: scheduledIds, permissionGranted: true };
};

/**
 * Annule les alarmes locales par leurs IDs.
 */
export const cancelFeedingAlarms = async (notifIds: string[]): Promise<void> => {
  await Promise.all(
    notifIds.map((id) => Notifications.cancelScheduledNotificationAsync(id))
  );
};
