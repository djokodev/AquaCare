/**
 * ProductCatalogScreen - Catalogue Produits MAVECAM (NativeWind)
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useDispatch, useSelector } from 'react-redux';

import { AppDispatch, RootState } from '@/store/store';
import { fetchProducts, applyFilters, addToCart } from '@/store/slices/commerceSlice';
import { Product } from '@/types/commerce';
import { MAVECAM_COLORS } from '@/constants/colors';
import { PRODUCT_SPECIES, PRODUCT_BRANDS } from '@/domain/commerce';
import { RootStackParamList } from '@/navigation/MainNavigator';

type NavigationProp = StackNavigationProp<RootStackParamList, 'ProductCatalog'>;

export default function ProductCatalogScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const dispatch = useDispatch<AppDispatch>();

  const { products, cart } = useSelector((state: RootState) => state.commerce);
  const { items: productsList, loading, error, filters } = products;
  const cartItemsCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpecies, setSelectedSpecies] = useState<string | undefined>();
  const [selectedBrand, setSelectedBrand] = useState<string | undefined>();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    dispatch(fetchProducts(filters));
  }, []);

  useEffect(() => {
    const newFilters: any = {};
    if (selectedSpecies) newFilters.species = selectedSpecies;
    if (selectedBrand) newFilters.brand = selectedBrand;
    if (searchQuery.trim()) newFilters.search = searchQuery.trim();

    dispatch(applyFilters(newFilters));
    dispatch(fetchProducts(newFilters));
  }, [selectedSpecies, selectedBrand]);

  const handleApplyFilters = () => {
    const newFilters: any = {};
    if (selectedSpecies) newFilters.species = selectedSpecies;
    if (selectedBrand) newFilters.brand = selectedBrand;
    if (searchQuery.trim()) newFilters.search = searchQuery.trim();

    dispatch(applyFilters(newFilters));
    dispatch(fetchProducts(newFilters));
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedSpecies(undefined);
    setSelectedBrand(undefined);
    dispatch(applyFilters({}));
    dispatch(fetchProducts(undefined));
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await dispatch(fetchProducts(filters));
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

  const renderProductCard = ({ item }: { item: Product }) => (
    <TouchableOpacity
      className="bg-white rounded-xl p-4 flex-row shadow-sm"
      onPress={() => handleProductPress(item)}
      activeOpacity={0.7}
    >
      <View className="w-20 h-20 bg-cream rounded-lg items-center justify-center mr-3">
        <Ionicons name="cube-outline" size={40} color={MAVECAM_COLORS.GREEN_PRIMARY} />
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
            <Text className="text-lg font-bold text-mavecam-primary">
              {parseFloat(item.price_per_package).toLocaleString()} FCFA
            </Text>
          </View>

          <TouchableOpacity
            className="bg-mavecam-primary w-10 h-10 rounded-full items-center justify-center"
            onPress={() => handleQuickAddToCart(item)}
          >
            <Ionicons name="cart-outline" size={20} color={MAVECAM_COLORS.WHITE} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View className="py-16 items-center">
      <Ionicons name="cube-outline" size={80} color={MAVECAM_COLORS.GRAY_LIGHT} />
      <Text className="mt-5 text-xl font-bold text-gray-dark">{t('noProductsFound')}</Text>
      <Text className="mt-2 text-sm text-gray-light text-center px-6">
        {t('tryDifferentFilters')}
      </Text>
      <TouchableOpacity
        className="mt-6 bg-mavecam-primary px-6 py-3 rounded-lg"
        onPress={handleResetFilters}
      >
        <Text className="text-white text-base font-semibold">{t('resetFilters')}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View className="flex-1 bg-cream">
      <View className="bg-white px-5 pt-16 pb-5 flex-row justify-between items-center shadow">
        <View>
          <Text className="text-2xl font-bold text-gray-dark">{t('productCatalog')}</Text>
          <Text className="text-sm text-gray-light mt-1">
            {productsList.length} {t('products')}
          </Text>
        </View>

        <TouchableOpacity className="relative" onPress={handleCartPress}>
          <Ionicons name="cart-outline" size={28} color={MAVECAM_COLORS.GREEN_PRIMARY} />
          {cartItemsCount > 0 && (
            <View className="absolute -top-2 -right-2 bg-[#dc2626] rounded-full min-w-[24px] h-6 justify-center items-center px-1.5">
              <Text className="text-white text-xs font-bold">{cartItemsCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View className="bg-white px-4 py-4 mb-2">
        <View className="flex-row items-center bg-cream rounded-lg px-3 mb-4">
          <Ionicons name="search-outline" size={20} color={MAVECAM_COLORS.GRAY_LIGHT} />
          <TextInput
            className="flex-1 py-3 pl-2 text-base text-gray-dark"
            placeholder={t('searchProducts')}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleApplyFilters}
          />
        </View>

        <View className="gap-3">
          <View className="gap-2">
            <Text className="text-sm font-semibold text-gray-dark">{t('species')}</Text>
            <View className="flex-row flex-wrap gap-2">
              {PRODUCT_SPECIES.map((species) => (
                <TouchableOpacity
                  key={species.value}
                  className={`px-4 py-2 rounded-full border ${
                    selectedSpecies === species.value
                      ? 'bg-mavecam-primary border-mavecam-primary'
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
            </View>
          </View>

          <View className="gap-2">
            <Text className="text-sm font-semibold text-gray-dark">{t('brand')}</Text>
            <View className="flex-row flex-wrap gap-2">
              {PRODUCT_BRANDS.map((brand) => (
                <TouchableOpacity
                  key={brand.value}
                  className={`px-4 py-2 rounded-full border ${
                    selectedBrand === brand.value
                      ? 'bg-mavecam-primary border-mavecam-primary'
                      : 'bg-cream border-gray-light'
                  }`}
                  onPress={() =>
                    setSelectedBrand(selectedBrand === brand.value ? undefined : brand.value)
                  }
                >
                  <Text
                    className={`text-sm ${
                      selectedBrand === brand.value ? 'text-white font-semibold' : 'text-gray-dark'
                    }`}
                  >
                    {brand.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View className="flex-row gap-3 mt-1">
            <TouchableOpacity
              className="flex-1 bg-mavecam-primary py-3 rounded-lg items-center"
              onPress={handleApplyFilters}
            >
              <Text className="text-white text-base font-semibold">{t('applyFilters')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="py-3 px-5 rounded-lg border border-gray-light"
              onPress={handleResetFilters}
            >
              <Text className="text-base text-gray-dark">{t('clear')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {loading && !refreshing ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={MAVECAM_COLORS.GREEN_PRIMARY} />
          <Text className="mt-3 text-base text-gray-light">{t('loading')}</Text>
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-10 py-10">
          <Ionicons name="alert-circle-outline" size={48} color={MAVECAM_COLORS.ERROR} />
          <Text className="mt-3 text-base text-[#dc2626] text-center">{error}</Text>
          <TouchableOpacity
            className="mt-5 bg-mavecam-primary px-6 py-3 rounded-lg"
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
              colors={[MAVECAM_COLORS.GREEN_PRIMARY]}
              tintColor={MAVECAM_COLORS.GREEN_PRIMARY}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}
