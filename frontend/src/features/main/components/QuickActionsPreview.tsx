import React, { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { AppText, Card, Divider } from "@/components/ui";
import { colors, spacing } from "@/theme";

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

  /**
   * Définit si l'aperçu est affiché pour un cycle global ou une unité.
   */
  scope?: "cycle" | "unit";

  /**
   * Contexte unitaire pour les actions scoppées.
   */
  productionUnitContext?: {
    cycleId: string;
    cycleUnitAllocationId: string;
    productionUnitId: string;
    productionUnitName: string;
  };

  /**
   * Masque les actions globales de cycle quand des allocations existent.
   */
  hideGlobalCycleOperationalActions?: boolean;
}

/**
 * Action suggérée dans l'aperçu
 */
interface SuggestedAction {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  label: string;
  route: string;
  params?: Record<string, unknown>;
}

const hasValidProductionUnitContext = (
  productionUnitContext: QuickActionsPreviewProps["productionUnitContext"],
): boolean =>
  Boolean(
    productionUnitContext?.cycleId &&
    productionUnitContext?.cycleUnitAllocationId &&
    productionUnitContext?.productionUnitId,
  );

/**
 * Composant QuickActionsPreview
 *
 * Affiche un aperçu replié avec 3 actions suggérées intelligemment :
 * - Si cycles actifs → prioriser "Saisie du jour"
 * - Si aucun cycle → prioriser "Nouvel élevage"
 * - Si notifications non lues → ajouter "Notifications", sinon "Rapports"
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
  scope = "cycle",
  productionUnitContext,
  hideGlobalCycleOperationalActions = false,
}: QuickActionsPreviewProps) {
  const { t } = useTranslation();

  /**
   * Logique de suggestions intelligentes
   * Retourne les 3 actions les plus pertinentes selon le contexte utilisateur
   */
  const suggestedActions = useMemo((): SuggestedAction[] => {
    const isValidUnitContext = hasValidProductionUnitContext(
      productionUnitContext,
    );

    if (scope === "unit") {
      if (!isValidUnitContext) {
        return [];
      }

      return [
        {
          icon: "create",
          color: colors.brand.light,
          label: t("dailyLogCompact"),
          route: "DailyLog",
          params: productionUnitContext,
        },
        {
          icon: "warning-outline",
          color: colors.status.error,
          label: t("sanitaryLogCompact"),
          route: "SanitaryLog",
          params: productionUnitContext,
        },
        {
          icon: "restaurant-outline",
          color: colors.status.info,
          label: t("feedingPlanCompact"),
          route: "FeedingPlan",
          params: productionUnitContext,
        },
      ];
    }

    const actions: SuggestedAction[] = [];

    // Suggestion 1 : Basée sur l'état des cycles
    if (hasActiveCycles && !hideGlobalCycleOperationalActions) {
      // Si cycles actifs → prioriser saisie quotidienne
      actions.push({
        icon: "create",
        color: colors.brand.light,
        label: t("dailyLogCompact"),
        route: "DailyLog",
      });
    } else if (hasActiveCycles) {
      actions.push({
        icon: "document-text-outline",
        color: colors.legacy.blue,
        label: t("reports"),
        route: "Reports",
        params: { scope: "cycle" },
      });
    } else {
      // Si aucun cycle → prioriser création
      actions.push({
        icon: "add-circle",
        color: colors.brand.primary,
        label: t("startNewCycle"),
        route: "CreateFarm",
      });
    }

    // Suggestion 2 : Toujours suggérer catalogue commerce
    actions.push({
      icon: "storefront-outline",
      color: colors.brand.primary,
      label: t("productCatalog"),
      route: "ProductCatalog",
    });

    // Suggestion 3 : Notifications si non lues, sinon rapports
    if (unreadCount > 0) {
      actions.push({
        icon: "notifications-outline",
        color: colors.status.warning,
        label: `${t("notifications")} (${unreadCount})`,
        route: "Notifications",
      });
    } else if (!hideGlobalCycleOperationalActions || !hasActiveCycles) {
      actions.push({
        icon: "document-text-outline",
        color: colors.legacy.blue,
        label: t("reports"),
        route: "Reports",
        params: { scope: "cycle" },
      });
    } else {
      actions.push({
        icon: "notifications-outline",
        color: colors.status.warning,
        label: t("notifications"),
        route: "Notifications",
      });
    }

    return actions.slice(0, 3); // Toujours max 3 suggestions
  }, [
    hasActiveCycles,
    unreadCount,
    t,
    scope,
    productionUnitContext,
    hideGlobalCycleOperationalActions,
  ]);

  return (
    <View className="px-5 py-5">
      {/* Suggested Actions Preview */}
      <Card variant="elevated" style={styles.card}>
        {suggestedActions.map((action, index) => (
          <React.Fragment key={action.route}>
            <Pressable
              className="flex-row items-center"
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={() => navigation.navigate(action.route, action.params)}
              android_ripple={{ color: colors.surface.selected }}
              style={styles.action}
            >
              <View
                className="w-10 h-10 rounded-full items-center justify-center"
                style={styles.actionIcon}
              >
                <Ionicons
                  name={action.icon as any}
                  size={20}
                  color={action.color}
                />
              </View>
              <AppText
                variant="body"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                style={styles.actionLabel}
              >
                {action.label}
              </AppText>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.text.muted}
              />
            </Pressable>
            {index < suggestedActions.length - 1 ? <Divider /> : null}
          </React.Fragment>
        ))}

        {/* View All Button */}
        <Pressable
          className="flex-row items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('viewAllActions')}
          onPress={onOpenSheet}
          android_ripple={{ color: colors.surface.selected }}
          style={styles.viewAll}
        >
          <AppText
            variant="bodyStrong"
            color="link"
            style={styles.viewAllLabel}
          >
            {t("viewAllActions")}
          </AppText>
          <Ionicons
            name="chevron-down"
            size={20}
            color={colors.brand.primary}
          />
        </Pressable>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 0, overflow: "hidden" as const },
  action: { minHeight: 56, flexDirection: 'row', alignItems: 'center', padding: spacing[4] },
  actionIcon: { backgroundColor: colors.brand.subtle },
  viewAll: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: spacing[4], backgroundColor: colors.surface.page, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border.subtle },
  actionLabel: {
    flex: 1,
    flexShrink: 1,
    marginLeft: spacing[3],
    marginRight: spacing[2],
  },
  viewAllLabel: { marginRight: spacing[2] },
});
