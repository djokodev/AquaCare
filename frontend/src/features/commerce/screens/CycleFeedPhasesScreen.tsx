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

function phaseLabel(phase: FeedPhase, phases: FeedPhase[], translate: (key: string) => string): string {
  const base = translate(phase.phase_name);
  return phases.filter((item) => item.phase_name === phase.phase_name).length > 1
    ? `${base} · ${phase.pellet_size_mm}mm`
    : base;
}

const quantityKey = (phase: FeedPhase, product: FeedPhaseProduct): string =>
  `${phase.phase_id}-${product.product_id}`;

const calculationSourceKey = (source: string): string => {
  if (source.startsWith('current_cycle_reforecast:')) return 'feedCalculationSource_current_cycle_reforecast';
  if (source === 'cycle_progress') return 'feedCalculationSource_cycle_progress';
  if (source === 'legacy_backfill') return 'feedCalculationSource_legacy_backfill';
  return 'feedCalculationSource_cycle_launch';
};

export default function CycleFeedPhasesScreen({ navigation, route }: Props) {
  const { t, i18n } = useTranslation();
  const numberLocale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US';
  const dispatch = useDispatch<AppDispatch>();
  const { cycleId } = route.params;
  const cartItemsCount = useSelector((state: RootState) =>
    state.commerce.cart.items.reduce((sum, item) => sum + item.quantity, 0)
  );
  const [phases, setPhases] = useState<FeedPhase[]>([]);
  const [recommendation, setRecommendation] = useState<Awaited<ReturnType<typeof aquacultureService.getCycleFeedPhases>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [submittedScopes, setSubmittedScopes] = useState<Record<string, boolean>>({});
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  const loadPhases = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await aquacultureService.getCycleFeedPhases(cycleId);
      setRecommendation(result);
      setPhases(result.feeding_phases);
      const initialQuantities: Record<string, number> = {};
      result.feeding_phases.forEach((phase) =>
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
              phase_name: phaseLabel(phase, phases, t),
              pellet_size_mm: String(phase.pellet_size_mm),
              suggested_bags: quantity,
            },
          })
        );
      });
      setSubmittedScopes((current) => ({ ...current, [phase.phase_id]: true }));
      Alert.alert(t('success'), t('feedPhaseAddedToCart'), [{ text: t('ok') }]);
    },
    [dispatch, phases, quantities, recommendation?.status, submittedScopes, t]
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
              phase_name: phaseLabel(phase, phases, t),
              pellet_size_mm: String(phase.pellet_size_mm),
              suggested_bags: quantity,
            },
          })
        );
      })
    );
    setSubmittedScopes((current) => ({ ...current, all: true }));
    navigation.navigate('Cart', { cycleId });
  }, [cycleId, dispatch, navigation, phases, quantities, recommendation?.status, submittedScopes.all]);

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
  const uncoveredPhases = phases.filter((phase) => !phase.product_available && Number(phase.shortfall_kg ?? 0) > 0);
  const uncoveredKg = uncoveredPhases.reduce((sum, phase) => sum + Number(phase.shortfall_kg ?? 0), 0);

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
                <Button
                  label={t('feedCalculationDetails')}
                  variant="ghost"
                  onPress={() => setShowTechnicalDetails((value) => !value)}
                />
                {showTechnicalDetails ? (
                  <Card variant="outlined" style={styles.detailsCard}>
                    <AppText variant="body" color="muted">{t('feedCalculationCurrentData')}</AppText>
                    <AppText variant="caption" color="muted">
                      {t('feedRecommendationCalculatedAt', { date: new Date(recommendation.calculated_at).toLocaleString() })}
                    </AppText>
                    <AppText variant="caption" color="muted">
                      {t('feedRecommendationSource', { source: t(calculationSourceKey(recommendation.source)) })}
                    </AppText>
                  </Card>
                ) : null}
              </>
            ) : null}
            {phases.map((phase, phaseIndex) => (
              <Card key={`${phase.phase_name}-${phaseIndex}`} variant="outlined" style={styles.phaseCard}>
                <View style={styles.rowBetween}>
                  <AppText variant="sectionTitle" style={styles.flex}>
                    {phaseLabel(phase, phases, t)}
                  </AppText>
                  {phase.total_bags !== null ? <Badge label={`${phase.total_bags} ${t('bags')}`} tone="success" /> : null}
                </View>
                <AppText color="muted" style={styles.phaseMeta}>
                  {phase.duration_days} {t('days')} · {t('feedPhasePellet', { size: phase.pellet_size_mm })}
                </AppText>
                <AppText variant="body" color="muted">
                  {t('feedPhaseCoverage', {
                    need: phase.remaining_need_kg,
                    consumed: phase.actual_consumed_kg,
                    stock: phase.allocated_stock_kg,
                    pending: phase.allocated_pending_kg,
                    shortfall: phase.shortfall_kg,
                  })}
                </AppText>

                {!phase.product_available && Number(phase.shortfall_kg) > 0 ? (
                  <InlineAlert compact tone="warning" message={t('feedPhaseNoExactProduct', { size: phase.pellet_size_mm })} />
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
                          <AppText variant="caption" color="muted">
                          {product.package_weight_kg}kg · {Number(product.unit_price).toLocaleString()} FCFA/{t('bag')}
                        </AppText>
                          {Math.max(0, quantity * Number(product.package_weight_kg) - Number(phase.shortfall_kg ?? 0)) > 0 ? (
                            <AppText variant="caption" color="muted">{t('feedPhaseSurplus', {
                              surplus: Math.max(0, quantity * Number(product.package_weight_kg) - Number(phase.shortfall_kg ?? 0)).toFixed(2),
                            })}</AppText>
                          ) : null}
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
            ))}
          </ScrollView>
          <View style={styles.footer}>
            {uncoveredPhases.length > 0 ? (
              <AppText variant="caption" color="warning" style={styles.uncoveredMessage}>
                {t('feedAvailableProductsOnly', {
                  phases: uncoveredPhases.length,
                  quantity: formatDecimalForDisplay(uncoveredKg, numberLocale),
                })}
              </AppText>
            ) : null}
            <Button
              label={`${t('feedPhaseOrderAllBtn')} · ${totalBags} ${t('bags')}`}
              iconLeft="cart"
              onPress={handleOrderAll}
              disabled={totalBags <= 0 || Boolean(submittedScopes.all) || recommendation?.status === 'unavailable'}
            />
          </View>
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
  detailsCard: { gap: spacing[2] },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing[3] },
  uncoveredMessage: { marginBottom: spacing[2] },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[3] },
  phaseMeta: { marginTop: spacing[1], marginBottom: spacing[3] },
  flex: { flex: 1 },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3] },
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  quantity: { minWidth: 28, textAlign: 'center' },
  phaseButton: { marginTop: spacing[3] },
  footer: { padding: spacing[4], backgroundColor: colors.surface.card, borderTopWidth: 1, borderTopColor: colors.border.subtle },
});
