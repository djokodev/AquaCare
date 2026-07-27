import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';

import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { addToCart } from '@/features/commerce/store/commerceSlice';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { AppDispatch, RootState } from '@/store/store';
import { FeedPhase, FeedPhaseProduct } from '@/types/aquaculture';
import { Product, ProductBrand } from '@/types/commerce';
import {
  AppHeader,
  AppText,
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
  InlineAlert,
  LoadingState,
} from '@/components/ui';
import { colors, spacing } from '@/theme';
import { getProductDisplayName } from '@/features/commerce/utils/productPresentation';
import { formatDecimalForDisplay } from '@/utils/localizedNumber';

type Props = StackScreenProps<RootStackParamList, 'CycleFeedPhases'>;

function buildProductForCart(product: FeedPhaseProduct): Product {
  const packageWeight = Number(product.package_weight_kg);
  const unitPrice = Number(product.unit_price);
  return {
    id: product.product_id,
    brand: product.brand as ProductBrand,
    name: product.product_name,
    species: product.species,
    phase: null,
    pellet_size_mm: String(product.pellet_size_mm),
    protein_percentage: null,
    lipid_percentage: null,
    package_weight_kg: Number.isFinite(packageWeight) ? packageWeight : 0,
    price_per_package: product.unit_price,
    price_per_kg: String(packageWeight > 0 && Number.isFinite(unitPrice) ? unitPrice / packageWeight : 0),
    is_available: true,
    created_at: '',
    updated_at: '',
  };
}

type DisplayFeedPhase = FeedPhase & {
  uncovered_shortfall_kg: string;
  grouped_phase_count: number;
};

function phaseLabel(
  phase: FeedPhase,
  translate: (key: string) => string,
): string {
  return translate(phase.phase_name);
}

function phaseWeightLabel(
  phase: FeedPhase,
  translate: (key: string) => string,
  formatNumber: (value: string | number | null | undefined) => string,
): string {
  const weightRange = phase.planned_weight_range_g;
  return translate('feedPhaseWeightRange')
    .replace('{{min}}', formatNumber(weightRange[0]))
    .replace('{{max}}', formatNumber(weightRange[1]));
}

function sumValues(...values: Array<string | number | null | undefined>): string {
  return values.reduce<number>((total, value) => total + Number(value ?? 0), 0).toFixed(2);
}

