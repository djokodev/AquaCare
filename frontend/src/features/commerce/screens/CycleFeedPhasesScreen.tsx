/**
 * CycleFeedPhasesScreen — "Commander par phase"
 *
 * Affiche les phases d'alimentation simulées pour le cycle actif,
 * avec les produits recommandés par phase (Aller Aqua / DIBAQ selon simulation).
 * Permet de commander une phase à la fois ou tout d'un coup.
 *
 * Note : les produits viennent directement de CycleSimulationService — aucune
 * dépendance sur le catalogue Redux (les marques peuvent différer).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { StackScreenProps } from '@react-navigation/stack';
import { useDispatch, useSelector } from 'react-redux';

import { AppDispatch, RootState } from '@/store/store';
import { addToCart } from '@/features/commerce/store/commerceSlice';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { FeedPhase, FeedPhaseProduct } from '@/types/aquaculture';
import { Product, ProductBrand } from '@/types/commerce';
import { MAVECAM_COLORS } from '@/constants/colors';
import { RootStackParamList } from '@/navigation/MainNavigator';

type Props = StackScreenProps<RootStackParamList, 'CycleFeedPhases'>;

/** Construit un objet Product minimal depuis les données de simulation pour l'ajout au panier. */
function buildProductForCart(p: FeedPhaseProduct): Product {
  return {
    id: p.product_id,
    brand: p.brand as ProductBrand,
    name: p.product_name,
    species: 'tilapia',
    phase: null,
    pellet_size_mm: '',
    protein_percentage: null,
    lipid_percentage: null,
    package_weight_kg: p.package_weight_kg,
    price_per_package: String(Math.round(p.unit_price)),
    price_per_kg: String(Math.round(p.unit_price / (p.package_weight_kg || 1))),
    is_available: true,
    created_at: '',
    updated_at: '',
  };
}

/** Génère un label de phase unique en ajoutant le granulé si plusieurs phases ont le même nom. */
function phaseLabel(phase: FeedPhase, allPhases: FeedPhase[], t: (k: string) => string): string {
  const sameNameCount = allPhases.filter((ph) => ph.phase_name === phase.phase_name).length;
  const base = t(phase.phase_name as 'alevinage' | 'pre_grossissement' | 'grossissement');
  if (sameNameCount > 1) {
    return `${base} · ${phase.pellet_size_mm}mm`;
  }
  return base;
}

