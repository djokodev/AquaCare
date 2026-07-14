import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Image, StyleSheet, View } from 'react-native';
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
import {
  DELIVERY_METHODS,
  FREE_DELIVERY_THRESHOLD,
  PICKUP_LOCATIONS,
} from '@/domain/commerce/constants';
import SelectField from '@/components/SelectField';
import logger from '@/utils/logger';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { RouteProp, useRoute } from '@react-navigation/native';
import { getProductBrandAsset } from '@/features/commerce/utils/productBrandAssets';
import { sanitizeUserFacingErrorMessage } from '@/utils/errorParser';
import {
  AppHeader,
  AppText,
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  IconButton,
  InlineAlert,
  LoadingState,
  SelectableCard,
} from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

type NavigationProp = StackNavigationProp<RootStackParamList, 'Cart'>;
type RoutePropType = RouteProp<RootStackParamList, 'Cart'>;

interface AxiosApiError {
  response?: { data?: { message?: string; error?: string; detail?: string } };
  message?: string;
}

const extractErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'string') {
    const sanitized = sanitizeUserFacingErrorMessage(error);
    return sanitized === 'UNKNOWN_ERROR' || sanitized.startsWith('AUTH_') ? fallback : sanitized;
  }
  const err = error as AxiosApiError;
  const data = err?.response?.data;
  const shouldUseFallback = (message: string): boolean =>
    message === 'UNKNOWN_ERROR' || message.startsWith('AUTH_');
  if (typeof data?.message === 'string') {
    const sanitized = sanitizeUserFacingErrorMessage(data.message);
    return shouldUseFallback(sanitized) ? fallback : sanitized;
  }
  if (typeof data?.error === 'string') {
    const sanitized = sanitizeUserFacingErrorMessage(data.error);
    return shouldUseFallback(sanitized) ? fallback : sanitized;
  }
  if (typeof data?.detail === 'string') {
    const sanitized = sanitizeUserFacingErrorMessage(data.detail);
    return shouldUseFallback(sanitized) ? fallback : sanitized;
  }
  if (typeof err?.message === 'string') {
    const sanitized = sanitizeUserFacingErrorMessage(err.message);
    return shouldUseFallback(sanitized) ? fallback : sanitized;
  }
  return fallback;
};

