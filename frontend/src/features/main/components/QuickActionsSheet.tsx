import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { MAVECAM_COLORS } from '@/constants/colors';

/**
 * Props pour le composant QuickActionsSheet
 */
interface QuickActionsSheetProps {
  /**
   * Contrôle la visibilité du Bottom Sheet
   */
  visible: boolean;

  /**
   * Callback appelé pour fermer le Bottom Sheet
   */
  onClose: () => void;

  /**
   * Nombre de notifications non lues
   * (affiche un badge sur l'action "Notifications")
   */
  unreadCount: number;

  /**
   * Navigation object pour naviguer vers les screens
   */
  navigation: any;
}

/**
 * Définition d'une action dans le Bottom Sheet
 */
interface ActionItem {
  id: string;
  labelKey: string; // Clé i18n pour le label
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  route: string;
  category: 'aquaculture' | 'commerce';
  badge?: number; // Nombre affiché dans le badge (ex: notifications)
}

/**
 * Composant QuickActionsSheet
 *
 * Bottom Sheet modal natif (sans dépendance externe) affichant
 * toutes les actions disponibles, catégorisées en :
 * - Aquaculture (8 actions)
 * - Commerce (5 actions)
 *
 * Utilise Modal + ScrollView natifs React Native pour une compatibilité
 * 100% Expo et des performances optimales.
 *
 * @example
 * ```tsx
 * <QuickActionsSheet
 *   visible={actionsSheetVisible}
 *   onClose={() => setActionsSheetVisible(false)}
 *   unreadCount={unreadCount}
 *   navigation={navigation}
 * />
 * ```
 */
