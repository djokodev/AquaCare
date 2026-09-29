/**
 * Rappels de nourrissage : alarmes locales programmées sur le téléphone.
 *
 * - Fonctionnent sans internet et application fermée.
 * - Horaires et jours choisis par le pisciculteur (défaut 8h30 et 16h30).
 * - Fonctionnent avec ou sans plan d'alimentation ; si un plan est connu,
 *   la quantité par repas est indiquée dans l'alarme.
 * - Reprogrammées à chaque ouverture de l'application.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import Constants, { ExecutionEnvironment } from 'expo-constants';

import logger from '@/utils/logger';

export const FEEDING_ALARM_DATA_TYPE = 'feeding_alarm';
export const FEEDING_ALARM_CATEGORY_ID = 'feeding_alarm_actions';
export const FEEDING_ALARM_ACTION_FEED_NOW = 'feed_now';
export const FEEDING_ALARM_ACTION_SNOOZE = 'snooze_5m';
export const FEEDING_ALARM_SNOOZE_MINUTES = 5;
export const FEEDING_ALARM_CHANNEL_ID = 'feeding_alarms';
/** Fichier embarqué via le plugin expo-notifications (build de dev / stores). */
export const FEEDING_ALARM_SOUND = 'feeding_alarm.wav';
export const MAX_REMINDER_TIMES = 6;

/**
 * Expo Go est une app précompilée : elle ne contient pas nos fichiers son.
 * On y utilise le son par défaut pour éviter l'erreur « Custom sound not found ».
 */
const isExpoGo = (): boolean => Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const alarmSound = (): string => (isExpoGo() ? 'default' : FEEDING_ALARM_SOUND);
/** Jours au format Expo : 1 = dimanche ... 7 = samedi. */
export const ALL_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

export interface ReminderTime {
  id: string;
  hour: number;
  minute: number;
}

export interface FeedingReminderSettings {
  enabled: boolean;
  times: ReminderTime[];
  days: number[];
  /** Android : sonner en mode Ne pas déranger (si l'accès est accordé). */
  bypassDnd: boolean;
}

export interface PlanSnapshotEntry {
  unitName: string;
  feedPerMealKg: number;
  /** Date ISO (AAAA-MM-JJ) de fin de validité du plan. */
  endDate: string;
}

export type PlanSnapshot = Record<string, PlanSnapshotEntry>;

export interface FeedingReminderMessages {
  title: string;
  body: string;
  /** Contient {{quantities}}, ex: "Bac 1 : 1,2 kg · Bac 2 : 0,8 kg". */
  bodyWithPlan: string;
  snoozeBody: string;
  actionFeedNow: string;
  actionSnooze: string;
  channelName: string;
  channelDescription: string;
}

export type ReminderScheduleStatus = 'scheduled' | 'disabled' | 'permission_denied' | 'error';

export interface ReminderScheduleResult {
  status: ReminderScheduleStatus;
  scheduledCount: number;
}

export const DEFAULT_FEEDING_REMINDER_SETTINGS: FeedingReminderSettings = {
  enabled: false,
  times: [
    { id: 'default-0830', hour: 8, minute: 30 },
    { id: 'default-1630', hour: 16, minute: 30 },
  ],
  days: [...ALL_WEEKDAYS],
  bypassDnd: false,
};

const settingsKey = (userId: string) => `feeding_reminders_settings_v1:${userId}`;
const offeredKey = (userId: string) => `feeding_reminders_offered_v1:${userId}`;
const snapshotKey = (userId: string) => `feeding_reminders_plan_snapshot_v1:${userId}`;

const isValidTime = (value: unknown): value is ReminderTime => {
  const time = value as ReminderTime;
  return (
    typeof time?.id === 'string' &&
    Number.isInteger(time.hour) && time.hour >= 0 && time.hour <= 23 &&
    Number.isInteger(time.minute) && time.minute >= 0 && time.minute <= 59
  );
};

export const sortReminderTimes = (times: ReminderTime[]): ReminderTime[] =>
  [...times].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));

export const normalizeSettings = (raw: Partial<FeedingReminderSettings> | null | undefined): FeedingReminderSettings => {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_FEEDING_REMINDER_SETTINGS, times: [...DEFAULT_FEEDING_REMINDER_SETTINGS.times] };
  }
  const times = Array.isArray(raw.times) ? raw.times.filter(isValidTime).slice(0, MAX_REMINDER_TIMES) : [];
  const days = Array.isArray(raw.days)
    ? Array.from(new Set(raw.days.filter((day) => Number.isInteger(day) && day >= 1 && day <= 7))).sort()
    : [...ALL_WEEKDAYS];
  return {
    enabled: raw.enabled === true,
    times: sortReminderTimes(times),
    days,
    bypassDnd: raw.bypassDnd === true,
  };
};

