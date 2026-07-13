import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, IconButton } from '@/components/ui';

/**
 * Props pour le composant DashboardHeader
 */
interface DashboardHeaderProps {
  /**
   * Nom d'affichage de l'utilisateur (ex: "Jean", "Marie")
   */
  displayName: string;

  /**
   * Nombre de notifications non lues
   */
  unreadCount: number;

  /**
   * Callback appelé lors du clic sur la cloche de notifications
   */
  onNotificationsPress: () => void;

  /**
   * Callback appelé lors du clic sur le bouton settings
   */
  onSettingsPress: () => void;
}

/**
 * Composant Header personnalisé pour le Dashboard
 *
 * Affiche :
 * - Greeting personnalisé avec le nom de l'utilisateur
 * - Sous-titre "Heureux de vous revoir"
 * - 2 boutons d'action à droite :
 *   1. Cloche notifications avec badge count
 *   2. Bouton Settings
 *
 * @example
 * ```tsx
 * <DashboardHeader
 *   displayName="Jean"
 *   unreadCount={3}
 *   onNotificationsPress={() => navigation.navigate('Notifications')}
 *   onSettingsPress={() => navigation.navigate('Settings')}
 * />
 * ```
 */
export default function DashboardHeader({
  displayName,
  unreadCount,
  onNotificationsPress,
  onSettingsPress,
}: DashboardHeaderProps) {
  const { t } = useTranslation();

  // Extraire le prénom (premier mot) pour éviter les noms trop longs
  const firstName = displayName.split(' ')[0];

  return (
    <View className="bg-aquacare-primary px-5 pt-16 pb-5">
      {/* Greeting Row */}
      <View className="flex-row justify-between items-start">
        <View className="flex-1 mr-4">
          <AppText variant="screenTitle" color="inverse" style={{ marginBottom: 4 }}>
            {t('hello')}, {firstName}!
          </AppText>
          <AppText variant="body" color="inverse">{t('welcomeBoard')}</AppText>
        </View>

        {/* Right Actions */}
        <View className="flex-row gap-3 items-center">
          {/* Notifications Bell */}
          <IconButton
            icon="notifications-outline"
            accessibilityLabel={t('notificationsBell')}
            onPress={onNotificationsPress}
            variant="ghost"
            tone="inverse"
            badge={unreadCount}
          />

          {/* Settings */}
          <IconButton
            icon="settings-outline"
            accessibilityLabel={t('settingsButton')}
            onPress={onSettingsPress}
            variant="ghost"
            tone="inverse"
          />
        </View>
      </View>
    </View>
  );
}