export default function QuickActionsSheet({
  visible,
  onClose,
  unreadCount,
  navigation,
}: QuickActionsSheetProps) {
  const { t } = useTranslation();

  /**
   * Configuration des actions Aquaculture (8 actions)
   */
  const aquacultureActions = useMemo((): ActionItem[] => [
    {
      id: 'newCycle',
      labelKey: 'newCycle',
      icon: 'add-circle',
      iconColor: MAVECAM_COLORS.GREEN_PRIMARY,
      route: 'NewCycle',
      category: 'aquaculture',
    },
    {
      id: 'dailyLog',
      labelKey: 'dailyLog',
      icon: 'create',
      iconColor: MAVECAM_COLORS.GREEN_LIGHT,
      route: 'DailyLog',
      category: 'aquaculture',
    },
    {
      id: 'sanitaryLog',
      labelKey: 'sanitaryLog',
      icon: 'warning-outline',
      iconColor: MAVECAM_COLORS.ERROR,
      route: 'SanitaryLog',
      category: 'aquaculture',
    },
    {
      id: 'cycleHistory',
      labelKey: 'cycleHistoryButton',
      icon: 'time-outline',
      iconColor: MAVECAM_COLORS.INFO,
      route: 'CycleHistory',
      category: 'aquaculture',
    },
    {
      id: 'notifications',
      labelKey: 'notifications',
      icon: 'notifications-outline',
      iconColor: MAVECAM_COLORS.WARNING,
      route: 'Notifications',
      category: 'aquaculture',
      badge: unreadCount, // Badge dynamique
    },
    {
      id: 'feedingPlan',
      labelKey: 'feedingPlan',
      icon: 'restaurant-outline',
      iconColor: MAVECAM_COLORS.INFO,
      route: 'FeedingPlan',
      category: 'aquaculture',
    },
    {
      id: 'nutritionalGuides',
      labelKey: 'nutritionalGuides',
      icon: 'library-outline',
      iconColor: MAVECAM_COLORS.GREEN_DARK,
      route: 'NutritionalGuides',
      category: 'aquaculture',
    },
    {
      id: 'statistics',
      labelKey: 'statistics',
      icon: 'bar-chart-outline',
      iconColor: MAVECAM_COLORS.SUCCESS,
      route: 'Statistics',
      category: 'aquaculture',
    },
  ], [unreadCount]);

  /**
   * Configuration des actions Commerce (5 actions)
   */
  const commerceActions = useMemo((): ActionItem[] => [
    {
      id: 'productCatalog',
      labelKey: 'productCatalog',
      icon: 'storefront-outline',
      iconColor: MAVECAM_COLORS.GREEN_PRIMARY,
      route: 'ProductCatalog',
      category: 'commerce',
    },
    {
      id: 'cart',
      labelKey: 'cart',
      icon: 'cart-outline',
      iconColor: MAVECAM_COLORS.WARNING,
      route: 'Cart',
      category: 'commerce',
    },
    {
      id: 'ordersHistory',
      labelKey: 'ordersHistory',
      icon: 'receipt-outline',
      iconColor: MAVECAM_COLORS.INFO,
      route: 'OrdersHistory',
      category: 'commerce',
    },
    {
      id: 'feedingSuggestions',
      labelKey: 'feedingSuggestions',
      icon: 'bulb-outline',
      iconColor: MAVECAM_COLORS.SUCCESS,
      route: 'FeedingSuggestions',
      category: 'commerce',
    },
    {
      id: 'cycleSimulator',
      labelKey: 'cycleSimulator',
      icon: 'calculator-outline',
      iconColor: MAVECAM_COLORS.BLUE,
      route: 'CycleSimulator',
      category: 'commerce',
    },
  ], []);

  /**
   * Gère le clic sur une action
   * Ferme le sheet puis navigue après un petit délai pour une animation fluide
   */
  const handleActionPress = (route: string) => {
    onClose(); // Fermer d'abord le sheet
    // Délai pour animation fluide
    setTimeout(() => {
      navigation.navigate(route);
    }, 300);
  };

  /**
   * Rend une action individuelle
   */
  const renderActionItem = (action: ActionItem) => (
    <TouchableOpacity
      key={action.id}
      className="flex-row items-center p-4 bg-white mb-2 rounded-xl shadow-sm"
      onPress={() => handleActionPress(action.route)}
      activeOpacity={0.7}
    >
      {/* Icône dans un cercle coloré */}
      <View
        className="w-12 h-12 rounded-full items-center justify-center"
        style={{ backgroundColor: `${action.iconColor}20` }}
      >
        <Ionicons name={action.icon} size={24} color={action.iconColor} />
      </View>

      {/* Label de l'action */}
      <Text className="text-base font-medium text-gray-dark ml-3 flex-1">
        {t(action.labelKey)}
      </Text>

      {/* Badge (si défini et > 0) */}
      {action.badge !== undefined && action.badge > 0 && (
        <View className="bg-error rounded-full px-2 py-1 ml-2">
          <Text className="text-white text-xs font-bold">{action.badge}</Text>
        </View>
      )}

      {/* Chevron de navigation */}
      <Ionicons name="chevron-forward" size={20} color={MAVECAM_COLORS.GRAY_LIGHT} />
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View className="flex-row items-center justify-between p-5 border-b border-gray-200">
            <Text className="text-xl font-bold text-gray-dark">{t('quickActions')}</Text>
            <TouchableOpacity
              onPress={onClose}
              className="p-2 bg-gray-100 rounded-full"
              accessibilityLabel={t('close')}
              accessibilityRole="button"
            >
              <Ionicons name="close" size={24} color={MAVECAM_COLORS.GRAY_DARK} />
            </TouchableOpacity>
          </View>

          {/* Actions List */}
          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Aquaculture Section */}
            <View className="mb-4">
              <View className="flex-row items-center mb-3">
                <Ionicons name="fish" size={20} color={MAVECAM_COLORS.GREEN_PRIMARY} />
                <Text className="text-lg font-bold text-gray-dark ml-2">
                  {t('categoryAquaculture')}
                </Text>
              </View>
              {aquacultureActions.map(renderActionItem)}
            </View>

            {/* Commerce Section */}
            <View className="mb-2">
              <View className="flex-row items-center mb-3">
                <Ionicons name="storefront" size={20} color={MAVECAM_COLORS.GREEN_PRIMARY} />
                <Text className="text-lg font-bold text-gray-dark ml-2">
                  {t('categoryCommerce')}
                </Text>
              </View>
              {commerceActions.map(renderActionItem)}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: MAVECAM_COLORS.CREAM,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
    paddingBottom: 20,
  },
  scrollView: {
    maxHeight: '100%',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
});
