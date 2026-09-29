import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '@/components/ui';
import { colors, spacing } from '@/theme';

/**
 * Props pour le composant DashboardHeader
 */
interface DashboardHeaderProps {
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
 * Affiche uniquement 2 boutons d'action à droite :
 *   1. Cloche notifications avec badge count
 *   2. Bouton Settings
 *
 * @example
 * ```tsx
 * <DashboardHeader
 *   unreadCount={3}
 *   onNotificationsPress={() => navigation.navigate('Notifications')}
 *   onSettingsPress={() => navigation.navigate('Settings')}
 * />
 * ```
 */
export default function DashboardHeader({
  unreadCount,
  onNotificationsPress,
  onSettingsPress,
}: DashboardHeaderProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing[3] }]}>
      <View className="flex-row justify-end items-center">
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
