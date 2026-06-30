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
  Image,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useDispatch, useSelector } from 'react-redux';

import { AppDispatch, RootState } from '@/store/store';
import { fetchProducts, applyFilters, addToCart } from '@/features/commerce/store/commerceSlice';
import { Product, ProductSpecies } from '@/types/commerce';
import { AQUACARE_COLORS } from '@/constants/colors';
import { PRODUCT_SPECIES } from '@/domain/commerce/constants';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { getProductBrandAsset } from '@/features/commerce/utils/productBrandAssets';

type NavigationProp = StackNavigationProp<RootStackParamList, 'ProductCatalog'>;

export default function ProductCatalogScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProp<RootStackParamList, 'ProductCatalog'>>();
  const dispatch = useDispatch<AppDispatch>();

  const { products, cart } = useSelector((state: RootState) => state.commerce);
  const { items: productsList, loading, error, filters } = products;
  const cartItemsCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  const storeNavigationParams = route.params?.cycleId
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
    navigation.navigate(
      'ProductDetail',
      storeNavigationParams ? { productId: product.id, ...storeNavigationParams } : { productId: product.id }
    );
  };

  const handleCartPress = () => {
    navigation.navigate('Cart', storeNavigationParams);
  };

  const renderProductCard = ({ item }: { item: Product }) => (
    <TouchableOpacity
      className="bg-white rounded-xl p-4 flex-row border border-[#d7e3d5] shadow-sm"
      onPress={() => handleProductPress(item)}
      activeOpacity={0.85}
    >
      <View className="w-20 h-20 bg-cream rounded-lg items-center justify-center mr-3 overflow-hidden">
        <Image source={getProductBrandAsset(item.brand)} className="w-16 h-16" resizeMode="contain" />
      </View>

      <View className="flex-1">
        <View className="flex-row items-start justify-between mb-1">
          <Text className="text-xs text-gray-light font-semibold">{item.brand.toUpperCase()}</Text>
          <Ionicons name="chevron-forward" size={18} color={AQUACARE_COLORS.GREEN_PRIMARY} />
        </View>
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

      <TouchableOpacity
          className="relative w-10 items-end"
          onPress={handleCartPress}
          accessibilityLabel={t('cart')}
        >
          <Ionicons name="cart-outline" size={28} color={AQUACARE_COLORS.GREEN_PRIMARY} />
          {cartItemsCount > 0 && (
            <View className="absolute -top-2 -right-2 bg-[#dc2626] rounded-full min-w-[24px] h-6 justify-center items-center px-1.5">
              <Text className="text-white text-xs font-bold">{cartItemsCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

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
