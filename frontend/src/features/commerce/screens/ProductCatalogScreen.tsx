/**
 * ProductCatalogScreen — "Acheter mes aliments"
 *
 * Vue personnalisée : affiche en tête le suivi des besoins en aliments
 * pour le cycle actif (total nécessaire / commandé / consommé / reste),
 * puis le catalogue DIBAQ filtré par espèce du cycle.
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useDispatch, useSelector } from 'react-redux';

import { AppDispatch, RootState } from '@/store/store';
import { fetchProducts, applyFilters, addToCart } from '@/features/commerce/store/commerceSlice';
import { fetchCycleFeedStatus } from '@/features/aquaculture/store/aquacultureSlice';
import { Product, ProductSpecies } from '@/types/commerce';
import { AQUACARE_COLORS } from '@/constants/colors';
import { PRODUCT_SPECIES } from '@/domain/commerce/constants';
import { RootStackParamList } from '@/navigation/MainNavigator';

type NavigationProp = StackNavigationProp<RootStackParamList, 'ProductCatalog'>;

export default function ProductCatalogScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const dispatch = useDispatch<AppDispatch>();

  const { products, cart } = useSelector((state: RootState) => state.commerce);
  const { items: productsList, loading, error, filters } = products;
  const cartItemsCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  const currentCycle = useSelector((s: RootState) => s.aquaculture.currentCycle);
  const { data: feedStatus, loading: feedLoading } = useSelector(
    (s: RootState) => s.aquaculture.cycleFeedStatus
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpecies, setSelectedSpecies] = useState<ProductSpecies | undefined>();
  const [refreshing, setRefreshing] = useState(false);

  // Charger les produits DIBAQ uniquement
  useEffect(() => {
    const dibaqFilters = {
      brand: 'dibaq' as const,
      ...(selectedSpecies ? { species: selectedSpecies } : {}),
    };
    dispatch(applyFilters(dibaqFilters));
    dispatch(fetchProducts(dibaqFilters));
  }, [selectedSpecies]);

  // Charger le statut aliments pour le cycle actif
  useEffect(() => {
    if (currentCycle?.id) {
      dispatch(fetchCycleFeedStatus(currentCycle.id));
    }
  }, [currentCycle?.id]);

  const handleApplySearch = () => {
    const newFilters = {
      brand: 'dibaq' as const,
      ...(selectedSpecies ? { species: selectedSpecies } : {}),
      ...(searchQuery.trim() ? { search: searchQuery.trim() } : {}),
    };
    dispatch(applyFilters(newFilters));
    dispatch(fetchProducts(newFilters));
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedSpecies(undefined);
    dispatch(applyFilters({ brand: 'dibaq' as const }));
    dispatch(fetchProducts({ brand: 'dibaq' as const }));
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    const dibaqFilters = {
      brand: 'dibaq' as const,
      ...(selectedSpecies ? { species: selectedSpecies } : {}),
    };
    await dispatch(fetchProducts(dibaqFilters));
    if (currentCycle?.id) await dispatch(fetchCycleFeedStatus(currentCycle.id));
    setRefreshing(false);
  };

  const handleQuickAddToCart = (product: Product) => {
    dispatch(addToCart({ product, quantity: 1 }));
    Alert.alert(t('success'), t('productAddedToCart'), [{ text: t('ok') }]);
  };

  const handleProductPress = (product: Product) => {
    navigation.navigate('ProductDetail', { productId: product.id });
  };

  const handleCartPress = () => {
    navigation.navigate('Cart');
  };

  const handleOrderRemaining = () => {
    if (currentCycle?.id) {
      navigation.navigate('CycleFeedPhases', { cycleId: currentCycle.id });
    }
  };

  const renderProductCard = ({ item }: { item: Product }) => (
    <TouchableOpacity
      className="bg-white rounded-xl p-4 flex-row"
      onPress={() => handleProductPress(item)}
      activeOpacity={0.7}
    >
      <View className="w-20 h-20 bg-cream rounded-lg items-center justify-center mr-3">
        <Ionicons name="cube-outline" size={40} color={AQUACARE_COLORS.GREEN_PRIMARY} />
      </View>

      <View className="flex-1">
        <Text className="text-xs text-gray-light font-semibold mb-1">
          {item.brand.toUpperCase()}
        </Text>
        <Text className="text-base font-bold text-gray-dark mb-2" numberOfLines={2}>
          {item.name}
        </Text>

        <View className="mb-2">
          <Text className="text-xs text-gray-light">
            {item.pellet_size_mm}mm
            {item.protein_percentage && ` - ${item.protein_percentage}% ${t('protein')}`}
          </Text>
        </View>

        <View className="flex-row justify-between items-center">
          <View>
            <Text className="text-xs text-gray-light">{item.package_weight_kg}kg</Text>
            <Text className="text-lg font-bold text-aquacare-primary">
              {parseFloat(item.price_per_package).toLocaleString()} FCFA
            </Text>
          </View>

          <TouchableOpacity
            className="bg-aquacare-primary w-10 h-10 rounded-full items-center justify-center"
            onPress={() => handleQuickAddToCart(item)}
          >
            <Ionicons name="cart-outline" size={20} color={AQUACARE_COLORS.WHITE} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View className="py-16 items-center">
      <Ionicons name="cube-outline" size={80} color={AQUACARE_COLORS.GRAY_LIGHT} />
      <Text className="mt-5 text-xl font-bold text-gray-dark">{t('noProductsFound')}</Text>
      <Text className="mt-2 text-sm text-gray-light text-center px-6">
        {t('tryDifferentFilters')}
      </Text>
      <TouchableOpacity
        className="mt-6 bg-aquacare-primary px-6 py-3 rounded-lg"
        onPress={handleResetFilters}
      >
        <Text className="text-white text-base font-semibold">{t('resetFilters')}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View className="flex-1 bg-cream">
      {/* Header */}
      <View className="bg-white px-5 pt-16 pb-5 flex-row justify-between items-center shadow">
        <TouchableOpacity onPress={() => navigation.goBack()} className="w-10">
          <Ionicons name="arrow-back" size={24} color={AQUACARE_COLORS.GRAY_DARK} />
        </TouchableOpacity>

        <View className="flex-1 items-center">
          <Text className="text-2xl font-bold text-gray-dark">{t('myFeedTitle')}</Text>
          <Text className="text-sm text-gray-light mt-1">
            {productsList.length} {t('products')}
          </Text>
        </View>

        <TouchableOpacity className="relative w-10 items-end" onPress={handleCartPress}>
          <Ionicons name="cart-outline" size={28} color={AQUACARE_COLORS.GREEN_PRIMARY} />
          {cartItemsCount > 0 && (
            <View className="absolute -top-2 -right-2 bg-[#dc2626] rounded-full min-w-[24px] h-6 justify-center items-center px-1.5">
              <Text className="text-white text-xs font-bold">{cartItemsCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Bannière suivi aliments cycle actif */}
      {currentCycle ? (
        <View style={cycleCardStyles.card}>
          <Text style={cycleCardStyles.cardTitle}>{t('myFeedCycleHeader')}</Text>

          {feedLoading ? (
            <ActivityIndicator size="small" color={AQUACARE_COLORS.GREEN_PRIMARY} style={{ marginVertical: 8 }} />
          ) : feedStatus ? (
            <>
              {/* Total + barre de progression */}
              <View style={cycleCardStyles.totalRow}>
                <View>
                  <Text style={cycleCardStyles.totalLabel}>{t('myFeedTotalNeeded')}</Text>
                  <Text style={cycleCardStyles.totalValue}>
                    {feedStatus.total_bags_needed} {t('bags')}
                  </Text>
                </View>
                <View style={cycleCardStyles.progressBlock}>
                  <FeedProgressBar
                    ordered={feedStatus.total_bags_ordered}
                    total={feedStatus.total_bags_needed}
                  />
                  <Text style={cycleCardStyles.progressLabel}>
                    {feedStatus.total_bags_ordered}/{feedStatus.total_bags_needed} {t('myFeedOrderedShort')}
                  </Text>
                </View>
              </View>

              {/* Détails secondaires */}
              <FeedRow label={t('myFeedOrdered')} value={feedStatus.total_bags_ordered} />
              <FeedRow label={t('myFeedConsumed')} value={feedStatus.bags_consumed_equivalent} />
              <FeedRow
                label={t('myFeedRemaining')}
                value={feedStatus.bags_remaining_to_order}
                highlight
              />

              {/* CTA toujours visible */}
              <TouchableOpacity
                style={[
                  cycleCardStyles.orderBtn,
                  feedStatus.bags_remaining_to_order === 0 && cycleCardStyles.orderBtnSecondary,
                ]}
                onPress={handleOrderRemaining}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={feedStatus.bags_remaining_to_order > 0 ? 'cart-outline' : 'list-outline'}
                  size={16}
                  color="#fff"
                  style={{ marginRight: 6 }}
                />
                <Text style={cycleCardStyles.orderBtnText}>
                  {feedStatus.bags_remaining_to_order > 0
                    ? t('myFeedOrderRemainingBtn', { count: feedStatus.bags_remaining_to_order })
                    : t('myFeedViewPlanBtn')}
                </Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      ) : (
        <View style={cycleCardStyles.noCycleCard}>
          <Ionicons name="information-circle-outline" size={20} color={AQUACARE_COLORS.GRAY_LIGHT} />
          <Text style={cycleCardStyles.noCycleText}>{t('myFeedNoCycle')}</Text>
        </View>
      )}

      {/* Filtres produits (espèce uniquement, plus de filtre marque) */}
      <View className="bg-white px-4 py-4 mb-2">
        <View className="flex-row items-center bg-cream rounded-lg px-3 mb-3">
          <Ionicons name="search-outline" size={20} color={AQUACARE_COLORS.GRAY_LIGHT} />
          <TextInput
            className="flex-1 py-3 pl-2 text-base text-gray-dark"
            placeholder={t('searchProducts')}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleApplySearch}
          />
        </View>

        <View className="gap-2 mb-1">
          <Text className="text-sm font-semibold text-gray-dark">{t('species')}</Text>
          <View className="flex-row flex-wrap gap-2">
            {PRODUCT_SPECIES.map((species) => (
              <TouchableOpacity
                key={species.value}
                className={`px-4 py-2 rounded-full border ${
                  selectedSpecies === species.value
                    ? 'bg-aquacare-primary border-aquacare-primary'
                    : 'bg-cream border-gray-light'
                }`}
                onPress={() =>
                  setSelectedSpecies(selectedSpecies === species.value ? undefined : species.value)
                }
              >
                <Text
                  className={`text-sm ${
                    selectedSpecies === species.value ? 'text-white font-semibold' : 'text-gray-dark'
                  }`}
                >
                  {t(species.labelKey)}
                </Text>
              </TouchableOpacity>
            ))}
            {selectedSpecies && (
              <TouchableOpacity
                className="py-2 px-4 rounded-full border border-gray-light"
                onPress={handleResetFilters}
              >
                <Text className="text-sm text-gray-dark">{t('clear')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {loading && !refreshing ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={AQUACARE_COLORS.GREEN_PRIMARY} />
          <Text className="mt-3 text-base text-gray-light">{t('loading')}</Text>
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-10 py-10">
          <Ionicons name="alert-circle-outline" size={48} color={AQUACARE_COLORS.ERROR} />
          <Text className="mt-3 text-base text-[#dc2626] text-center">{error}</Text>
          <TouchableOpacity
            className="mt-5 bg-aquacare-primary px-6 py-3 rounded-lg"
            onPress={() => dispatch(fetchProducts(filters))}
          >
            <Text className="text-white text-base font-semibold">{t('retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={productsList}
          renderItem={renderProductCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 16 }}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[AQUACARE_COLORS.GREEN_PRIMARY]}
              tintColor={AQUACARE_COLORS.GREEN_PRIMARY}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

// ── Sub-components for cycle feed banner ─────────────────────────────────────

function FeedRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <View style={cycleCardStyles.row}>
      <Text style={cycleCardStyles.rowLabel}>{label}</Text>
      <Text style={[cycleCardStyles.rowValue, highlight && cycleCardStyles.rowValueHighlight]}>
        {value} sacs
      </Text>
    </View>
  );
}

function FeedProgressBar({ ordered, total }: { ordered: number; total: number }) {
  const pct = total > 0 ? Math.min(ordered / total, 1) : 0;
  return (
    <View style={cycleCardStyles.progressTrack}>
      <View style={[cycleCardStyles.progressFill, { width: `${Math.round(pct * 100)}%` }]} />
    </View>
  );
}

const cycleCardStyles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: AQUACARE_COLORS.GREEN_PRIMARY,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: AQUACARE_COLORS.GRAY_DARK,
    marginBottom: 10,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  totalLabel: {
    fontSize: 12,
    color: AQUACARE_COLORS.GRAY_LIGHT,
    marginBottom: 2,
  },
  totalValue: {
    fontSize: 22,
    fontWeight: '700',
    color: AQUACARE_COLORS.GREEN_PRIMARY,
  },
  progressBlock: {
    flex: 1,
    marginLeft: 16,
  },
  progressLabel: {
    fontSize: 11,
    color: AQUACARE_COLORS.GRAY_LIGHT,
    marginTop: 3,
    textAlign: 'right',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  rowLabel: {
    fontSize: 13,
    color: AQUACARE_COLORS.GRAY_LIGHT,
  },
  rowValue: {
    fontSize: 13,
    fontWeight: '600',
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  rowValueHighlight: {
    color: AQUACARE_COLORS.GREEN_PRIMARY,
    fontSize: 14,
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: AQUACARE_COLORS.GREEN_PRIMARY,
    borderRadius: 3,
  },
  orderBtn: {
    backgroundColor: AQUACARE_COLORS.GREEN_PRIMARY,
    borderRadius: 8,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  orderBtnSecondary: {
    backgroundColor: AQUACARE_COLORS.GREEN_DARK,
  },
  orderBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  noCycleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f1f5f9',
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 10,
    padding: 12,
  },
  noCycleText: {
    fontSize: 13,
    color: AQUACARE_COLORS.GRAY_LIGHT,
    flex: 1,
    lineHeight: 18,
  },
});

