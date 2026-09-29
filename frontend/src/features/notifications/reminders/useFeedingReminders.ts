import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import type { RootState } from '@/store/store';
import {
  DEFAULT_FEEDING_REMINDER_SETTINGS,
  FeedingReminderSettings,
  MAX_REMINDER_TIMES,
  ReminderScheduleStatus,
  ReminderTime,
  loadPlanSnapshot,
  loadReminderSettings,
  normalizeSettings,
  saveReminderSettings,
  scheduleFeedingReminders,
  sortReminderTimes,
} from './feedingReminders';
import { getFeedingReminderMessages, getReminderLocale } from './reminderMessages';

const newTimeId = () => `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** État et actions de l'écran « Rappels de nourrissage ». */
export function useFeedingReminders() {
  const { t, i18n } = useTranslation();
  const userId = useSelector((state: RootState) => state.auth.user?.id ?? null);
  const [settings, setSettings] = useState<FeedingReminderSettings>(normalizeSettings(DEFAULT_FEEDING_REMINDER_SETTINGS));
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ReminderScheduleStatus | null>(null);
  // Dernière valeur connue : évite qu'un double tap rapide reparte d'un état périmé.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    let mounted = true;
    if (!userId) {
      setLoading(false);
      return;
    }
    loadReminderSettings(userId)
      .then((stored) => {
        if (mounted) {
          settingsRef.current = stored;
          setSettings(stored);
        }
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [userId]);

  const apply = useCallback(
    async (next: FeedingReminderSettings, requestPermission = false): Promise<ReminderScheduleStatus> => {
      const normalized = normalizeSettings(next);
      settingsRef.current = normalized;
      setSettings(normalized);
      if (!userId) {
        return 'error';
      }
      await saveReminderSettings(userId, normalized);
      const result = await scheduleFeedingReminders({
        settings: normalized,
        snapshot: await loadPlanSnapshot(userId),
        messages: getFeedingReminderMessages(t),
        locale: getReminderLocale(i18n.language),
        requestPermission,
      });
      setStatus(result.status);
      return result.status;
    },
    [i18n.language, t, userId],
  );

  const setEnabled = useCallback(
    (enabled: boolean) => apply({ ...settingsRef.current, enabled }, enabled),
    [apply],
  );

  const saveTime = useCallback(
    (time: { id?: string; hour: number; minute: number }) => {
      const settings = settingsRef.current;
      const exists = time.id ? settings.times.some((item) => item.id === time.id) : false;
      if (!exists && settings.times.length >= MAX_REMINDER_TIMES) {
        return Promise.resolve<ReminderScheduleStatus>('error');
      }
      const nextTime: ReminderTime = { id: time.id ?? newTimeId(), hour: time.hour, minute: time.minute };
      const times = exists
        ? settings.times.map((item) => (item.id === nextTime.id ? nextTime : item))
        : [...settings.times, nextTime];
      return apply({ ...settings, times: sortReminderTimes(times) });
    },
    [apply],
  );

  const removeTime = useCallback(
    (id: string) => apply({
      ...settingsRef.current,
      times: settingsRef.current.times.filter((item) => item.id !== id),
    }),
    [apply],
  );

  const toggleDay = useCallback(
    (day: number) => {
      const current = settingsRef.current;
      const days = current.days.includes(day)
        ? current.days.filter((item) => item !== day)
        : [...current.days, day];
      return apply({ ...current, days });
    },
    [apply],
  );

  const setBypassDnd = useCallback(
    (bypassDnd: boolean) => apply({ ...settingsRef.current, bypassDnd }),
    [apply],
  );

  return {
    settings,
    loading,
    status,
    canAddTime: settings.times.length < MAX_REMINDER_TIMES,
    setEnabled,
    saveTime,
    removeTime,
    toggleDay,
    setBypassDnd,
  };
}
