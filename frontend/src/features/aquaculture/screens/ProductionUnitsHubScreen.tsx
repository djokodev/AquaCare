import { Ionicons } from '@expo/vector-icons';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { AQUACARE_COLORS } from '@/constants/colors';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { RootStackParamList } from '@/navigation/MainNavigator';
import type { CycleDashboard, CycleUnitAllocation } from '@/types/aquaculture';

type NavigationProp = StackNavigationProp<RootStackParamList, 'ProductionUnitsHub'>;
type RouteType = RouteProp<RootStackParamList, 'ProductionUnitsHub'>;

interface Props {
  navigation: NavigationProp;
  route: RouteType;
}

const getProductionUnitTypeLabelKey = (unitType?: string | null): string => {
  if (unitType === 'pond') {
    return 'productionUnitTypePond';
  }
  if (unitType === 'cage') {
    return 'productionUnitTypeCage';
  }
  if (unitType === 'tank') {
    return 'productionUnitTypeTank';
  }
  return 'productionUnitsUnknownType';
};

const formatCount = (value: number, locale: string): string =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);

function UnitCard({
  allocation,
  locale,
  onOpen,
  t,
}: {
  allocation: CycleUnitAllocation;
  locale: string;
  onOpen: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const unitTypeLabel = t(getProductionUnitTypeLabelKey(allocation.production_unit_type));
  const dimension = allocation.production_unit_display_dimension?.trim();
  const title = allocation.production_unit_name?.trim() || t('productionUnitsUnknownUnit');
  const typeLine = dimension ? `${unitTypeLabel} · ${dimension}` : unitTypeLabel;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderText}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardSubtitle}>{typeLine}</Text>
        </View>
        <View style={styles.cardIcon}>
          <Ionicons name="layers-outline" size={18} color={AQUACARE_COLORS.GREEN_PRIMARY} />
        </View>
      </View>

      <View style={styles.statRow}>
        <Text style={styles.statLabel}>{t('productionUnitsCurrentFishCount')}</Text>
        <Text style={styles.statValue}>{formatCount(allocation.current_fish_count, locale)}</Text>
      </View>

      <TouchableOpacity style={styles.openButton} onPress={onOpen}>
        <Text style={styles.openButtonText}>{t('productionUnitsOpenUnit')}</Text>
        <Ionicons name="chevron-forward" size={16} color={AQUACARE_COLORS.GREEN_PRIMARY} />
      </TouchableOpacity>
    </View>
  );
}

