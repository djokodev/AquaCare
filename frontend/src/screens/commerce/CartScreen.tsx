/**
 * CartScreen - Panier MAVECAM Commerce
 *
 * Écran de gestion du panier avec :
 * - Liste produits avec quantités ajustables
 * - Choix méthode livraison (domicile/retrait magasin)
 * - Preview frais livraison temps réel (API)
 * - Badge livraison gratuite (Douala >= 20 sacs)
 * - Validation commande offline-first
 * - États vide/erreur/loading gérés
 *
 * @screen commerce/CartScreen
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import { v4 as uuidv4 } from 'uuid';

import { AppDispatch, RootState } from '@/store/store';
import {
  updateCartQuantity,
  removeFromCart,
  clearCart,
  setDeliveryMethod,
  setPickupLocation,
  fetchDeliveryFeePreview,
  createOrder,
} from '@/store/slices/commerceSlice';
import { CartItem, DeliveryMethod, PickupLocation } from '@/types/commerce';
import { MAVECAM_COLORS } from '@/constants/colors';
import { DELIVERY_METHODS, PICKUP_LOCATIONS, FREE_DELIVERY_THRESHOLD } from '@/domain/commerce';
import CustomPicker from '@/components/common/CustomPicker';

export default function CartScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const dispatch = useDispatch<AppDispatch>();

  // Redux state
  const { cart } = useSelector((state: RootState) => state.commerce);
  const { user, farmProfile } = useSelector((state: RootState) => state.auth);
  const {
    items: cartItems,
    delivery_method,
    pickup_location,
    deliveryPreview,
    previewLoading,
  } = cart;

  // Local state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch delivery fee preview au mount et à chaque changement
  useEffect(() => {
    if (cartItems.length > 0) {
      handleFetchPreview();
    }
  }, [cartItems, delivery_method]);

  // Fetch preview frais livraison
  const handleFetchPreview = async () => {
    if (cartItems.length === 0) return;

    const items = cartItems.map((item) => ({
      product_id: item.product.id,
      quantity: item.quantity,
    }));

    await dispatch(
      fetchDeliveryFeePreview({
        items,
        delivery_method,
      })
    );
  };

  // Mise à jour quantité
  const handleUpdateQuantity = (productId: string, newQuantity: number) => {
    dispatch(updateCartQuantity({ productId, quantity: newQuantity }));
  };

  // Suppression produit
  const handleRemoveItem = (productId: string, productName: string) => {
    Alert.alert(t('confirmRemoval'), t('confirmRemovalMessage', { productName }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('remove'),
        style: 'destructive',
        onPress: () => dispatch(removeFromCart(productId)),
      },
    ]);
  };

  // Vider panier complet
  const handleClearCart = () => {
    Alert.alert(t('confirmClearCart'), t('confirmClearCartMessage'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('clear'),
        style: 'destructive',
        onPress: () => dispatch(clearCart()),
      },
    ]);
  };

  // Changement méthode livraison
  const handleDeliveryMethodChange = (method: DeliveryMethod) => {
    dispatch(setDeliveryMethod(method));
  };

  // Changement localisation retrait
  const handlePickupLocationChange = (location: PickupLocation) => {
    dispatch(setPickupLocation(location));
  };

  // Validation commande
  const handleConfirmOrder = async () => {
    // Validations
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

    // Confirmation utilisateur
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
                items: cartItems.map((item) => ({
                  product_id: item.product.id,
                  quantity: item.quantity,
                })),
                delivery_method,
                pickup_location: delivery_method === 'pickup' ? pickup_location : undefined,
                client_uuid: uuidv4(), // Généré pour offline-first
                created_offline: false, // TODO: détecter offline
              };

              await dispatch(createOrder(orderData)).unwrap();

              Alert.alert(t('success'), t('orderCreatedSuccess'), [
                {
                  text: t('viewOrder'),
                  onPress: () => navigation.navigate('OrdersHistory' as never),
                },
                { text: t('ok') },
              ]);
            } catch (error: any) {
              Alert.alert(t('error'), error || t('orderCreationError'));
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ]
    );
  };

  // Navigation retour catalogue
  const handleBackToCatalog = () => {
    navigation.navigate('ProductCatalog' as never);
  };

  // Render cart item
  const renderCartItem = (item: CartItem) => {
    const { product, quantity } = item;
    const lineTotal = parseFloat(product.price_per_package) * quantity;

    return (
      <View key={product.id} style={styles.cartItem}>
        {/* Image placeholder */}
        <View style={styles.productImagePlaceholder}>
          <Ionicons name="cube-outline" size={32} color={MAVECAM_COLORS.GREEN_PRIMARY} />
        </View>

        {/* Infos produit */}
        <View style={styles.productInfo}>
          <Text style={styles.productBrand}>{product.brand.toUpperCase()}</Text>
          <Text style={styles.productName} numberOfLines={2}>
            {product.name}
          </Text>
          <Text style={styles.productSpecs}>
            {product.pellet_size_mm}mm • {product.package_weight_kg}kg
            {product.protein_percentage && ` • ${product.protein_percentage}% ${t('protein')}`}
          </Text>
          <Text style={styles.productPrice}>
            {parseFloat(product.price_per_package).toLocaleString()} FCFA / {t('bag')}
          </Text>
        </View>

        {/* Bouton suppression */}
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => handleRemoveItem(product.id, product.name)}
        >
          <Ionicons name="trash-outline" size={20} color={MAVECAM_COLORS.ERROR} />
        </TouchableOpacity>

        {/* Contrôles quantité */}
        <View style={styles.quantityContainer}>
          <TouchableOpacity
            style={styles.quantityButton}
            onPress={() => handleUpdateQuantity(product.id, Math.max(1, quantity - 1))}
            disabled={quantity <= 1}
          >
            <Ionicons
              name="remove-circle-outline"
              size={28}
              color={quantity <= 1 ? MAVECAM_COLORS.GRAY_LIGHT : MAVECAM_COLORS.GREEN_PRIMARY}
            />
          </TouchableOpacity>

          <Text style={styles.quantityText}>{quantity}</Text>

          <TouchableOpacity
            style={styles.quantityButton}
            onPress={() => handleUpdateQuantity(product.id, quantity + 1)}
          >
            <Ionicons name="add-circle-outline" size={28} color={MAVECAM_COLORS.GREEN_PRIMARY} />
          </TouchableOpacity>
        </View>

        {/* Total ligne */}
        <Text style={styles.lineTotal}>{lineTotal.toLocaleString()} FCFA</Text>
      </View>
    );
  };

  // Empty state
  if (cartItems.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Ionicons name="cart-outline" size={100} color={MAVECAM_COLORS.GRAY_LIGHT} />
          <Text style={styles.emptyTitle}>{t('emptyCart')}</Text>
          <Text style={styles.emptyDescription}>{t('emptyCartDescription')}</Text>
          <TouchableOpacity style={styles.browseCatalogButton} onPress={handleBackToCatalog}>
            <Ionicons name="albums-outline" size={20} color={MAVECAM_COLORS.WHITE} />
            <Text style={styles.browseCatalogButtonText}>{t('browseCatalog')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={MAVECAM_COLORS.GRAY_DARK} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t('cart')}</Text>
          <Text style={styles.headerSubtitle}>
            {cartItems.length} {t(cartItems.length > 1 ? 'products' : 'product')}
          </Text>
        </View>
        <TouchableOpacity onPress={handleClearCart}>
          <Ionicons name="trash-outline" size={24} color={MAVECAM_COLORS.ERROR} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Liste produits */}
        <View style={styles.cartItemsContainer}>
          <Text style={styles.sectionTitle}>{t('myProducts')}</Text>
          {cartItems.map(renderCartItem)}
        </View>

        {/* Méthode livraison */}
        <View style={styles.deliverySection}>
          <Text style={styles.sectionTitle}>{t('deliveryMethod')}</Text>

          {DELIVERY_METHODS.map((method) => (
            <TouchableOpacity
              key={method.value}
              style={[
                styles.deliveryOption,
                delivery_method === method.value && styles.deliveryOptionActive,
              ]}
              onPress={() => handleDeliveryMethodChange(method.value)}
            >
              <Ionicons
                name={
                  method.value === 'home'
                    ? 'home-outline'
                    : 'storefront-outline'
                }
                size={24}
                color={
                  delivery_method === method.value
                    ? MAVECAM_COLORS.GREEN_PRIMARY
                    : MAVECAM_COLORS.GRAY_LIGHT
                }
              />
              <Text
                style={[
                  styles.deliveryOptionText,
                  delivery_method === method.value && styles.deliveryOptionTextActive,
                ]}
              >
                {t(method.labelKey)}
              </Text>
              {delivery_method === method.value && (
                <Ionicons name="checkmark-circle" size={24} color={MAVECAM_COLORS.GREEN_PRIMARY} />
              )}
            </TouchableOpacity>
          ))}

          {/* Sélection point retrait si pickup */}
          {delivery_method === 'pickup' && (
            <View style={styles.pickupLocationContainer}>
              <Text style={styles.pickupLocationLabel}>{t('selectPickupPoint')}</Text>
              <CustomPicker
                icon="location-outline"
                label={t('selectPickupPoint')}
                value={pickup_location || ''}
                options={PICKUP_LOCATIONS.map((loc) => ({
                  label: loc.label,
                  value: loc.value,
                }))}
                onValueChange={(value) => handlePickupLocationChange(value as PickupLocation)}
              />
            </View>
          )}
        </View>

        {/* Preview frais livraison */}
        {previewLoading ? (
          <View style={styles.previewLoadingContainer}>
            <ActivityIndicator size="small" color={MAVECAM_COLORS.GREEN_PRIMARY} />
            <Text style={styles.previewLoadingText}>{t('calculatingFees')}</Text>
          </View>
        ) : deliveryPreview ? (
          <View style={styles.summarySection}>
            <Text style={styles.sectionTitle}>{t('orderSummary')}</Text>

            {/* Sous-total */}
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t('subtotal')}</Text>
              <Text style={styles.summaryValue}>
                {parseFloat(deliveryPreview.subtotal).toLocaleString()} FCFA
              </Text>
            </View>

            {/* Frais livraison */}
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t('deliveryFee')}</Text>
              {parseFloat(deliveryPreview.delivery_fee) === 0 ? (
                <Text style={[styles.summaryValue, styles.freeDeliveryText]}>{t('free')}</Text>
              ) : (
                <Text style={styles.summaryValue}>
                  {parseFloat(deliveryPreview.delivery_fee).toLocaleString()} FCFA
                </Text>
              )}
            </View>

            {/* Badge livraison gratuite */}
            {deliveryPreview.free_delivery_threshold_reached && (
              <View style={styles.freeDeliveryBadge}>
                <Ionicons name="checkmark-circle" size={20} color={MAVECAM_COLORS.SUCCESS} />
                <Text style={styles.freeDeliveryBadgeText}>{t('freeDeliveryApplied')}</Text>
              </View>
            )}

            {/* Encouragement livraison gratuite (Douala uniquement) */}
            {user?.region === 'littoral' &&
              delivery_method === 'home' &&
              !deliveryPreview.free_delivery_threshold_reached &&
              deliveryPreview.total_bags < FREE_DELIVERY_THRESHOLD && (
                <View style={styles.encouragementBanner}>
                  <Ionicons name="information-circle" size={20} color={MAVECAM_COLORS.INFO} />
                  <Text style={styles.encouragementText}>
                    {t('freeDeliveryEncouragement', {
                      remaining: FREE_DELIVERY_THRESHOLD - deliveryPreview.total_bags,
                    })}
                  </Text>
                </View>
              )}

            {/* Total */}
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.totalLabel}>{t('total')}</Text>
              <Text style={styles.totalValue}>
                {parseFloat(deliveryPreview.total).toLocaleString()} FCFA
              </Text>
            </View>

            {/* Total sacs */}
            <View style={styles.bagsInfo}>
              <Ionicons name="cube-outline" size={16} color={MAVECAM_COLORS.GRAY_LIGHT} />
              <Text style={styles.bagsInfoText}>
                {deliveryPreview.total_bags} {t(deliveryPreview.total_bags > 1 ? 'bags' : 'bag')}
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Bouton validation */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.confirmButton, isSubmitting && styles.confirmButtonDisabled]}
          onPress={handleConfirmOrder}
          disabled={isSubmitting || !deliveryPreview}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={MAVECAM_COLORS.WHITE} />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={24} color={MAVECAM_COLORS.WHITE} />
              <Text style={styles.confirmButtonText}>{t('confirmOrder')}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MAVECAM_COLORS.CREAM,
  },
  header: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  backButton: {
    width: 40,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  headerSubtitle: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginTop: 4,
  },
  scrollView: {
    flex: 1,
  },
  cartItemsContainer: {
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 12,
  },
  cartItem: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  productImagePlaceholder: {
    width: 60,
    height: 60,
    backgroundColor: MAVECAM_COLORS.CREAM,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  productInfo: {
    marginBottom: 12,
  },
  productBrand: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    fontWeight: '600',
    marginBottom: 4,
  },
  productName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 4,
  },
  productSpecs: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginBottom: 4,
  },
  productPrice: {
    fontSize: 14,
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    fontWeight: '600',
  },
  removeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  quantityButton: {
    padding: 4,
  },
  quantityText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    minWidth: 40,
    textAlign: 'center',
  },
  lineTotal: {
    fontSize: 18,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    textAlign: 'right',
  },
  deliverySection: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    padding: 16,
    marginBottom: 12,
  },
  deliveryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: MAVECAM_COLORS.GRAY_LIGHT,
    marginBottom: 12,
    gap: 12,
  },
  deliveryOptionActive: {
    borderColor: MAVECAM_COLORS.GREEN_PRIMARY,
    backgroundColor: MAVECAM_COLORS.CREAM,
  },
  deliveryOptionText: {
    flex: 1,
    fontSize: 16,
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  deliveryOptionTextActive: {
    fontWeight: '600',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  pickupLocationContainer: {
    marginTop: 8,
  },
  pickupLocationLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 8,
  },
  previewLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 12,
  },
  previewLoadingText: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
  },
  summarySection: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    padding: 16,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 16,
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  freeDeliveryText: {
    color: MAVECAM_COLORS.SUCCESS,
  },
  freeDeliveryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MAVECAM_COLORS.CREAM,
    padding: 12,
    borderRadius: 8,
    gap: 8,
    marginBottom: 12,
  },
  freeDeliveryBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: MAVECAM_COLORS.SUCCESS,
  },
  encouragementBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0f2fe',
    padding: 12,
    borderRadius: 8,
    gap: 8,
    marginBottom: 12,
  },
  encouragementText: {
    flex: 1,
    fontSize: 13,
    color: MAVECAM_COLORS.INFO,
  },
  divider: {
    height: 1,
    backgroundColor: MAVECAM_COLORS.GRAY_LIGHT,
    marginVertical: 12,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  bagsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bagsInfoText: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
  },
  footer: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  confirmButton: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 8,
    gap: 8,
  },
  confirmButtonDisabled: {
    opacity: 0.6,
  },
  confirmButtonText: {
    color: MAVECAM_COLORS.WHITE,
    fontSize: 18,
    fontWeight: 'bold',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    marginTop: 20,
    fontSize: 24,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  emptyDescription: {
    marginTop: 12,
    fontSize: 16,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    textAlign: 'center',
  },
  browseCatalogButton: {
    marginTop: 24,
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  browseCatalogButtonText: {
    color: MAVECAM_COLORS.WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
});
