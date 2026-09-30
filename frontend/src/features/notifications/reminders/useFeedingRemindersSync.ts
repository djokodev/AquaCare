import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useTranslation } from 'react-i18next';

import { loadPlanSnapshot, loadReminderSettings, scheduleFeedingReminders } from './feedingReminders';
import { getFeedingReminderMessages, getReminderLocale } from './reminderMessages';

/**
 * Reprogramme les rappels de nourrissage à l'ouverture de l'application et
 * à chaque retour au premier plan (textes à jour, ration du plan courant).
 * Ne demande jamais la permission : c'est fait quand l'utilisateur active les rappels.
 */
export function useFeedingRemindersSync(userId: string | null | undefined) {
  const { t, i18n } = useTranslation();
  const runningRef = useRef(false);

  const sync = useCallback(async () => {
    if (!userId || runningRef.current) {
      return;
    }
    runningRef.current = true;
    try {
      const [settings, snapshot] = await Promise.all([
        loadReminderSettings(userId),
        loadPlanSnapshot(userId),
      ]);
      await scheduleFeedingReminders({
        settings,
        snapshot,
        messages: getFeedingReminderMessages(t),
        locale: getReminderLocale(i18n.language),
      });
    } finally {
      runningRef.current = false;
    }
  }, [i18n.language, t, userId]);

  useEffect(() => {
    void sync();
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') {
        void sync();
      }
    });
    return () => subscription.remove();
  }, [sync]);
}
