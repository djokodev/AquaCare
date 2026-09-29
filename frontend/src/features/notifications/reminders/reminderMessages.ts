import type { TFunction } from 'i18next';

import type { FeedingReminderMessages } from './feedingReminders';

export const getFeedingReminderMessages = (t: TFunction): FeedingReminderMessages => ({
  title: t('feedingAlarmTitle'),
  body: t('feedingAlarmBody'),
  bodyWithPlan: t('feedingAlarmBodyWithPlan'),
  snoozeBody: t('feedingAlarmBodySnooze'),
  actionFeedNow: t('alarmActionFeedNow'),
  actionSnooze: t('alarmActionSnooze5m'),
  channelName: t('feedingAlarmChannelName'),
  channelDescription: t('feedingAlarmChannelDescription'),
});

export const getReminderLocale = (language: string | undefined): string =>
  language?.startsWith('en') ? 'en-US' : 'fr-FR';
