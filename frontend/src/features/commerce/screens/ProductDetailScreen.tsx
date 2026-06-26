/**
 * ProductDetailScreen - Details Produit AquaCare (NativeWind)
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';

import { AppDispatch, RootState } from '@/store/store';
import { fetchProductDetail, addToCart } from '@/features/commerce/store/commerceSlice';
import { Product } from '@/types/commerce';
import { AQUACARE_COLORS } from '@/constants/colors';

type RouteParams = {
  ProductDetail: {
    productId: string;
  };
};

export default function ProductDetailScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'ProductDetail'>>();
  const dispatch = useDispatch<AppDispatch>();

  const { productId } = route.params;

  const { products, cart } = useSelector((state: RootState) => state.commerce);
  const { items: allProducts } = products;

  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadProduct = async () => {
      setIsLoading(true);
      try {
        const existingProduct = allProducts.find((p) => p.id === productId);
        if (existingProduct) {
          setProduct(existingProduct);
        } else {
          const result = await dispatch(fetchProductDetail(productId)).unwrap();
          setProduct(result);
        }
      } catch (error) {
        Alert.alert(t('error'), t('productLoadError'));
      } finally {
        setIsLoading(false);
      }
    };

    loadProduct();
  }, [allProducts, dispatch, productId, t]);

  const handleAddToCart = () => {
    if (!product) return;

    dispatch(addToCart({ product, quantity }));
    Alert.alert(
      t('success'),
      t('productAddedToCartWithQuantity', { quantity, name: product.name }),
      [
        {
          text: t('viewCart'),
          onPress: () => navigation.navigate('Cart' as never),
        },
        { text: t('continueShopping') },
      ]
    );
  };

  const handleIncrement = () => setQuantity((prev) => prev + 1);
  const handleDecrement = () => {
    if (quantity > 1) setQuantity((prev) => prev - 1);
  };

  const similarProducts = useMemo(() => {
    if (!product) return [];
    return allProducts
      .filter((p) => p.species === product.species && p.id !== product.id && p.is_available)
      .slice(0, 3);
  }, [allProducts, product]);

  const cartItemsCount = useMemo(
    () => cart.items.reduce((sum, item) => sum + item.quantity, 0),
    [cart.items]
  );

  const renderSimilarProduct = useCallback(
    ({ item: similarProduct }: { item: Product }) => (
      <TouchableOpacity
        className="w-36 bg-cream rounded-xl p-3 mr-3"
        onPress={() => navigation.setParams({ productId: similarProduct.id } as never)}
      >
        <View className="w-full h-24 bg-white rounded-lg items-center justify-center mb-2">
          <Ionicons name="cube-outline" size={32} color={AQUACARE_COLORS.GREEN_PRIMARY} />
        </View>
        <Text className="text-xs text-gray-light font-semibold mb-1">
          {similarProduct.brand.toUpperCase()}
        </Text>
        <Text className="text-sm text-gray-dark font-semibold mb-2 min-h-[36px]" numberOfLines={2}>
          {similarProduct.name}
        </Text>
        <Text className="text-sm font-bold text-aquacare-primary">
          {parseFloat(similarProduct.price_per_package).toLocaleString()} FCFA
        </Text>
      </TouchableOpacity>
    ),
    [navigation]
  );

  if (isLoading || !product) {
    return (
      <View className="flex-1 bg-cream">
        <View className="bg-white px-5 pt-16 pb-5 flex-row items-center justify-between shadow">
          <TouchableOpacity onPress={() => navigation.goBack()} className="w-10">
            <Ionicons name="arrow-back" size={24} color={AQUACARE_COLORS.GRAY_DARK} />
          </TouchableOpacity>
          <Text className="text-lg font-bold text-gray-dark">{t('productDetails')}</Text>
          <View className="w-10" />
        </View>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={AQUACARE_COLORS.GREEN_PRIMARY} />
          <Text className="mt-3 text-base text-gray-light">{t('loading')}</Text>
        </View>
      </View>
    );
  }

  const pricePerPackage = parseFloat(product.price_per_package);
  const pricePerKg = parseFloat(product.price_per_kg);
  const totalPrice = pricePerPackage * quantity;

  return (
    <View className="flex-1 bg-cream">
      <View className="bg-white px-5 pt-16 pb-5 flex-row items-center justify-between shadow">
        <TouchableOpacity onPress={() => navigation.goBack()} className="w-10">
          <Ionicons name="arrow-back" size={24} color={AQUACARE_COLORS.GRAY_DARK} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-gray-dark">{t('productDetails')}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Cart' as never)} className="relative">
          <Ionicons name="cart-outline" size={24} color={AQUACARE_COLORS.GREEN_PRIMARY} />
          {cartItemsCount > 0 && (
            <View className="absolute -top-2 -right-2 bg-[#dc2626] rounded-full min-w-[20px] h-5 justify-center items-center px-1">
              <Text className="text-white text-xs font-bold">{cartItemsCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="bg-white items-center py-10">
          <View className="w-48 h-48 bg-cream rounded-full items-center justify-center">
            <Ionicons name="cube" size={80} color={AQUACARE_COLORS.GREEN_PRIMARY} />
          </View>
        </View>

        <View className="bg-white px-5 py-5 mt-2">
          <Text className="text-xs text-gray-light font-semibold mb-1">{product.brand.toUpperCase()}</Text>
          <Text className="text-2xl font-bold text-gray-dark mb-4">{product.name}</Text>

          <View className="flex-row flex-wrap gap-2 mb-5">
            <View className="flex-row items-center bg-cream px-3 py-2 rounded-xl gap-2">
              <Ionicons name="fish" size={16} color={AQUACARE_COLORS.GREEN_PRIMARY} />
              <Text className="text-sm text-gray-dark font-semibold">{t(product.species)}</Text>
            </View>
            <View className="flex-row items-center bg-cream px-3 py-2 rounded-xl gap-2">
              <Ionicons name="resize" size={16} color={AQUACARE_COLORS.GREEN_PRIMARY} />
              <Text className="text-sm text-gray-dark font-semibold">{product.pellet_size_mm}mm</Text>
            </View>
            {product.phase && (
              <View className="flex-row items-center bg-cream px-3 py-2 rounded-xl gap-2">
                <Ionicons name="water" size={16} color={AQUACARE_COLORS.GREEN_PRIMARY} />
                <Text className="text-sm text-gray-dark font-semibold">{t(product.phase)}</Text>
              </View>
            )}
          </View>

          <View className="pt-4 border-t border-[#f1f5f9]">
            <Text className="text-sm text-gray-light mb-1">{t('pricePerBag')}</Text>
            <Text className="text-2xl font-bold text-aquacare-primary mb-1">
              {pricePerPackage.toLocaleString()} FCFA
            </Text>
            <Text className="text-sm text-gray-light">
              {pricePerKg.toLocaleString()} FCFA/kg - {product.package_weight_kg}kg
            </Text>
          </View>
        </View>

        {product.protein_percentage && product.lipid_percentage && (
          <View className="bg-white px-5 py-5 mt-2">
            <Text className="text-lg font-bold text-gray-dark mb-4">{t('nutritionalComposition')}</Text>
            <View className="flex-row gap-4">
              <View className="flex-1 bg-cream rounded-xl p-5 items-center">
                <Ionicons name="nutrition" size={24} color={AQUACARE_COLORS.GREEN_PRIMARY} />
                <Text className="text-2xl font-bold text-aquacare-primary mt-2">
                  {product.protein_percentage}%
                </Text>
                <Text className="text-xs text-gray-light mt-1">{t('protein')}</Text>
              </View>
              <View className="flex-1 bg-cream rounded-xl p-5 items-center">
                <Ionicons name="water" size={24} color={AQUACARE_COLORS.GREEN_PRIMARY} />
                <Text className="text-2xl font-bold text-aquacare-primary mt-2">
                  {product.lipid_percentage}%
                </Text>
                <Text className="text-xs text-gray-light mt-1">{t('lipids')}</Text>
              </View>
            </View>
          </View>
        )}

        <View className="bg-white px-5 py-5 mt-2">
          <Text className="text-lg font-bold text-gray-dark mb-3">{t('quantity')}</Text>
          <View className="flex-row items-center justify-center gap-5 mb-4">
            <TouchableOpacity
              className={`w-12 h-12 rounded-full items-center justify-center ${
                quantity === 1 ? 'bg-cream' : 'bg-aquacare-primary'
              }`}
              onPress={handleDecrement}
              disabled={quantity === 1}
            >
              <Ionicons
                name="remove"
                size={24}
                color={quantity === 1 ? AQUACARE_COLORS.GRAY_LIGHT : AQUACARE_COLORS.WHITE}
              />
            </TouchableOpacity>
            <View className="items-center min-w-[80px]">
              <Text className="text-2xl font-bold text-gray-dark">{quantity}</Text>
              <Text className="text-sm text-gray-light mt-1">
                {t(quantity > 1 ? 'bags' : 'bag')}
              </Text>
            </View>
            <TouchableOpacity
              className="w-12 h-12 rounded-full items-center justify-center bg-aquacare-primary"
              onPress={handleIncrement}
            >
              <Ionicons name="add" size={24} color={AQUACARE_COLORS.WHITE} />
            </TouchableOpacity>
          </View>
          <Text className="text-sm text-gray-light text-center mb-1">{t('total')}</Text>
          <Text className="text-2xl font-bold text-aquacare-primary text-center">
            {totalPrice.toLocaleString()} FCFA
          </Text>
        </View>

        {similarProducts.length > 0 && (
          <View className="bg-white px-5 py-5 mt-2 mb-24">
            <Text className="text-lg font-bold text-gray-dark mb-4">{t('similarProducts')}</Text>
            <FlatList
              horizontal
              data={similarProducts}
              keyExtractor={(item) => item.id}
              renderItem={renderSimilarProduct}
              showsHorizontalScrollIndicator={false}
            />
          </View>
        )}
      </ScrollView>

      {product.is_available && (
        <View className="absolute bottom-0 left-0 right-0 bg-white p-4 shadow">
          <TouchableOpacity
            className="bg-aquacare-primary flex-row items-center justify-center py-4 rounded-lg gap-3"
            onPress={handleAddToCart}
          >
            <Ionicons name="cart" size={24} color={AQUACARE_COLORS.WHITE} />
            <Text className="text-white text-lg font-bold">{t('addToCart')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