export default function CycleFeedPhasesScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const { cycleId } = route.params;

  const cartItemsCount = useSelector((s: RootState) =>
    s.commerce.cart.items.reduce((sum, item) => sum + item.quantity, 0)
  );

  const [phases, setPhases] = useState<FeedPhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    loadPhases();
  }, [cycleId]);

  const loadPhases = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await aquacultureService.getCycleFeedPhases(cycleId);
      setPhases(result.feeding_phases);
      const init: Record<string, number> = {};
      for (const phase of result.feeding_phases) {
        for (const p of phase.products) {
          init[p.product_id] = p.quantity_bags;
        }
      }
      setQuantities(init);
    } catch {
      setError(t('feedPhasesLoadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleQuantityChange = (productId: string, delta: number) => {
    setQuantities((prev) => ({
      ...prev,
      [productId]: Math.max(1, (prev[productId] ?? 1) + delta),
    }));
  };

  const handleAddPhaseToCart = useCallback(
    (phase: FeedPhase) => {
      for (const p of phase.products) {
        dispatch(
          addToCart({ product: buildProductForCart(p), quantity: quantities[p.product_id] ?? p.quantity_bags })
        );
      }
      Alert.alert(t('success'), t('feedPhaseAddedToCart'), [{ text: t('ok') }]);
    },
    [dispatch, quantities, t]
  );

  const handleOrderAll = useCallback(() => {
    for (const phase of phases) {
      for (const p of phase.products) {
        dispatch(
          addToCart({ product: buildProductForCart(p), quantity: quantities[p.product_id] ?? p.quantity_bags })
        );
      }
    }
    navigation.navigate('Cart');
  }, [dispatch, phases, quantities, navigation]);

  const totalBags = phases.reduce((sum, ph) => sum + ph.total_bags, 0);

  const renderPhaseCard = (phase: FeedPhase, index: number) => {
    const label = phaseLabel(phase, phases, t);

    return (
      <View key={index} style={styles.phaseCard}>
        {/* Phase header */}
        <View style={styles.phaseHeader}>
          <Text style={styles.phaseName}>{label}</Text>
          <View style={styles.phaseBadge}>
            <Text style={styles.phaseBadgeText}>{phase.total_bags} sacs</Text>
          </View>
        </View>

        <Text style={styles.phaseSub}>
          {phase.duration_days}j · {t('feedPhasePellet', { size: phase.pellet_size_mm })}
        </Text>

        {/* Products */}
        {phase.products.map((p) => renderProductRow(p, phase))}

        {/* Commander cette phase */}
        <TouchableOpacity
          style={styles.phaseOrderBtn}
          onPress={() => handleAddPhaseToCart(phase)}
          activeOpacity={0.8}
        >
          <Ionicons name="cart-outline" size={15} color="#fff" style={{ marginRight: 5 }} />
          <Text style={styles.phaseOrderBtnText}>{t('feedPhaseOrderBtn')}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderProductRow = (p: FeedPhaseProduct, _phase: FeedPhase) => {
    const qty = quantities[p.product_id] ?? p.quantity_bags;

    return (
      <View key={p.product_id} style={styles.productRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.productName} numberOfLines={1}>
            {p.product_name}
          </Text>
          <Text style={styles.productSub}>
            {p.package_weight_kg}kg · {Math.round(p.unit_price).toLocaleString()} FCFA/sac
          </Text>
          <Text style={styles.productRecommended}>
            {t('feedPhaseRecommended', { count: p.quantity_bags })}
          </Text>
        </View>

        <View style={styles.qtyControl}>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => handleQuantityChange(p.product_id, -1)}
          >
            <Ionicons name="remove" size={14} color={MAVECAM_COLORS.GREEN_PRIMARY} />
          </TouchableOpacity>
          <Text style={styles.qtyValue}>{qty}</Text>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => handleQuantityChange(p.product_id, 1)}
          >
            <Ionicons name="add" size={14} color={MAVECAM_COLORS.GREEN_PRIMARY} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: MAVECAM_COLORS.CREAM }}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBack}>
          <Ionicons name="arrow-back" size={24} color={MAVECAM_COLORS.GRAY_DARK} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle}>{t('feedPhasesTitle')}</Text>
        </View>
        <TouchableOpacity style={styles.headerCart} onPress={() => navigation.navigate('Cart')}>
          <Ionicons name="cart-outline" size={26} color={MAVECAM_COLORS.GREEN_PRIMARY} />
          {cartItemsCount > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{cartItemsCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={MAVECAM_COLORS.GREEN_PRIMARY} />
          <Text style={{ marginTop: 10, color: MAVECAM_COLORS.GRAY_LIGHT }}>{t('loading')}</Text>
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Ionicons name="alert-circle-outline" size={48} color={MAVECAM_COLORS.ERROR} />
          <Text style={{ marginTop: 10, color: MAVECAM_COLORS.ERROR, textAlign: 'center' }}>
            {error}
          </Text>
          <TouchableOpacity style={[styles.phaseOrderBtn, { marginTop: 16, alignSelf: 'center', paddingHorizontal: 24 }]} onPress={loadPhases}>
            <Text style={styles.phaseOrderBtnText}>{t('retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : phases.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Ionicons name="restaurant-outline" size={64} color={MAVECAM_COLORS.GRAY_LIGHT} />
          <Text style={{ marginTop: 12, fontSize: 16, color: MAVECAM_COLORS.GRAY_DARK, textAlign: 'center' }}>
            {t('feedPhasesEmpty')}
          </Text>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Info banner */}
            <View style={styles.infoBanner}>
              <Ionicons name="information-circle-outline" size={16} color={MAVECAM_COLORS.GREEN_PRIMARY} />
              <Text style={styles.infoText}>{t('feedPhasesSubtitle')}</Text>
            </View>

            {phases.map((phase, i) => renderPhaseCard(phase, i))}
          </ScrollView>

          {/* Bottom sticky — Tout commander */}
          <View style={styles.stickyBar}>
            <TouchableOpacity style={styles.orderAllBtn} onPress={handleOrderAll} activeOpacity={0.85}>
              <Ionicons name="cart" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.orderAllText}>{t('feedPhaseOrderAllBtn')}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#fff',
    paddingTop: 56,
    paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  headerBack: { width: 36 },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  headerCart: { width: 36, alignItems: 'flex-end', position: 'relative' },
  cartBadge: {
    position: 'absolute',
    top: -6,
    right: -4,
    backgroundColor: '#dc2626',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  cartBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ecfdf5',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#065f46',
    lineHeight: 17,
  },
  phaseCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: MAVECAM_COLORS.GREEN_PRIMARY,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  phaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  phaseName: {
    fontSize: 15,
    fontWeight: '700',
    color: MAVECAM_COLORS.GRAY_DARK,
    flex: 1,
    marginRight: 8,
  },
  phaseSub: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginBottom: 10,
  },
  phaseBadge: {
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  phaseBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    gap: 10,
  },
  productName: {
    fontSize: 13,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  productSub: {
    fontSize: 11,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginTop: 1,
  },
  productRecommended: {
    fontSize: 11,
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    marginTop: 2,
  },
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  qtyBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  qtyValue: {
    width: 34,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  phaseOrderBtn: {
    marginTop: 12,
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    borderRadius: 8,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  phaseOrderBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  stickyBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    padding: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 8,
  },
  orderAllBtn: {
    backgroundColor: MAVECAM_COLORS.GREEN_DARK,
    borderRadius: 10,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderAllText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