function aggregateFeedPhases(phases: FeedPhase[]): DisplayFeedPhase[] {
  const grouped = new Map<string, DisplayFeedPhase>();

  phases.forEach((phase) => {
    const key = `${phase.phase_name}:${phase.pellet_size_mm}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        ...phase,
        phase_id: `display-${key}`,
        products: phase.products.map((product) => ({ ...product })),
        uncovered_shortfall_kg: phase.products.length ? '0.00' : (phase.shortfall_kg ?? '0.00'),
        grouped_phase_count: 1,
      });
      return;
    }

    const products = new Map(existing.products.map((product) => [product.product_id, { ...product }]));
    phase.products.forEach((product) => {
      const current = products.get(product.product_id);
      if (!current) {
        products.set(product.product_id, { ...product });
        return;
      }
      current.quantity_bags += product.quantity_bags;
      current.total_kg = sumValues(current.total_kg, product.total_kg);
      current.total_price = sumValues(current.total_price, product.total_price);
    });

    existing.days_range = [
      Math.min(existing.days_range[0], phase.days_range[0]),
      Math.max(existing.days_range[1], phase.days_range[1]),
    ];
    existing.planned_days_range = [
      Math.min(existing.planned_days_range[0], phase.planned_days_range[0]),
      Math.max(existing.planned_days_range[1], phase.planned_days_range[1]),
    ];
    existing.weight_range_g = [
      String(Math.min(Number(existing.weight_range_g[0]), Number(phase.weight_range_g[0]))),
      String(Math.max(Number(existing.weight_range_g[1]), Number(phase.weight_range_g[1]))),
    ];
    existing.planned_weight_range_g = [...existing.weight_range_g];
    existing.duration_days += phase.duration_days;
    existing.planned_duration_days += phase.planned_duration_days;
    existing.planned_consumption_kg = sumValues(existing.planned_consumption_kg, phase.planned_consumption_kg);
    existing.actual_consumed_kg = sumValues(existing.actual_consumed_kg, phase.actual_consumed_kg);
    existing.estimated_remaining_need_kg = sumValues(existing.estimated_remaining_need_kg, phase.estimated_remaining_need_kg);
    existing.remaining_need_kg = sumValues(existing.remaining_need_kg, phase.remaining_need_kg);
    existing.consumed_kg = sumValues(existing.consumed_kg, phase.consumed_kg);
    existing.allocated_stock_kg = sumValues(existing.allocated_stock_kg, phase.allocated_stock_kg);
    existing.allocated_pending_kg = sumValues(existing.allocated_pending_kg, phase.allocated_pending_kg);
    existing.shortfall_kg = sumValues(existing.shortfall_kg, phase.shortfall_kg);
    existing.surplus_kg = sumValues(existing.surplus_kg, phase.surplus_kg);
    existing.total_bags = Number(existing.total_bags ?? 0) + Number(phase.total_bags ?? 0);
    existing.total_price = sumValues(existing.total_price, phase.total_price);
    existing.product_available = existing.product_available || phase.product_available;
    existing.products = Array.from(products.values());
    existing.uncovered_shortfall_kg = sumValues(
      existing.uncovered_shortfall_kg,
      phase.products.length ? '0.00' : phase.shortfall_kg,
    );
    existing.grouped_phase_count += 1;
  });

  return Array.from(grouped.values());
}

type PhasePresentationStatus = 'completed' | 'covered' | 'to_order' | 'unavailable';

function getPhasePresentationStatus(phase: FeedPhase): PhasePresentationStatus {
  const shortfall = Number(phase.shortfall_kg ?? 0);
  const bags = Number(phase.total_bags ?? 0);
  const remainingNeed = Number(phase.remaining_need_kg ?? phase.estimated_remaining_need_kg ?? 0);

  if (shortfall <= 0 && remainingNeed <= 0) return 'completed';
  if (shortfall <= 0) return 'covered';
  if (phase.product_available && phase.products.length > 0 && bags > 0) return 'to_order';
  return 'unavailable';
}

const quantityKey = (phase: FeedPhase, product: FeedPhaseProduct): string =>
  `${phase.phase_id}-${product.product_id}`;

export default function CycleFeedPhasesScreen({ navigation, route }: Props) {
  const { t, i18n } = useTranslation();
  const numberLocale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US';
  const displayDecimal = (value: string | number | null | undefined, maximumFractionDigits = 2): string =>
    formatDecimalForDisplay(value, numberLocale, maximumFractionDigits);
  const dispatch = useDispatch<AppDispatch>();
  const { cycleId } = route.params;
  const cartItemsCount = useSelector((state: RootState) =>
    state.commerce.cart.items.reduce((sum, item) => sum + item.quantity, 0)
  );
  const [phases, setPhases] = useState<DisplayFeedPhase[]>([]);
  const [recommendation, setRecommendation] = useState<Awaited<ReturnType<typeof aquacultureService.getCycleFeedPhases>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [submittedScopes, setSubmittedScopes] = useState<Record<string, boolean>>({});

  const loadPhases = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await aquacultureService.getCycleFeedPhases(cycleId);
      const displayPhases = aggregateFeedPhases(result.feeding_phases);
      setRecommendation(result);
      setPhases(displayPhases);
      const initialQuantities: Record<string, number> = {};
      displayPhases.forEach((phase) =>
        phase.products.forEach((product) => {
          initialQuantities[quantityKey(phase, product)] = product.quantity_bags;
        })
      );
      setQuantities(initialQuantities);
      setSubmittedScopes({});
    } catch {
      setError('feedPhasesLoadError');
    } finally {
      setLoading(false);
    }
  }, [cycleId]);

  useEffect(() => {
    void loadPhases();
  }, [loadPhases]);

  const handleQuantityChange = useCallback((key: string, delta: number) => {
    setQuantities((current) => ({
      ...current,
      [key]: Math.max(0, (current[key] ?? 0) + delta),
    }));
  }, []);

  const addPhaseToCart = useCallback(
    (phase: FeedPhase) => {
      if (submittedScopes[phase.phase_id] || recommendation?.status === 'unavailable') return;
      phase.products.forEach((product) => {
        const quantity = quantities[quantityKey(phase, product)] ?? product.quantity_bags;
        if (quantity > 0) dispatch(
          addToCart({
            product: buildProductForCart(product),
            quantity,
            recommendation: {
              phase_name: phaseLabel(phase, t),
              pellet_size_mm: String(phase.pellet_size_mm),
              suggested_bags: quantity,
            },
          })
        );
      });
      setSubmittedScopes((current) => ({ ...current, [phase.phase_id]: true }));
      Alert.alert(t('success'), t('feedPhaseAddedToCart'), [{ text: t('ok') }]);
    },
    [dispatch, displayDecimal, phases, quantities, recommendation?.status, submittedScopes, t]
  );

  const handleOrderAll = useCallback(() => {
    if (submittedScopes.all || recommendation?.status === 'unavailable') return;
    phases.forEach((phase) =>
      phase.products.forEach((product) => {
        const quantity = quantities[quantityKey(phase, product)] ?? product.quantity_bags;
        if (quantity > 0) dispatch(
          addToCart({
            product: buildProductForCart(product),
            quantity,
            recommendation: {
              phase_name: phaseLabel(phase, t),
              pellet_size_mm: String(phase.pellet_size_mm),
              suggested_bags: quantity,
            },
          })
        );
      })
    );
    setSubmittedScopes((current) => ({ ...current, all: true }));
    navigation.navigate('Cart', { cycleId });
  }, [cycleId, dispatch, displayDecimal, navigation, phases, quantities, recommendation?.status, submittedScopes.all]);

  const totalBags = useMemo(
    () => phases.reduce(
      (sum, phase) => sum + phase.products.reduce(
        (phaseSum, product) => phaseSum + (quantities[quantityKey(phase, product)] ?? product.quantity_bags),
        0
      ),
      0
    ),
    [phases, quantities]
  );
  const uncoveredPhases = phases.filter((phase) => Number(phase.uncovered_shortfall_kg) > 0);
  const uncoveredKg = uncoveredPhases.reduce((sum, phase) => sum + Number(phase.uncovered_shortfall_kg), 0);

  return (
    <View style={styles.screen}>
      <AppHeader
        title={t('feedPhasesTitle')}
        onBack={() => navigation.goBack()}
        backLabel={t('back')}
        rightAction={
          <IconButton
            icon="cart-outline"
            variant="ghost"
            tone="inverse"
            accessibilityLabel={`${t('cart')} ${cartItemsCount}`}
            badge={cartItemsCount}
            onPress={() => navigation.navigate('Cart', { cycleId })}
          />
        }
      />

      {loading ? (
        <LoadingState message={t('loading')} />
      ) : error ? (
        <ErrorState title={t(error)} actionLabel={t('retry')} onAction={loadPhases} />
      ) : phases.length === 0 ? (
        <EmptyState title={t(recommendation?.status === 'unavailable' ? 'feedEstimateUnavailable' : 'feedPhasesEmpty')} />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {recommendation?.status === 'unavailable' ? (
              <InlineAlert compact message={t('feedEstimateUnavailable')} tone="warning" />
            ) : (
              <Card variant="outlined" style={styles.summaryCard}>
                <AppText variant="sectionTitle">{t('feedNeedSummaryTitle')}</AppText>
                <View style={styles.summaryRow}><AppText color="muted">{t('feedNeedRemainingLabel')}</AppText><AppText variant="bodyStrong">{formatDecimalForDisplay(recommendation?.summary.estimated_remaining_need_kg, numberLocale)} kg</AppText></View>
                <View style={styles.summaryRow}><AppText color="muted">{t('feedCompatibleStockLabel')}</AppText><AppText variant="bodyStrong">{formatDecimalForDisplay(recommendation?.summary.compatible_stock_kg, numberLocale)} kg</AppText></View>
                <View style={styles.summaryRow}><AppText color="muted">{t('feedToSecureLabel')}</AppText><AppText variant="bodyStrong" color="link">{formatDecimalForDisplay(recommendation?.summary.feed_to_order_kg, numberLocale)} kg</AppText></View>
                <View style={styles.summaryRow}><AppText color="muted">{t('feedPendingOrdersLabel')}</AppText><AppText variant="bodyStrong">{formatDecimalForDisplay(recommendation?.summary.pending_order_kg, numberLocale)} kg</AppText></View>
              </Card>
            )}
            {recommendation ? (
              <>
                {recommendation.summary.unclassified_consumption_kg && Number(recommendation.summary.unclassified_consumption_kg) > 0 ? (
                  <InlineAlert
                    compact
                    tone="info"
                    message={t('feedHistoricalConsumptionMessage', { quantity: recommendation.summary.unclassified_consumption_kg })}
                  />
                ) : null}
                {recommendation.warnings.includes('unclassified_consumption') && !recommendation.summary.unclassified_consumption_kg ? (
                  <InlineAlert compact tone="info" message={t('feedWarning_unclassified_consumption')} />
                ) : null}
                {recommendation.warnings.filter((warning) => warning !== 'exact_product_unavailable' && warning !== 'unclassified_consumption').map((warning) => (
                  <InlineAlert key={warning} compact tone="warning" message={t(`feedWarning_${warning}`)} />
                ))}
              </>
            ) : null}
            {phases.map((phase, phaseIndex) => {
              const presentationStatus = getPhasePresentationStatus(phase);
              const hasUncoveredShortfall = Number(phase.uncovered_shortfall_kg) > 0;
              return (
              <Card key={`${phase.phase_name}-${phaseIndex}`} variant="outlined" style={styles.phaseCard}>
                <View style={styles.phaseHeader}>
                  <AppText variant="sectionTitle" style={styles.phaseTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                    {phaseLabel(phase, t)}
                  </AppText>
                  {presentationStatus === 'to_order' ? (
                    <Badge label={`${phase.total_bags} ${t('bags')}`} tone="success" />
                  ) : presentationStatus === 'completed' ? (
                    <Badge label={t('feedPhaseCompletedShort')} tone="neutral" />
                  ) : presentationStatus === 'covered' ? (
                    <Badge label={t('feedPhaseCoveredShort')} tone="success" />
                  ) : (
                    <Badge label={t('feedPhaseUnavailableShort')} tone="warning" />
                  )}
                </View>
                <View style={styles.phaseContextRow}>
                  <AppText color="muted" style={styles.phaseContextText} numberOfLines={1}>{phaseWeightLabel(phase, t, displayDecimal)}</AppText>
                  <AppText color="muted" style={styles.phaseContextText} numberOfLines={1}>{phase.duration_days} {t('days')}</AppText>
                </View>
                <AppText color="muted" style={styles.phaseMeta} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                  {t('feedPhasePellet', { size: displayDecimal(phase.pellet_size_mm) })}
                </AppText>

                <AppText variant="bodyStrong" color={presentationStatus === 'unavailable' ? 'warning' : 'success'}>
                  {presentationStatus === 'to_order'
                    ? t('feedPhaseToOrder', { count: phase.total_bags ?? 0 })
                    : presentationStatus === 'completed'
                      ? t('feedPhaseCompleted')
                    : presentationStatus === 'covered'
                      ? t('feedPhaseCovered')
                      : t('feedPhaseUnavailable')}
                </AppText>

                {hasUncoveredShortfall ? (
                  <InlineAlert compact tone="warning" message={t('feedPhaseNoExactProduct', { size: displayDecimal(phase.pellet_size_mm) })} />
                ) : null}

                {phase.products.map((product) => {
                  const key = quantityKey(phase, product);
                  const quantity = quantities[key] ?? product.quantity_bags;
                  return (
                    <View key={product.product_id}>
                      <Divider />
                      <View style={styles.productRow}>
                        <View style={styles.flex}>
                          <AppText variant="bodyStrong" numberOfLines={1}>{getProductDisplayName(product.product_name, t('catfish'))}</AppText>
                          <AppText variant="caption" color="muted" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                            {displayDecimal(product.package_weight_kg)} kg · {displayDecimal(product.unit_price, 0)} FCFA/{t('bag')}
                          </AppText>
                        </View>
                        <View style={styles.quantityRow}>
                          <IconButton
                            icon="remove"
                            accessibilityLabel={t('decreaseQuantity')}
                            variant="surface"
                            disabled={quantity <= 0}
                            onPress={() => handleQuantityChange(key, -1)}
                          />
                          <AppText variant="bodyStrong" style={styles.quantity}>{quantity}</AppText>
                          <IconButton
                            icon="add"
                            accessibilityLabel={t('increaseQuantity')}
                            variant="surface"
                            onPress={() => handleQuantityChange(key, 1)}
                          />
                        </View>
                      </View>
                    </View>
                  );
                })}
                {phase.products.length ? (
                  <Button
                    label={t('feedPhaseOrderBtn')}
                    iconLeft="cart-outline"
                    onPress={() => addPhaseToCart(phase)}
                    disabled={Boolean(submittedScopes[phase.phase_id]) || recommendation?.status === 'unavailable'}
                    style={styles.phaseButton}
                  />
                ) : null}
              </Card>
              );
            })}
          </ScrollView>
          {totalBags > 0 || uncoveredPhases.length > 0 ? (
            <View style={styles.footer}>
              {uncoveredPhases.length > 0 ? (
                <AppText variant="caption" color="warning" style={styles.uncoveredMessage}>
                  {t('feedAvailableProductsOnly', {
                    phases: uncoveredPhases.length,
                    quantity: formatDecimalForDisplay(uncoveredKg, numberLocale),
                  })}
                </AppText>
              ) : null}
              {totalBags > 0 ? (
                <>
                  <View style={styles.footerSummary}>
                    <AppText variant="caption" color="muted">{t('feedTotalToOrderLabel')}</AppText>
                    <AppText variant="bodyStrong">{totalBags} {t('bags')}</AppText>
                  </View>
                  <Button
                    label={t('feedPhaseOrderAllBtn')}
                    iconLeft="cart"
                    onPress={handleOrderAll}
                    disabled={Boolean(submittedScopes.all) || recommendation?.status === 'unavailable'}
                  />
                </>
              ) : null}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  content: { padding: spacing[4], paddingBottom: spacing[16], gap: spacing[3] },
  phaseCard: {},
  summaryCard: { gap: spacing[3] },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing[3] },
  uncoveredMessage: { marginBottom: spacing[2] },
  footerSummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[2] },
  phaseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[2] },
  phaseTitle: { flex: 1, flexShrink: 1 },
  phaseContextRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginTop: spacing[1] },
  phaseContextText: { flexShrink: 1 },
  phaseMeta: { marginTop: spacing[1], marginBottom: spacing[3] },
  flex: { flex: 1 },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3] },
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  quantity: { minWidth: 28, textAlign: 'center' },
  phaseButton: { marginTop: spacing[3] },
  footer: { padding: spacing[4], backgroundColor: colors.surface.card, borderTopWidth: 1, borderTopColor: colors.border.subtle },
});
