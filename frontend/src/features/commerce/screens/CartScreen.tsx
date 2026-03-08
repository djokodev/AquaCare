import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useDispatch, useSelector } from 'react-redux';

import { AppDispatch, RootState } from '@/store/store';
import {
  updateCartQuantity,
  removeFromCart,
  clearCart,
  setDeliveryMethod,
  setPickupLocation,
  fetchDeliveryFeePreview,
  createOrder,
} from '@/features/commerce/store/commerceSlice';
import { CartItem, DeliveryMethod, PickupLocation } from '@/types/commerce';
import { MAVECAM_COLORS } from '@/constants/colors';
import {
  DELIVERY_METHODS,
  FREE_DELIVERY_THRESHOLD,
  PICKUP_LOCATIONS,
} from '@/domain/commerce/constants';
import SelectField from '@/components/SelectField';
import logger from '@/utils/logger';
import { RootStackParamList } from '@/navigation/MainNavigator';

type NavigationProp = StackNavigationProp<RootStackParamList, 'Cart'>;

interface AxiosApiError {
  response?: { data?: { message?: string; error?: string; detail?: string } };
  message?: string;
}

const extractErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'string') return error;
  const err = error as AxiosApiError;
  const data = err?.response?.data;
  if (typeof data?.message === 'string') return data.message;
  if (typeof data?.error === 'string') return data.error;
  if (typeof data?.detail === 'string') return data.detail;
  if (typeof err?.message === 'string') return err.message;
  return fallback;
};

