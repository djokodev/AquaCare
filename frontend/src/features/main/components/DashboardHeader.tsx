import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { MAVECAM_COLORS } from '@/constants/colors';

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
    <View className="bg-mavecam-primary px-5 pt-16 pb-5">
      {/* Greeting Row */}
      <View className="flex-row justify-between items-start">
        <View className="flex-1 mr-4">
          <Text className="text-2xl font-bold text-white mb-1">
            {t('hello')}, {firstName}!
          </Text>
          <Text className="text-base text-white/80">{t('welcomeBoard')}</Text>
        </View>

        {/* Right Actions */}
        <View className="flex-row gap-3 items-center">
          {/* Notifications Bell */}
          <TouchableOpacity
            onPress={onNotificationsPress}
            className="relative p-2 bg-white/20 rounded-lg"
            accessibilityLabel={t('notificationsBell')}
            accessibilityHint={
              unreadCount > 0
                ? `${unreadCount} ${t('unreadNotifications')}`
                : t('noUnreadNotifications')
            }
            accessibilityRole="button"
          >
            <Ionicons name="notifications-outline" size={24} color={MAVECAM_COLORS.WHITE} />
            {unreadCount > 0 && (
              <View
                className="absolute -top-1 -right-1 bg-error rounded-full items-center justify-center"
                style={{
                  minWidth: unreadCount > 9 ? 24 : 20,
                  height: unreadCount > 9 ? 24 : 20,
                  paddingHorizontal: unreadCount > 9 ? 4 : 2,
                }}
              >
                <Text className="text-white text-[10px] font-bold">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Settings */}
          <TouchableOpacity
            onPress={onSettingsPress}
            className="p-2 bg-white/20 rounded-lg"
            accessibilityLabel={t('settingsButton')}
            accessibilityRole="button"
          >
            <Ionicons name="settings-outline" size={24} color={MAVECAM_COLORS.WHITE} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
