/**
 * ProductCatalogScreen — "Acheter mes aliments"
 *
 * Vue personnalisée : affiche en tête le suivi des besoins en aliments
 * pour le cycle actif (total nécessaire / commandé / consommé / reste),
 * puis le catalogue DIBAQ filtré par espèce du cycle.
 */
import React, { useContext, useEffect, useState } from 'react';
import {
  View,
  FlatList,
  RefreshControl,
  Alert,
  StyleSheet,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NavigationProp, RouteProp } from '@react-navigation/native';
import { NavigationContext, NavigationRouteContext } from '@react-navigation/core';
import { useDispatch, useSelector } from 'react-redux';

import { AppDispatch, RootState } from '@/store/store';
import { fetchProducts, applyFilters, addToCart } from '@/features/commerce/store/commerceSlice';
import { Product, ProductSpecies } from '@/types/commerce';
import { PRODUCT_SPECIES } from '@/domain/commerce/constants';
import type { RootStackParamList } from '@/navigation/MainNavigator';
import { AppHeader, AppText, Button, EmptyState, ErrorState, IconButton, SegmentedControl, TextField } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { ProductCard } from '@/features/commerce/components/ProductCard';

export default function ProductCatalogScreen() {
  const { t } = useTranslation();
  const navigation = useContext(NavigationContext) as NavigationProp<RootStackParamList> | undefined;
  const route = useContext(NavigationRouteContext) as RouteProp<
    RootStackParamList,
    'ProductCatalog'
  > | undefined;
  const dispatch = useDispatch<AppDispatch>();

  const { products, cart } = useSelector((state: RootState) => state.commerce);
  const { items: productsList, loading, error, filters } = products;
  const cartItemsCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  const storeNavigationParams = route?.params?.cycleId
    ? { cycleId: route.params.cycleId, source: 'store' as const }
    : undefined;

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
    setRefreshing(false);
  };

  const handleQuickAddToCart = (product: Product) => {
    dispatch(addToCart({ product, quantity: 1 }));
    Alert.alert(t('success'), t('productAddedToCart'), [{ text: t('ok') }]);
  };

  const handleProductPress = (product: Product) => {
    if (!navigation) {
      return;
    }

    navigation.navigate(
      'ProductDetail',
      storeNavigationParams ? { productId: product.id, ...storeNavigationParams } : { productId: product.id }
    );
  };

  const handleCartPress = () => {
    if (!navigation) {
      return;
    }

    navigation.navigate('Cart', storeNavigationParams);
  };

  const speciesOptions = [
    { value: 'all', label: t('all') },
    ...PRODUCT_SPECIES.map((species) => ({ value: species.value, label: t(species.labelKey) })),
  ] as const;

  const renderProductCard = ({ item }: { item: Product }) => (
    <ProductCard
      product={item}
      proteinLabel={t('protein')}
      quickAddLabel={`${t('addToCart')} ${item.name}`}
      onPress={() => handleProductPress(item)}
      onQuickAdd={() => handleQuickAddToCart(item)}
    />
  );

  return (
    <View style={styles.root}>
      <AppHeader
        title={t('myFeedTitle')}
        subtitle={`${productsList.length} ${t('products')}`}
        onBack={() => navigation?.goBack()}
        backLabel={t('back')}
        rightAction={<IconButton icon="cart-outline" variant="ghost" tone="inverse" accessibilityLabel={`${t('cart')} ${cartItemsCount}`} badge={cartItemsCount} onPress={handleCartPress} />}
      />
      <View style={styles.filters}>
        <TextField
          placeholder={t('searchProducts')}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleApplySearch}
          returnKeyType="search"
          accessibilityLabel={t('searchProducts')}
        />
        <AppText variant="label">{t('species')}</AppText>
        <SegmentedControl
          value={selectedSpecies ?? 'all'}
          options={speciesOptions}
          onChange={(value) => setSelectedSpecies(value === 'all' ? undefined : value)}
        />
        {searchQuery || selectedSpecies ? <Button label={t('resetFilters')} variant="ghost" size="small" onPress={handleResetFilters} /> : null}
      </View>
      {loading && !refreshing ? <View style={styles.state}><AppText color="muted">{t('loading')}</AppText></View> : null}
      {error && !loading ? <ErrorState message={error} actionLabel={t('retry')} onAction={() => dispatch(fetchProducts(filters))} /> : null}
      {!loading && !error ? (
        <FlatList
          data={productsList}
          renderItem={renderProductCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title={t('noProductsFound')} message={t('tryDifferentFilters')} actionLabel={t('resetFilters')} onAction={handleResetFilters} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.brand.primary} />}
          showsVerticalScrollIndicator={false}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.page },
  filters: { gap: spacing[2], padding: spacing[4], backgroundColor: colors.surface.card, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  list: { padding: spacing[4], gap: spacing[3], paddingBottom: spacing[6] },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