export default function CartScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RoutePropType>();
  const dispatch = useDispatch<AppDispatch>();
  const generateClientUuid = (): string => {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    // Fallback UUID v4 (RFC 4122) pour React Native / Expo Go
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  };

  const { cart } = useSelector((state: RootState) => state.commerce);
  const { user, farmProfile } = useSelector((state: RootState) => state.auth);
  const currentCycle = useSelector((state: RootState) => state.aquaculture.currentCycle);
  const routeCycleId = route.params?.cycleId;
  const storeNavigationParams = routeCycleId ? { cycleId: routeCycleId, source: 'store' as const } : undefined;
  const storeCycleId = routeCycleId || currentCycle?.id;
  const { items: cartItems, delivery_method, pickup_location, deliveryPreview, previewLoading } = cart;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = React.useRef(false);

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
            if (submittingRef.current) return;
            submittingRef.current = true;
            setIsSubmitting(true);
            try {
              const orderData = {
                items: cartItems.map((item) => ({ product_id: item.product.id, quantity: item.quantity })),
                delivery_method,
                pickup_location: delivery_method === 'pickup' ? pickup_location : undefined,
                ...(storeCycleId ? { production_cycle_id: storeCycleId } : {}),
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
                    navigation.navigate('OrdersHistory', storeNavigationParams);
                  },
                },
                {
                  text: t('ok'),
                  onPress: () => {
                    dispatch(clearCart());
                    navigation.navigate('ProductCatalog', storeNavigationParams);
                  },
                },
              ]);
            } catch (error) {
              const msg = extractErrorMessage(error, t('orderCreationError'));
              logger.warn('[CartScreen] Order error:', msg);
              Alert.alert(t('error'), msg);
            } finally {
              submittingRef.current = false;
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const handleBackToCatalog = useCallback(() => {
    navigation.navigate('ProductCatalog', storeNavigationParams);
  }, [navigation, storeNavigationParams]);

  const renderCartItem = useCallback(({ item }: { item: CartItem }) => {
    const { product, quantity } = item;
    const lineTotal = Number(product.price_per_package) * quantity;
    return (
      <Card variant="outlined" style={styles.itemCard}>
        <View style={styles.itemHeader}>
          <View style={styles.brandAsset}><Image source={getProductBrandAsset(product.brand)} style={styles.image} resizeMode="contain" /></View>
          <View style={styles.flex}>
            <AppText variant="caption" color="muted">{product.brand.toUpperCase()}</AppText>
            <AppText variant="bodyStrong" numberOfLines={2}>{product.name}</AppText>
            <AppText variant="caption" color="muted">
              {product.pellet_size_mm}mm · {product.package_weight_kg}kg
              {product.protein_percentage ? ` · ${product.protein_percentage}% ${t('protein')}` : ''}
            </AppText>
          </View>
          <IconButton icon="trash-outline" accessibilityLabel={`${t('remove')} ${product.name}`} variant="danger" onPress={() => handleRemoveItem(product.id, product.name)} />
        </View>
        <Divider />
        <View style={styles.itemFooter}>
          <View style={styles.quantityRow}>
            <IconButton icon="remove" accessibilityLabel={t('decreaseQuantity')} disabled={quantity <= 1} onPress={() => handleUpdateQuantity(product.id, quantity - 1)} />
            <AppText variant="bodyStrong" style={styles.quantity}>{quantity}</AppText>
            <IconButton icon="add" accessibilityLabel={t('increaseQuantity')} onPress={() => handleUpdateQuantity(product.id, quantity + 1)} />
          </View>
          <AppText variant="cardTitle" color="link">{lineTotal.toLocaleString()} FCFA</AppText>
        </View>
      </Card>
    );
  }, [handleRemoveItem, handleUpdateQuantity, t]);

  const renderListFooter = useCallback(() => (
    <View style={styles.footerContent}>
      <Card variant="outlined" style={styles.sectionCard}>
        <AppText variant="sectionTitle">{t('deliveryMethod')}</AppText>
        <View style={styles.optionList}>
          {DELIVERY_METHODS.map((method) => (
            <SelectableCard
              key={method.value}
              selected={delivery_method === method.value}
              primaryBorder
              layout="row"
              accessibilityLabel={t(method.labelKey)}
              onPress={() => handleDeliveryMethodChange(method.value)}
            >
              <AppText variant="bodyStrong" color={delivery_method === method.value ? 'link' : 'primary'}>{t(method.labelKey)}</AppText>
              {delivery_method === method.value ? <Badge label={t('selected')} tone="success" /> : null}
            </SelectableCard>
          ))}
        </View>
        {delivery_method === 'pickup' ? (
          <SelectField
            label={t('selectPickupPoint')}
            value={pickup_location}
            onChange={(value) => handlePickupLocationChange(value as PickupLocation)}
            options={PICKUP_LOCATIONS.map((location) => ({ label: location.label, value: location.value }))}
            placeholder={t('selectOption')}
            required
          />
        ) : null}
      </Card>

      {previewLoading ? <LoadingState compact message={t('calculatingFees')} /> : deliveryPreview ? (
        <Card variant="outlined" style={styles.sectionCard}>
          <AppText variant="sectionTitle">{t('orderSummary')}</AppText>
          <SummaryRow label={t('subtotal')} value={`${Number(deliveryPreview.subtotal).toLocaleString()} FCFA`} />
          <SummaryRow label={t('deliveryFee')} value={Number(deliveryPreview.delivery_fee) === 0 ? t('free') : `${Number(deliveryPreview.delivery_fee).toLocaleString()} FCFA`} />
          {deliveryPreview.free_delivery_threshold_reached ? <InlineAlert tone="success" message={t('freeDeliveryApplied')} /> : null}
          {user?.region?.trim().toLowerCase() === 'littoral' && delivery_method === 'home' && !deliveryPreview.free_delivery_threshold_reached && deliveryPreview.total_bags < FREE_DELIVERY_THRESHOLD ? (
            <InlineAlert tone="info" message={t('freeDeliveryEncouragement', { remaining: FREE_DELIVERY_THRESHOLD - deliveryPreview.total_bags })} />
          ) : null}
          <Divider />
          <SummaryRow label={t('total')} value={`${Number(deliveryPreview.total).toLocaleString()} FCFA`} prominent />
          <AppText variant="caption" color="muted">{deliveryPreview.total_bags} {t(deliveryPreview.total_bags > 1 ? 'bags' : 'bag')}</AppText>
        </Card>
      ) : null}
    </View>
  ), [deliveryPreview, delivery_method, pickup_location, previewLoading, t, user?.region]);

  return (
    <View style={styles.screen}>
      <AppHeader
        title={t('cart')}
        subtitle={cartItems.length > 0 ? `${cartItems.length} ${t(cartItems.length > 1 ? 'products' : 'product')}` : undefined}
        onBack={() => navigation.goBack()}
        backLabel={t('back')}
        rightAction={cartItems.length > 0 ? <IconButton icon="trash-outline" accessibilityLabel={t('clear')} variant="danger" onPress={handleClearCart} /> : undefined}
      />
      {cartItems.length === 0 ? (
        <EmptyState title={t('emptyCart')} message={t('emptyCartDescription')} actionLabel={t('browseCatalog')} onAction={handleBackToCatalog} />
      ) : (
        <>
          <FlatList
            data={cartItems}
            keyExtractor={(item) => item.product.id}
            renderItem={renderCartItem}
            ListHeaderComponent={<AppText variant="sectionTitle" style={styles.listTitle}>{t('myProducts')}</AppText>}
            ListFooterComponent={renderListFooter}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
          <View style={styles.stickyFooter}>
            <Button label={t('confirmOrder')} iconLeft="checkmark-circle-outline" loading={isSubmitting} disabled={!deliveryPreview} onPress={handleConfirmOrder} />
          </View>
        </>
      )}
    </View>
  );
}

function SummaryRow({ label, value, prominent = false }: { label: string; value: string; prominent?: boolean }) {
  return <View style={styles.summaryRow}><AppText variant={prominent ? 'bodyStrong' : 'body'}>{label}</AppText><AppText variant={prominent ? 'cardTitle' : 'bodyStrong'} color={prominent ? 'link' : 'primary'}>{value}</AppText></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  flex: { flex: 1 },
  list: { padding: spacing[4], paddingBottom: spacing[6] },
  listTitle: { marginBottom: spacing[3] },
  itemCard: { marginBottom: spacing[3] },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginBottom: spacing[3] },
  brandAsset: { width: 56, height: 56, borderRadius: radii.md, backgroundColor: colors.surface.selected, alignItems: 'center', justifyContent: 'center' },
  image: { width: 40, height: 40 },
  itemFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing[3] },
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  quantity: { minWidth: 28, textAlign: 'center' },
  footerContent: { gap: spacing[3], marginTop: spacing[3] },
  sectionCard: { gap: spacing[3] },
  optionList: { gap: spacing[2] },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[3] },
  stickyFooter: { padding: spacing[4], backgroundColor: colors.surface.card, borderTopWidth: 1, borderTopColor: colors.border.subtle },
});