export default function CartScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const dispatch = useDispatch<AppDispatch>();
  const generateClientUuid = (): string => {
    return (globalThis.crypto as Crypto).randomUUID();
  };

  const { cart } = useSelector((state: RootState) => state.commerce);
  const { user, farmProfile } = useSelector((state: RootState) => state.auth);
  const { items: cartItems, delivery_method, pickup_location, deliveryPreview, previewLoading } = cart;

  const [isSubmitting, setIsSubmitting] = useState(false);

  const cartItemsCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems]
  );

  const handleFetchPreview = useCallback(async () => {
    if (cartItems.length === 0) return;

    const items = cartItems.map((item) => ({ product_id: item.product.id, quantity: item.quantity }));

    await dispatch(
      fetchDeliveryFeePreview({
        items,
        delivery_method,
      })
    );
  }, [cartItems, delivery_method, dispatch]);

  useEffect(() => {
    if (cartItems.length > 0) {
      handleFetchPreview();
    }
  }, [cartItems.length, handleFetchPreview]);

  const handleUpdateQuantity = useCallback((productId: string, newQuantity: number) => {
    dispatch(updateCartQuantity({ productId, quantity: newQuantity }));
  }, [dispatch]);

  const handleRemoveItem = useCallback((productId: string, productName: string) => {
    Alert.alert(t('confirmRemoval'), t('confirmRemovalMessage', { productName }), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('remove'), style: 'destructive', onPress: () => dispatch(removeFromCart(productId)) },
    ]);
  }, [dispatch, t]);

  const handleClearCart = useCallback(() => {
    Alert.alert(t('confirmClearCart'), t('confirmClearCartMessage'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('clear'), style: 'destructive', onPress: () => dispatch(clearCart()) },
    ]);
  }, [dispatch, t]);

  const handleDeliveryMethodChange = (method: DeliveryMethod) => {
    dispatch(setDeliveryMethod(method));
  };

  const handlePickupLocationChange = (location: PickupLocation) => {
    dispatch(setPickupLocation(location));
  };

  const handleConfirmOrder = async () => {
    if (cartItems.length === 0) {
      Alert.alert(t('error'), t('emptyCartError'));
      return;
    }

    if (delivery_method === 'pickup' && !pickup_location) {
      Alert.alert(t('error'), t('selectPickupLocationError'));
      return;
    }

    if (!user || !farmProfile) {
      Alert.alert(t('error'), t('mustBeLoggedIn'));
      return;
    }

    Alert.alert(
      t('confirmOrder'),
      t('confirmOrderMessage', {
        total: deliveryPreview?.total || '0',
        bags: deliveryPreview?.total_bags || 0,
      }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('confirm'),
          onPress: async () => {
            setIsSubmitting(true);
            try {
              const orderData = {
                items: cartItems.map((item) => ({ product_id: item.product.id, quantity: item.quantity })),
                delivery_method,
                pickup_location: delivery_method === 'pickup' ? pickup_location : undefined,
                client_uuid: generateClientUuid(),
                created_offline: false,
              };

              await dispatch(createOrder(orderData)).unwrap();

              // Vider le panier dans les callbacks pour eviter les re-renders pendant l'alerte
              Alert.alert(t('success'), t('orderCreatedSuccess'), [
                {
                  text: t('viewOrder'),
                  onPress: () => {
                    dispatch(clearCart());
                    navigation.navigate('OrdersHistory');
                  },
                },
                {
                  text: t('ok'),
                  onPress: () => {
                    dispatch(clearCart());
                    navigation.navigate('ProductCatalog');
                  },
                },
              ]);
            } catch (error) {
              logger.error('[CartScreen] Order error');
              Alert.alert(t('error'), extractErrorMessage(error, t('orderCreationError')));
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const handleBackToCatalog = useCallback(() => {
    navigation.navigate('ProductCatalog');
  }, [navigation]);

  const renderCartItem = useCallback(({ item }: { item: CartItem }) => {
    const { product, quantity } = item;
    const lineTotal = parseFloat(product.price_per_package) * quantity;

    return (
      <View className="bg-white rounded-xl p-4 mb-3">
        <View className="w-14 h-14 bg-cream rounded-lg items-center justify-center mb-3">
          <Ionicons name="cube-outline" size={32} color={MAVECAM_COLORS.GREEN_PRIMARY} />
        </View>

        <View className="mb-3">
          <Text className="text-xs text-gray-light font-semibold mb-1">{product.brand.toUpperCase()}</Text>
          <Text className="text-base font-bold text-gray-dark mb-1" numberOfLines={2}>
            {product.name}
          </Text>
          <Text className="text-xs text-gray-light mb-1">
            {product.pellet_size_mm}mm - {product.package_weight_kg}kg
            {product.protein_percentage && ` - ${product.protein_percentage}% ${t('protein')}`}
          </Text>
          <Text className="text-sm text-mavecam-primary font-semibold">
            {parseFloat(product.price_per_package).toLocaleString()} FCFA / {t('bag')}
          </Text>
        </View>

        <TouchableOpacity
          className="absolute top-4 right-4"
          onPress={() => handleRemoveItem(product.id, product.name)}
        >
          <Ionicons name="trash-outline" size={20} color={MAVECAM_COLORS.ERROR} />
        </TouchableOpacity>

        <View className="flex-row items-center justify-between mb-3">
          <TouchableOpacity
            className="p-1"
            onPress={() => handleUpdateQuantity(product.id, Math.max(1, quantity - 1))}
            disabled={quantity <= 1}
          >
            <Ionicons
              name="remove-circle-outline"
              size={28}
              color={quantity <= 1 ? MAVECAM_COLORS.GRAY_LIGHT : MAVECAM_COLORS.GREEN_PRIMARY}
            />
          </TouchableOpacity>

          <Text className="text-lg font-bold text-gray-dark min-w-[40px] text-center">{quantity}</Text>

          <TouchableOpacity
            className="p-1"
            onPress={() => handleUpdateQuantity(product.id, quantity + 1)}
          >
            <Ionicons name="add-circle-outline" size={28} color={MAVECAM_COLORS.GREEN_PRIMARY} />
          </TouchableOpacity>
        </View>

        <Text className="text-lg font-bold text-mavecam-primary text-right">{lineTotal.toLocaleString()} FCFA</Text>
      </View>
    );
  }, [handleRemoveItem, handleUpdateQuantity, t]);

  const renderListHeader = useCallback(
    () => (
      <View className="px-4 py-4">
        <Text className="text-lg font-bold text-gray-dark mb-3">{t('myProducts')}</Text>
      </View>
    ),
    [t]
  );

  const renderListFooter = useCallback(
    () => (
      <>
        <View className="bg-white px-4 py-4 mb-3">
          <Text className="text-lg font-bold text-gray-dark mb-3">{t('deliveryMethod')}</Text>

          {DELIVERY_METHODS.map((method) => (
            <TouchableOpacity
              key={method.value}
              className={`flex-row items-center p-4 rounded-lg border-2 mb-3 gap-3 ${
                delivery_method === method.value ? 'border-mavecam-primary bg-cream' : 'border-gray-light'
              }`}
              onPress={() => handleDeliveryMethodChange(method.value)}
            >
              <Ionicons
                name={method.value === 'home' ? 'home-outline' : 'storefront-outline'}
                size={24}
                color={
                  delivery_method === method.value
                    ? MAVECAM_COLORS.GREEN_PRIMARY
                    : MAVECAM_COLORS.GRAY_LIGHT
                }
              />
              <Text
                className={`flex-1 text-base ${
                  delivery_method === method.value
                    ? 'text-mavecam-primary font-semibold'
                    : 'text-gray-dark'
                }`}
              >
                {t(method.labelKey)}
              </Text>
              {delivery_method === method.value && (
                <Ionicons name="checkmark-circle" size={24} color={MAVECAM_COLORS.GREEN_PRIMARY} />
              )}
            </TouchableOpacity>
          ))}

          {delivery_method === 'pickup' && (
            <View className="mt-2">
              <SelectField
                label={t('selectPickupPoint')}
                value={pickup_location}
                onChange={(value) => handlePickupLocationChange(value as PickupLocation)}
                options={PICKUP_LOCATIONS.map((loc) => ({ label: loc.label, value: loc.value }))}
                placeholder={t('selectOption')}
                required
              />
            </View>
          )}
        </View>

        {previewLoading ? (
          <View className="flex-row items-center justify-center p-5 gap-3">
            <ActivityIndicator size="small" color={MAVECAM_COLORS.GREEN_PRIMARY} />
            <Text className="text-sm text-gray-light">{t('calculatingFees')}</Text>
          </View>
        ) : deliveryPreview ? (
          <View className="bg-white px-4 py-4 mb-3">
            <Text className="text-lg font-bold text-gray-dark mb-3">{t('orderSummary')}</Text>

            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-base text-gray-dark">{t('subtotal')}</Text>
              <Text className="text-base font-semibold text-gray-dark">
                {parseFloat(deliveryPreview.subtotal).toLocaleString()} FCFA
              </Text>
            </View>

            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-base text-gray-dark">{t('deliveryFee')}</Text>
              {parseFloat(deliveryPreview.delivery_fee) === 0 ? (
                <Text className="text-base font-semibold text-mavecam-primary">{t('free')}</Text>
              ) : (
                <Text className="text-base font-semibold text-gray-dark">
                  {parseFloat(deliveryPreview.delivery_fee).toLocaleString()} FCFA
                </Text>
              )}
            </View>

            {deliveryPreview.free_delivery_threshold_reached && (
              <View className="flex-row items-center bg-cream p-3 rounded-lg gap-2 mb-3">
                <Ionicons name="checkmark-circle" size={20} color={MAVECAM_COLORS.SUCCESS} />
                <Text className="text-sm font-semibold text-mavecam-primary">
                  {t('freeDeliveryApplied')}
                </Text>
              </View>
            )}

            {user?.region?.trim().toLowerCase() === 'littoral' &&
              delivery_method === 'home' &&
              !deliveryPreview.free_delivery_threshold_reached &&
              deliveryPreview.total_bags < FREE_DELIVERY_THRESHOLD && (
                <View className="flex-row items-center bg-[#e0f2fe] p-3 rounded-lg gap-2 mb-3">
                  <Ionicons name="information-circle" size={20} color={MAVECAM_COLORS.INFO} />
                  <Text className="flex-1 text-sm text-mavecam-primary">
                    {t('freeDeliveryEncouragement', {
                      remaining: FREE_DELIVERY_THRESHOLD - deliveryPreview.total_bags,
                    })}
                  </Text>
                </View>
              )}

            <View className="h-px bg-gray-light my-3" />

            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-lg font-bold text-gray-dark">{t('total')}</Text>
              <Text className="text-xl font-bold text-mavecam-primary">
                {parseFloat(deliveryPreview.total).toLocaleString()} FCFA
              </Text>
            </View>

            <View className="flex-row items-center gap-2">
              <Ionicons name="cube-outline" size={16} color={MAVECAM_COLORS.GRAY_LIGHT} />
              <Text className="text-sm text-gray-light">
                {deliveryPreview.total_bags} {t(deliveryPreview.total_bags > 1 ? 'bags' : 'bag')}
              </Text>
            </View>
          </View>
        ) : null}
      </>
    ),
    [
      deliveryPreview,
      delivery_method,
      pickup_location,
      previewLoading,
      t,
      user?.region,
    ]
  );

  if (cartItems.length === 0) {
    return (
      <View className="flex-1 bg-cream">
        <View className="flex-1 justify-center items-center px-10">
          <Ionicons name="cart-outline" size={100} color={MAVECAM_COLORS.GRAY_LIGHT} />
          <Text className="mt-5 text-2xl font-bold text-gray-dark">{t('emptyCart')}</Text>
          <Text className="mt-3 text-base text-gray-light text-center">{t('emptyCartDescription')}</Text>
          <TouchableOpacity
            className="mt-6 bg-mavecam-primary flex-row items-center px-6 py-3 rounded-lg gap-2"
            onPress={handleBackToCatalog}
          >
            <Ionicons name="albums-outline" size={20} color={MAVECAM_COLORS.WHITE} />
            <Text className="text-white text-base font-semibold">{t('browseCatalog')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-cream">
      <View className="bg-white px-5 pt-16 pb-5 flex-row items-center justify-between shadow">
        <TouchableOpacity onPress={() => navigation.goBack()} className="w-10">
          <Ionicons name="arrow-back" size={24} color={MAVECAM_COLORS.GRAY_DARK} />
        </TouchableOpacity>
        <View className="flex-1 items-center">
          <Text className="text-2xl font-bold text-gray-dark">{t('cart')}</Text>
          <Text className="text-sm text-gray-light mt-1">
            {cartItems.length} {t(cartItems.length > 1 ? 'products' : 'product')}
          </Text>
        </View>
        <TouchableOpacity onPress={handleClearCart}>
          <Ionicons name="trash-outline" size={24} color={MAVECAM_COLORS.ERROR} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={cartItems}
        keyExtractor={(item) => item.product.id}
        renderItem={renderCartItem}
        ListHeaderComponent={renderListHeader}
        ListFooterComponent={renderListFooter}
        contentContainerStyle={{ paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      />

      <View className="bg-white p-4 shadow">
        <TouchableOpacity
          className={`flex-row items-center justify-center py-4 rounded-lg gap-3 ${
            isSubmitting || !deliveryPreview ? 'bg-mavecam-primary/60' : 'bg-mavecam-primary'
          }`}
          onPress={handleConfirmOrder}
          disabled={isSubmitting || !deliveryPreview}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={MAVECAM_COLORS.WHITE} />
          ) : (
            <Ionicons name="checkmark-circle-outline" size={24} color={MAVECAM_COLORS.WHITE} />
          )}
          <Text className="text-white text-lg font-bold">{t('confirmOrder')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