export const loadReminderSettings = async (userId: string): Promise<FeedingReminderSettings> => {
  try {
    const raw = await AsyncStorage.getItem(settingsKey(userId));
    return normalizeSettings(raw ? JSON.parse(raw) : null);
  } catch (error) {
    logger.warn('Feeding reminder settings unreadable, defaults used', error);
    return normalizeSettings(null);
  }
};

export const saveReminderSettings = async (userId: string, settings: FeedingReminderSettings): Promise<void> => {
  await AsyncStorage.setItem(settingsKey(userId), JSON.stringify(normalizeSettings(settings)));
};

export const loadPlanSnapshot = async (userId: string): Promise<PlanSnapshot> => {
  try {
    const raw = await AsyncStorage.getItem(snapshotKey(userId));
    const parsed = raw ? (JSON.parse(raw) as PlanSnapshot) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

/** Mémorise la ration par repas d'une unité (appelé à l'affichage du plan). */
export const savePlanSnapshotEntry = async (
  userId: string,
  allocationId: string,
  entry: PlanSnapshotEntry | null,
): Promise<void> => {
  const snapshot = await loadPlanSnapshot(userId);
  if (entry && Number.isFinite(entry.feedPerMealKg) && entry.feedPerMealKg > 0) {
    snapshot[allocationId] = entry;
  } else {
    delete snapshot[allocationId];
  }
  await AsyncStorage.setItem(snapshotKey(userId), JSON.stringify(snapshot));
};

export const getLocalIsoDate = (date: Date = new Date()): string => {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

export const formatReminderTime = ({ hour, minute }: { hour: number; minute: number }): string =>
  `${hour.toString().padStart(2, '0')}h${minute.toString().padStart(2, '0')}`;

const interpolate = (template: string, values: Record<string, string>): string =>
  Object.entries(values).reduce(
    (rendered, [key, value]) => rendered.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), value),
    template,
  );

export const buildReminderBody = (
  snapshot: PlanSnapshot,
  messages: Pick<FeedingReminderMessages, 'body' | 'bodyWithPlan'>,
  locale: string,
  todayIso: string = getLocalIsoDate(),
): string => {
  const numberFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const quantities = Object.values(snapshot)
    .filter((entry) => entry.endDate >= todayIso && entry.feedPerMealKg > 0)
    .sort((a, b) => a.unitName.localeCompare(b.unitName))
    .map((entry) => `${entry.unitName} : ${numberFormat.format(entry.feedPerMealKg)} kg`);
  if (quantities.length === 0) {
    return messages.body;
  }
  return interpolate(messages.bodyWithPlan, { quantities: quantities.join(' · ') });
};

/** Canal Android dédié : importance max, son d'alarme, vibration longue. */
export const ensureFeedingAlarmChannel = async (
  messages: Pick<FeedingReminderMessages, 'channelName' | 'channelDescription'>,
  bypassDnd: boolean,
): Promise<void> => {
  if (Platform.OS !== 'android') {
    return;
  }
  const existing = await Notifications.getNotificationChannelAsync(FEEDING_ALARM_CHANNEL_ID);
  // Son/importance/DND sont figés à la création du canal : on le recrée si besoin.
  if (existing && existing.bypassDnd !== bypassDnd) {
    await Notifications.deleteNotificationChannelAsync(FEEDING_ALARM_CHANNEL_ID);
  }
  await Notifications.setNotificationChannelAsync(FEEDING_ALARM_CHANNEL_ID, {
    name: messages.channelName,
    description: messages.channelDescription,
    importance: Notifications.AndroidImportance.MAX,
    sound: alarmSound(),
    vibrationPattern: [0, 800, 400, 800, 400, 800],
    enableVibrate: true,
    bypassDnd,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.ALARM,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION,
    },
  });
};

export const registerFeedingAlarmCategory = async (
  messages: Pick<FeedingReminderMessages, 'actionFeedNow' | 'actionSnooze'>,
): Promise<void> => {
  await Notifications.setNotificationCategoryAsync(FEEDING_ALARM_CATEGORY_ID, [
    {
      identifier: FEEDING_ALARM_ACTION_FEED_NOW,
      buttonTitle: messages.actionFeedNow,
      options: { opensAppToForeground: false },
    },
    {
      identifier: FEEDING_ALARM_ACTION_SNOOZE,
      buttonTitle: messages.actionSnooze,
      options: { opensAppToForeground: false },
    },
  ]);
};

const isFeedingAlarm = (data: unknown): boolean =>
  (data as { type?: unknown } | null)?.type === FEEDING_ALARM_DATA_TYPE;

/** Annule toutes les alarmes de nourrissage programmées (y compris rappels +5 min). */
export const cancelAllFeedingReminders = async (): Promise<void> => {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((request) => isFeedingAlarm(request.content.data))
        .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
    );
  } catch (error) {
    logger.warn('Unable to cancel feeding reminders', error);
  }
};

const cancelRecurringFeedingReminders = async (): Promise<void> => {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((request) => {
        const data = request.content.data as { isSnooze?: boolean } | null;
        return isFeedingAlarm(data) && data?.isSnooze !== true;
      })
      .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
  );
};

