import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, IconButton } from '@/components/ui';
import { getDashboardGreetingKey } from '@/features/main/utils/dashboardGreeting';
import { colors, spacing } from '@/theme';

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
  const insets = useSafeAreaInsets();

  // Extraire le prénom (premier mot) pour éviter les noms trop longs
  const firstName = displayName.split(' ')[0];
  const greeting = t(getDashboardGreetingKey(new Date().getHours()));

  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing[3] }]}>
      {/* Greeting Row */}
      <View className="flex-row justify-between items-start">
        <View className="flex-1 mr-4">
          <AppText variant="screenTitle" color="inverse">
            {t('dashboardGreetingWithName', { greeting, name: firstName })}
          </AppText>
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

const styles = StyleSheet.create({
  header: { backgroundColor: colors.brand.primary, paddingHorizontal: spacing[5], paddingBottom: spacing[5] },
});