export default function ProductionUnitsHubScreen({ navigation, route }: Props) {
  const { t, i18n } = useTranslation();
  const { cycleId } = route.params;
  const locale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US';
  const [dashboard, setDashboard] = useState<CycleDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const errorMessage = errorKey ? t(errorKey) : null;
  const allocations = dashboard?.allocations ?? [];
  const totalAllocations = dashboard?.summary?.total_allocations ?? allocations.length;

  const loadDashboard = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'refresh') {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const result = await aquacultureService.getCycleDashboard(cycleId);
        setDashboard(result);
        setErrorKey(null);
      } catch {
        if (mode === 'initial') {
          setDashboard(null);
        }
        setErrorKey('productionUnitsLoadError');
      } finally {
        if (mode === 'refresh') {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [cycleId]
  );

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handleRefresh = useCallback(() => {
    void loadDashboard('refresh');
  }, [loadDashboard]);

  const handleOpenUnit = useCallback(
    (allocation: CycleUnitAllocation) => {
      navigation.navigate('ProductionUnitOverview', {
        cycleId,
        allocationId: allocation.id,
        productionUnitId: allocation.production_unit,
        productionUnitName: allocation.production_unit_name?.trim() || t('productionUnitsUnknownUnit'),
      });
    },
    [cycleId, navigation, t]
  );

  if (loading && !dashboard) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={AQUACARE_COLORS.GREEN_PRIMARY} />
        <Text style={styles.loadingText}>{t('productionUnitsLoading')}</Text>
      </View>
    );
  }

  if (errorMessage && !dashboard) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={AQUACARE_COLORS.ERROR} />
        <Text style={styles.errorText}>{errorMessage}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
          <Text style={styles.retryButtonText}>{t('retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      testID="production-units-hub-scroll"
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          colors={[AQUACARE_COLORS.GREEN_PRIMARY]}
          tintColor={AQUACARE_COLORS.GREEN_PRIMARY}
        />
      }
    >
      <View style={styles.hero}>
        <View style={styles.heroBadge}>
          <Ionicons name="grid-outline" size={16} color={AQUACARE_COLORS.WHITE} />
          <Text style={styles.heroBadgeText}>{t('productionUnitsActiveCycleLabel')}</Text>
        </View>
        <Text style={styles.subtitle}>{t('productionUnitsHubSubtitle')}</Text>
        <Text style={styles.summaryText}>
          {t('productionUnitsCount', { count: totalAllocations })}
        </Text>
      </View>

      {errorMessage ? (
        <View style={styles.inlineError}>
          <Ionicons name="warning-outline" size={18} color={AQUACARE_COLORS.ERROR} />
          <Text style={styles.inlineErrorText}>{errorMessage}</Text>
        </View>
      ) : null}

      <View style={styles.cards}>
        {allocations.length > 0 ? (
          allocations.map((allocation) => (
            <UnitCard
              key={allocation.allocation.id}
              allocation={allocation.allocation}
              locale={locale}
              t={t}
              onOpen={() => handleOpenUnit(allocation.allocation)}
            />
          ))
        ) : (
          <View style={styles.emptyStateCard}>
            <Ionicons name="layers-outline" size={48} color={AQUACARE_COLORS.GREEN_PRIMARY} />
            <Text style={styles.emptyTitle}>{t('productionUnitsEmptyTitle')}</Text>
            <Text style={styles.emptyDescription}>{t('productionUnitsEmptyDescription')}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AQUACARE_COLORS.CREAM,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: AQUACARE_COLORS.CREAM,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: AQUACARE_COLORS.GRAY_DARK,
    textAlign: 'center',
  },
  errorText: {
    marginTop: 14,
    fontSize: 16,
    fontWeight: '700',
    color: AQUACARE_COLORS.ERROR,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: AQUACARE_COLORS.GREEN_PRIMARY,
  },
  retryButtonText: {
    color: AQUACARE_COLORS.WHITE,
    fontWeight: '700',
  },
  hero: {
    marginBottom: 16,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: AQUACARE_COLORS.GREEN_PRIMARY,
    marginBottom: 12,
  },
  heroBadgeText: {
    color: AQUACARE_COLORS.WHITE,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 15,
    color: AQUACARE_COLORS.GRAY_DARK,
    lineHeight: 22,
  },
  summaryText: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '700',
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#FFF1F1',
    marginBottom: 16,
  },
  inlineErrorText: {
    flex: 1,
    fontSize: 13,
    color: AQUACARE_COLORS.ERROR,
    lineHeight: 18,
  },
  cards: {
    gap: 12,
  },
  emptyStateCard: {
    backgroundColor: AQUACARE_COLORS.WHITE,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  emptyTitle: {
    marginTop: 14,
    fontSize: 18,
    fontWeight: '700',
    color: AQUACARE_COLORS.GRAY_DARK,
    textAlign: 'center',
  },
  emptyDescription: {
    marginTop: 8,
    fontSize: 14,
    color: AQUACARE_COLORS.GRAY_LIGHT,
    textAlign: 'center',
    lineHeight: 20,
  },
  card: {
    backgroundColor: AQUACARE_COLORS.WHITE,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardHeaderText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  cardSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: AQUACARE_COLORS.GRAY_LIGHT,
    lineHeight: 18,
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${AQUACARE_COLORS.GREEN_PRIMARY}15`,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  statLabel: {
    fontSize: 14,
    color: AQUACARE_COLORS.GRAY_DARK,
    fontWeight: '600',
  },
  statValue: {
    fontSize: 16,
    color: AQUACARE_COLORS.GREEN_DARK,
    fontWeight: '800',
  },
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: AQUACARE_COLORS.WHITE,
    borderWidth: 1.5,
    borderColor: AQUACARE_COLORS.GREEN_PRIMARY,
    paddingVertical: 12,
  },
  openButtonText: {
    color: AQUACARE_COLORS.GREEN_PRIMARY,
    fontSize: 14,
    fontWeight: '700',
  },
});
