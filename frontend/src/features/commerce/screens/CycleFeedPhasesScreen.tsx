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

type Props = StackScreenProps<RootStackParamList, 'CycleFeedPhases'>;

function buildProductForCart(product: FeedPhaseProduct): Product {
  return {
    id: product.product_id,
    brand: product.brand as ProductBrand,
    name: product.product_name,
    species: 'tilapia',
    phase: null,
    pellet_size_mm: '',
    protein_percentage: null,
    lipid_percentage: null,
    package_weight_kg: product.package_weight_kg,
    price_per_package: String(Math.round(product.unit_price)),
    price_per_kg: String(Math.round(product.unit_price / (product.package_weight_kg || 1))),
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

export default function CycleFeedPhasesScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const { cycleId } = route.params;
  const cartItemsCount = useSelector((state: RootState) =>
    state.commerce.cart.items.reduce((sum, item) => sum + item.quantity, 0)
  );
  const [phases, setPhases] = useState<FeedPhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const loadPhases = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await aquacultureService.getCycleFeedPhases(cycleId);
      setPhases(result.feeding_phases);
      const initialQuantities: Record<string, number> = {};
      result.feeding_phases.forEach((phase) =>
        phase.products.forEach((product) => {
          initialQuantities[product.product_id] = product.quantity_bags;
        })
      );
      setQuantities(initialQuantities);
    } catch {
      setError('feedPhasesLoadError');
    } finally {
      setLoading(false);
    }
  }, [cycleId]);

  useEffect(() => {
    void loadPhases();
  }, [loadPhases]);

  const handleQuantityChange = useCallback((productId: string, delta: number) => {
    setQuantities((current) => ({
      ...current,
      [productId]: Math.max(1, (current[productId] ?? 1) + delta),
    }));
  }, []);

  const addPhaseToCart = useCallback(
    (phase: FeedPhase) => {
      phase.products.forEach((product) =>
        dispatch(
          addToCart({
            product: buildProductForCart(product),
            quantity: quantities[product.product_id] ?? product.quantity_bags,
          })
        )
      );
      Alert.alert(t('success'), t('feedPhaseAddedToCart'), [{ text: t('ok') }]);
    },
    [dispatch, quantities, t]
  );

  const handleOrderAll = useCallback(() => {
    phases.forEach((phase) =>
      phase.products.forEach((product) =>
        dispatch(
          addToCart({
            product: buildProductForCart(product),
            quantity: quantities[product.product_id] ?? product.quantity_bags,
          })
        )
      )
    );
    navigation.navigate('Cart', { cycleId });
  }, [cycleId, dispatch, navigation, phases, quantities]);

  const totalBags = useMemo(() => phases.reduce((sum, phase) => sum + phase.total_bags, 0), [phases]);

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
        <EmptyState title={t('feedPhasesEmpty')} />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <InlineAlert compact message={t('feedPhasesSubtitle')} tone="info" />
            {phases.map((phase, phaseIndex) => (
              <Card key={`${phase.phase_name}-${phaseIndex}`} variant="outlined" style={styles.phaseCard}>
                <View style={styles.rowBetween}>
                  <AppText variant="sectionTitle" style={styles.flex}>
                    {phaseLabel(phase, phases, t)}
                  </AppText>
                  <Badge label={`${phase.total_bags} ${t('bags')}`} tone="success" />
                </View>
                <AppText color="muted" style={styles.phaseMeta}>
                  {phase.duration_days} {t('days')} · {t('feedPhasePellet', { size: phase.pellet_size_mm })}
                </AppText>

                {phase.products.map((product) => {
                  const quantity = quantities[product.product_id] ?? product.quantity_bags;
                  return (
                    <View key={product.product_id}>
                      <Divider />
                      <View style={styles.productRow}>
                        <View style={styles.flex}>
                          <AppText variant="bodyStrong" numberOfLines={1}>{getProductDisplayName(product.product_name, t('catfish'))}</AppText>
                          <AppText variant="caption" color="muted">
                            {product.package_weight_kg}kg · {Math.round(product.unit_price).toLocaleString()} FCFA/{t('bag')}
                          </AppText>
                        </View>
                        <View style={styles.quantityRow}>
                          <IconButton
                            icon="remove"
                            accessibilityLabel={t('decreaseQuantity')}
                            variant="surface"
                            disabled={quantity <= 1}
                            onPress={() => handleQuantityChange(product.product_id, -1)}
                          />
                          <AppText variant="bodyStrong" style={styles.quantity}>{quantity}</AppText>
                          <IconButton
                            icon="add"
                            accessibilityLabel={t('increaseQuantity')}
                            variant="surface"
                            onPress={() => handleQuantityChange(product.product_id, 1)}
                          />
                        </View>
                      </View>
                    </View>
                  );
                })}
                <Button
                  label={t('feedPhaseOrderBtn')}
                  iconLeft="cart-outline"
                  onPress={() => addPhaseToCart(phase)}
                  style={styles.phaseButton}
                />
              </Card>
            ))}
          </ScrollView>
          <View style={styles.footer}>
            <Button
              label={`${t('feedPhaseOrderAllBtn')} · ${totalBags} ${t('bags')}`}
              iconLeft="cart"
              onPress={handleOrderAll}
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
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[3] },
  phaseMeta: { marginTop: spacing[1], marginBottom: spacing[3] },
  flex: { flex: 1 },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3] },
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  quantity: { minWidth: 28, textAlign: 'center' },
  phaseButton: { marginTop: spacing[3] },
  footer: { padding: spacing[4], backgroundColor: colors.surface.card, borderTopWidth: 1, borderTopColor: colors.border.subtle },
});
