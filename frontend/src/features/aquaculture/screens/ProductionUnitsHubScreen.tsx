import { Ionicons } from '@expo/vector-icons';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppHeader,
  AppText,
  Card,
  EmptyState,
  ErrorState,
  InlineAlert,
  InteractiveCard,
  LoadingState,
  Screen,
} from '@/components/ui';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { colors, radii, spacing } from '@/theme';
import type { CycleDashboard, CycleUnitAllocation } from '@/types/aquaculture';

type NavigationProp = StackNavigationProp<RootStackParamList, 'ProductionUnitsHub'>;
type RouteType = RouteProp<RootStackParamList, 'ProductionUnitsHub'>;

interface Props {
  navigation: NavigationProp;
  route: RouteType;
}

interface UnitCardProps {
  allocation: CycleUnitAllocation;
  locale: string;
  onOpen: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

const formatCount = (value: number, locale: string): string =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);

function UnitCard({ allocation, locale, onOpen, t }: UnitCardProps) {
  const dimension = allocation.production_unit_display_dimension?.trim();
  const title = allocation.production_unit_name?.trim() || t('productionUnitsUnknownUnit');

  return (
    <Card variant="outlined" style={styles.card}>
      <View style={styles.cardHeader}>
        <AppText variant="cardTitle" numberOfLines={2} style={styles.cardTitle}>
          {title}
        </AppText>
        {dimension ? (
          <AppText variant="caption" color="muted" numberOfLines={1} style={styles.dimension}>
            {dimension}
          </AppText>
        ) : null}
      </View>

      <View style={styles.statRow}>
        <AppText variant="bodyStrong" style={styles.statLabel}>
          {t('productionUnitsCurrentFishCount')}
        </AppText>
        <AppText variant="cardTitle" color="link" numberOfLines={1}>
          {formatCount(allocation.current_fish_count, locale)}
        </AppText>
      </View>

      <InteractiveCard
        testID={`production-unit-open-${allocation.id}`}
        accessibilityLabel={t('productionUnitsOpenUnit')}
        primaryBorder
        onPress={onOpen}
        style={styles.openButton}
      >
        <View style={styles.openButtonLabel}>
          <AppText variant="bodyStrong" color="link">
            {t('productionUnitsOpenUnit')}
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.brand.primary} />
      </InteractiveCard>
    </Card>
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
    [cycleId],
  );

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handleOpenUnit = useCallback(
    (allocation: CycleUnitAllocation) => {
      navigation.navigate('ProductionUnitOverview', {
        cycleId: allocation.cycle,
        allocationId: allocation.id,
        productionUnitId: allocation.production_unit,
        productionUnitName: allocation.production_unit_name?.trim() || t('productionUnitsUnknownUnit'),
      });
    },
    [navigation, t],
  );

  if (loading && !dashboard) {
    return (
      <View style={styles.root}>
        <AppHeader
          title={t('productionUnitsHubTitle')}
          onBack={() => navigation.goBack()}
          backLabel={t('back')}
        />
        <Screen style={styles.centered}>
          <LoadingState message={t('productionUnitsLoading')} />
        </Screen>
      </View>
    );
  }

  if (errorMessage && !dashboard) {
    return (
      <View style={styles.root}>
        <AppHeader
          title={t('productionUnitsHubTitle')}
          onBack={() => navigation.goBack()}
          backLabel={t('back')}
        />
        <Screen style={styles.centered}>
          <ErrorState
            message={errorMessage}
            actionLabel={t('retry')}
            onAction={() => void loadDashboard('refresh')}
          />
        </Screen>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AppHeader
        title={t('productionUnitsHubTitle')}
        onBack={() => navigation.goBack()}
        backLabel={t('back')}
      />
      <Screen
        scroll
        testID="production-units-hub-scroll"
        style={styles.content}
        scrollProps={{
          refreshControl: (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadDashboard('refresh')}
              colors={[colors.brand.primary]}
              tintColor={colors.brand.primary}
            />
          ),
        }}
      >
        <AppText variant="label">{t('productionUnitsCount', { count: totalAllocations })}</AppText>

        {errorMessage ? <InlineAlert tone="error" message={errorMessage} /> : null}

        <View style={styles.cards}>
          {allocations.length > 0 ? (
            allocations.map((entry) => (
              <UnitCard
                key={entry.allocation.id}
                allocation={entry.allocation}
                locale={locale}
                t={t}
                onOpen={() => handleOpenUnit(entry.allocation)}
              />
            ))
          ) : (
            <EmptyState
              title={t('productionUnitsEmptyTitle')}
              message={t('productionUnitsEmptyDescription')}
            />
          )}
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.page },
  centered: { justifyContent: 'center' },
  content: { padding: spacing[5], gap: spacing[4] },
  cards: { gap: spacing[3] },
  card: { gap: spacing[3] },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  cardTitle: { flex: 1 },
  dimension: { flexShrink: 1, textAlign: 'right', maxWidth: '42%' },
  statRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statLabel: { flexShrink: 1, marginRight: spacing[3] },
  openButton: { borderRadius: radii.lg, paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  openButtonLabel: { flex: 1, alignItems: 'center' },
});
