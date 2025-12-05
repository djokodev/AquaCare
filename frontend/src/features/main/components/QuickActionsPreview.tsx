import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { MAVECAM_COLORS } from '@/constants/colors';

/**
 * Props pour le composant QuickActionsPreview
 */
interface QuickActionsPreviewProps {
  /**
   * Callback appelé pour ouvrir le Bottom Sheet complet
   */
  onOpenSheet: () => void;

  /**
   * Indique si l'utilisateur a des cycles actifs
   * (utilisé pour les suggestions intelligentes)
   */
  hasActiveCycles: boolean;

  /**
   * Nombre de notifications non lues
   * (ajouté dans les suggestions si > 0)
   */
  unreadCount: number;

  /**
   * Navigation object pour naviguer directement depuis l'aperçu
   */
  navigation: any;
}

/**
 * Action suggérée dans l'aperçu
 */
interface SuggestedAction {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  label: string;
  route: string;
}

/**
 * Composant QuickActionsPreview
 *
 * Affiche un aperçu replié avec 3 actions suggérées intelligemment :
 * - Si cycles actifs → prioriser "Saisie du jour"
 * - Si aucun cycle → prioriser "Nouvel élevage"
 * - Toujours inclure "Catalogue Produits" (commerce)
 * - Si notifications non lues → ajouter "Notifications"
 *
 * Affiche également un bouton "Voir toutes les actions" qui ouvre le Bottom Sheet.
 *
 * @example
 * ```tsx
 * <QuickActionsPreview
 *   onOpenSheet={() => setActionsSheetVisible(true)}
 *   hasActiveCycles={activeCycles.length > 0}
 *   unreadCount={unreadCount}
 *   navigation={navigation}
 * />
 * ```
 */
export default function QuickActionsPreview({
  onOpenSheet,
  hasActiveCycles,
  unreadCount,
  navigation,
}: QuickActionsPreviewProps) {
  const { t } = useTranslation();

  /**
   * Logique de suggestions intelligentes
   * Retourne les 3 actions les plus pertinentes selon le contexte utilisateur
   */
  const suggestedActions = useMemo((): SuggestedAction[] => {
    const actions: SuggestedAction[] = [];

    // Suggestion 1 : Basée sur l'état des cycles
    if (hasActiveCycles) {
      // Si cycles actifs → prioriser saisie quotidienne
      actions.push({
        icon: 'create',
        color: MAVECAM_COLORS.GREEN_LIGHT,
        label: t('dailyLog'),
        route: 'DailyLog',
      });
    } else {
      // Si aucun cycle → prioriser création
      actions.push({
        icon: 'add-circle',
        color: MAVECAM_COLORS.GREEN_PRIMARY,
        label: t('newCycle'),
        route: 'NewCycle',
      });
    }

    // Suggestion 2 : Toujours suggérer catalogue commerce
    actions.push({
      icon: 'storefront-outline',
      color: MAVECAM_COLORS.GREEN_PRIMARY,
      label: t('productCatalog'),
      route: 'ProductCatalog',
    });

    // Suggestion 3 : Notifications si non lues, sinon historique cycles
    if (unreadCount > 0) {
      actions.push({
        icon: 'notifications-outline',
        color: MAVECAM_COLORS.WARNING,
        label: `${t('notifications')} (${unreadCount})`,
        route: 'Notifications',
      });
    } else {
      actions.push({
        icon: 'time-outline',
        color: MAVECAM_COLORS.INFO,
        label: t('cycleHistoryButton'),
        route: 'CycleHistory',
      });
    }

    return actions.slice(0, 3); // Toujours max 3 suggestions
  }, [hasActiveCycles, unreadCount, t]);

  return (
    <View className="px-5 py-5">
      <Text className="text-xl font-bold text-gray-dark mb-4">{t('quickActions')}</Text>

      {/* Suggested Actions Preview */}
      <View className="bg-white rounded-xl shadow-sm overflow-hidden">
        {suggestedActions.map((action, index) => (
          <TouchableOpacity
            key={action.route}
            className={`flex-row items-center p-4 ${
              index < suggestedActions.length - 1 ? 'border-b border-gray-100' : ''
            }`}
            onPress={() => navigation.navigate(action.route)}
            activeOpacity={0.7}
          >
            <View
              className="w-10 h-10 rounded-full items-center justify-center"
              style={{ backgroundColor: `${action.color}20` }}
            >
              <Ionicons name={action.icon as any} size={20} color={action.color} />
            </View>
            <Text className="text-base font-medium text-gray-dark ml-3 flex-1">
              {action.label}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={MAVECAM_COLORS.GRAY_LIGHT} />
          </TouchableOpacity>
        ))}

        {/* View All Button */}
        <TouchableOpacity
          className="flex-row items-center justify-center p-4 bg-gray-50 border-t border-gray-100"
          onPress={onOpenSheet}
          activeOpacity={0.7}
        >
          <Text className="text-base font-semibold text-mavecam-primary mr-2">
            {t('viewAllActions')}
          </Text>
          <Ionicons name="chevron-down" size={20} color={MAVECAM_COLORS.GREEN_PRIMARY} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
