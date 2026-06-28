import { Ionicons } from '@expo/vector-icons';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import type { CycleUnitAllocation } from '@/types/aquaculture';

type NavigationProp = StackNavigationProp<RootStackParamList, 'ProductionUnitOverview'>;
type RouteType = RouteProp<RootStackParamList, 'ProductionUnitOverview'>;

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

const formatKg = (value: number, locale: string): string =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);

const formatPercentage = (value: number, locale: string): string =>
  `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} %`;

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export default function ProductionUnitOverviewScreen({ route }: Props) {
  const { t, i18n } = useTranslation();
  const { cycleId, allocationId, productionUnitId } = route.params;
  const locale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US';
  const [allocations, setAllocations] = useState<CycleUnitAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const errorMessage = errorKey ? t(errorKey) : null;

  const selectedAllocation = useMemo(
    () =>
      allocations.find(
        (allocation) =>
          allocation.id === allocationId && allocation.production_unit === productionUnitId
      ) ??
      allocations.find((allocation) => allocation.id === allocationId) ??
      allocations.find((allocation) => allocation.production_unit === productionUnitId) ??
      null,
    [allocationId, allocations, productionUnitId]
  );

  const loadAllocations = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'refresh') {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const result = await aquacultureService.getCycleUnitAllocations(cycleId);
        setAllocations(result);
        setErrorKey(null);
      } catch {
        setAllocations([]);
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
    void loadAllocations();
  }, [loadAllocations]);

  if (loading && allocations.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={AQUACARE_COLORS.GREEN_PRIMARY} />
        <Text style={styles.loadingText}>{t('productionUnitsLoading')}</Text>
      </View>
    );
  }

  if (errorMessage && allocations.length === 0) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={AQUACARE_COLORS.ERROR} />
        <Text style={styles.errorText}>{errorMessage}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            void loadAllocations('refresh');
          }}
        >
          <Text style={styles.retryButtonText}>{t('retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!selectedAllocation) {
    return (
      <View style={styles.centered}>
        <Ionicons name="ellipse-outline" size={48} color={AQUACARE_COLORS.GREEN_PRIMARY} />
        <Text style={styles.emptyTitle}>{t('productionUnitOverviewNotFoundTitle')}</Text>
        <Text style={styles.emptyDescription}>{t('productionUnitOverviewNotFoundDescription')}</Text>
      </View>
    );
  }

  const unitTypeLabel = t(getProductionUnitTypeLabelKey(selectedAllocation.production_unit_type));
  const dimension = selectedAllocation.production_unit_display_dimension?.trim();
  const survivalRate =
    selectedAllocation.survival_rate_pct ?? selectedAllocation.expected_survival_rate_pct;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            void loadAllocations('refresh');
          }}
          colors={[AQUACARE_COLORS.GREEN_PRIMARY]}
          tintColor={AQUACARE_COLORS.GREEN_PRIMARY}
        />
      }
    >
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="cube-outline" size={24} color={AQUACARE_COLORS.GREEN_PRIMARY} />
        </View>
        <Text style={styles.title}>{selectedAllocation.production_unit_name || t('productionUnitsUnknownUnit')}</Text>
        <Text style={styles.subtitle}>{t('productionUnitOverviewTitle')}</Text>
        <Text style={styles.metaLine}>
          {dimension ? `${unitTypeLabel} · ${dimension}` : unitTypeLabel}
        </Text>
      </View>

      <View style={styles.card}>
        <DetailRow
          label={t('productionUnitsCurrentFishCount')}
          value={formatCount(selectedAllocation.current_fish_count, locale)}
        />
        <DetailRow
          label={t('productionUnitsInitialFishCount')}
          value={formatCount(selectedAllocation.initial_fish_count, locale)}
        />
        {selectedAllocation.current_biomass_kg !== null &&
        selectedAllocation.current_biomass_kg !== undefined ? (
          <DetailRow
            label={t('productionUnitOverviewCurrentBiomass')}
            value={`${formatKg(selectedAllocation.current_biomass_kg, locale)} kg`}
          />
        ) : null}
        {selectedAllocation.production_unit_recommended_capacity !== null &&
        selectedAllocation.production_unit_recommended_capacity !== undefined ? (
          <DetailRow
            label={t('productionUnitsRecommendedCapacity')}
            value={formatCount(selectedAllocation.production_unit_recommended_capacity, locale)}
          />
        ) : null}
        {survivalRate !== null && survivalRate !== undefined ? (
          <DetailRow
            label={t('productionUnitsExpectedSurvivalRate')}
            value={formatPercentage(survivalRate, locale)}
          />
        ) : null}
      </View>

      <View style={styles.notice}>
        <Ionicons name="information-circle-outline" size={18} color={AQUACARE_COLORS.GREEN_PRIMARY} />
        <Text style={styles.noticeText}>{t('productionUnitOverviewComingSoon')}</Text>
      </View>

      {errorMessage ? <Text style={styles.inlineError}>{errorMessage}</Text> : null}
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
  emptyTitle: {
    marginTop: 14,
    fontSize: 18,
    fontWeight: '800',
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
  hero: {
    marginBottom: 18,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AQUACARE_COLORS.GREEN_LIGHT,
    marginBottom: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: AQUACARE_COLORS.GREEN_DARK,
    lineHeight: 34,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 15,
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  metaLine: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '700',
    color: AQUACARE_COLORS.GREEN_PRIMARY,
  },
  card: {
    backgroundColor: AQUACARE_COLORS.WHITE,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  detailLabel: {
    flex: 1,
    fontSize: 13,
    color: AQUACARE_COLORS.GRAY_LIGHT,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '700',
    color: AQUACARE_COLORS.GREEN_DARK,
    textAlign: 'right',
  },
  notice: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#F2F8F2',
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: AQUACARE_COLORS.GREEN_DARK,
  },
  inlineError: {
    marginTop: 12,
    fontSize: 13,
    color: AQUACARE_COLORS.ERROR,
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
});