const buildTriggers = (
  time: ReminderTime,
  days: number[],
): Notifications.NotificationTriggerInput[] => {
  if (days.length === ALL_WEEKDAYS.length) {
    return [{
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: time.hour,
      minute: time.minute,
      channelId: FEEDING_ALARM_CHANNEL_ID,
    }];
  }
  return days.map((weekday) => ({
    type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
    weekday,
    hour: time.hour,
    minute: time.minute,
    channelId: FEEDING_ALARM_CHANNEL_ID,
  }));
};

export interface ScheduleOptions {
  settings: FeedingReminderSettings;
  snapshot: PlanSnapshot;
  messages: FeedingReminderMessages;
  locale: string;
  /** true uniquement sur une action explicite de l'utilisateur (activer les rappels). */
  requestPermission?: boolean;
}

/**
 * Remplace les alarmes programmées par celles des réglages courants.
 * Idempotent : peut être appelé à chaque ouverture de l'application.
 */
export const scheduleFeedingReminders = async ({
  settings,
  snapshot,
  messages,
  locale,
  requestPermission = false,
}: ScheduleOptions): Promise<ReminderScheduleResult> => {
  try {
    await cancelRecurringFeedingReminders();

    if (!settings.enabled || settings.times.length === 0 || settings.days.length === 0) {
      return { status: 'disabled', scheduledCount: 0 };
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && requestPermission) {
      ({ status } = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: true, allowBadge: false },
      }));
    }
    if (status !== 'granted') {
      return { status: 'permission_denied', scheduledCount: 0 };
    }

    await ensureFeedingAlarmChannel(messages, settings.bypassDnd);
    await registerFeedingAlarmCategory(messages);

    const body = buildReminderBody(snapshot, messages, locale);
    let scheduledCount = 0;
    for (const time of sortReminderTimes(settings.times).slice(0, MAX_REMINDER_TIMES)) {
      for (const trigger of buildTriggers(time, settings.days)) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: messages.title,
            body,
            sound: alarmSound(),
            priority: Notifications.AndroidNotificationPriority.MAX,
            interruptionLevel: 'timeSensitive',
            categoryIdentifier: FEEDING_ALARM_CATEGORY_ID,
            data: {
              type: FEEDING_ALARM_DATA_TYPE,
              hour: time.hour,
              minute: time.minute,
            },
          },
          trigger,
        });
        scheduledCount += 1;
      }
    }
    return { status: 'scheduled', scheduledCount };
  } catch (error) {
    logger.error('Feeding reminders scheduling failed', error);
    return { status: 'error', scheduledCount: 0 };
  }
};

/** Reprogramme l'alarme reçue dans 5 minutes (bouton « Rappeler dans 5 min »). */
export const scheduleFeedingSnooze = async (
  notification: Notifications.Notification,
  fallback: Pick<FeedingReminderMessages, 'title' | 'snoozeBody'>,
): Promise<void> => {
  const data = (notification.request.content.data ?? {}) as Record<string, unknown>;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: notification.request.content.title ?? fallback.title,
      body: notification.request.content.body ?? fallback.snoozeBody,
      sound: alarmSound(),
      priority: Notifications.AndroidNotificationPriority.MAX,
      interruptionLevel: 'timeSensitive',
      categoryIdentifier: FEEDING_ALARM_CATEGORY_ID,
      data: { ...data, type: FEEDING_ALARM_DATA_TYPE, isSnooze: true },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: FEEDING_ALARM_SNOOZE_MINUTES * 60,
      channelId: FEEDING_ALARM_CHANNEL_ID,
    },
  });
};

export const isFeedingAlarmNotification = (notification: Notifications.Notification): boolean =>
  isFeedingAlarm(notification.request.content.data);

/**
 * Proposition unique d'activer les rappels (après le premier plan généré) :
 * seulement si les rappels sont éteints et que la question n'a jamais été posée.
 */
export const shouldOfferReminders = async (userId: string): Promise<boolean> => {
  try {
    if ((await AsyncStorage.getItem(offeredKey(userId))) === 'true') {
      return false;
    }
    const settings = await loadReminderSettings(userId);
    return !settings.enabled && settings.times.length > 0 && settings.days.length > 0;
  } catch {
    return false;
  }
};

export const markRemindersOffered = async (userId: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(offeredKey(userId), 'true');
  } catch {
    // ignore
  }
};

/** Active les rappels avec les réglages enregistrés (8h30 et 16h30 par défaut). */
export const enableFeedingReminders = async (
  userId: string,
  messages: FeedingReminderMessages,
  locale: string,
): Promise<ReminderScheduleResult> => {
  const settings = { ...(await loadReminderSettings(userId)), enabled: true };
  await saveReminderSettings(userId, settings);
  return scheduleFeedingReminders({
    settings,
    snapshot: await loadPlanSnapshot(userId),
    messages,
    locale,
    requestPermission: true,
  });
};
