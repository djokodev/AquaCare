import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useDispatch, useSelector } from 'react-redux';

import { AppDispatch, RootState } from '@/store/store';
import { fetchProductDetail, addToCart } from '@/features/commerce/store/commerceSlice';
import { Product } from '@/types/commerce';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { getProductBrandAsset } from '@/features/commerce/utils/productBrandAssets';
import { AppHeader, AppText, Badge, Button, Card, Divider, ErrorState, IconButton, LoadingState, TextField } from '@/components/ui';
import { colors, radii, sizing, spacing } from '@/theme';
import { getProductDisplayName } from '@/features/commerce/utils/productPresentation';

type RouteParams = { ProductDetail: { productId: string; cycleId?: string; source?: 'store' } };
type NavigationProp = StackNavigationProp<RootStackParamList, 'ProductDetail'>;

export default function ProductDetailScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProp<RouteParams, 'ProductDetail'>>();
  const dispatch = useDispatch<AppDispatch>();
  const { productId } = route.params;
  const cartNavigationParams = route.params.cycleId ? { cycleId: route.params.cycleId, source: 'store' as const } : undefined;
  const { products, cart } = useSelector((state: RootState) => state.commerce);
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [quantityInput, setQuantityInput] = useState('1');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadProduct = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const existingProduct = products.items.find((item) => item.id === productId);
      setProduct(existingProduct ?? await dispatch(fetchProductDetail(productId)).unwrap());
    } catch {
      setLoadError(t('productLoadError'));
      Alert.alert(t('error'), t('productLoadError'));
    } finally {
      setIsLoading(false);
    }
  }, [dispatch, productId, products.items, t]);

  useEffect(() => { void loadProduct(); }, [loadProduct]);

  const cartItemsCount = useMemo(() => cart.items.reduce((sum, item) => sum + item.quantity, 0), [cart.items]);
  const displayName = product ? getProductDisplayName(product.name, t('catfish')) : '';
  const updateQuantity = (nextQuantity: number) => {
    const validQuantity = Math.max(1, nextQuantity);
    setQuantity(validQuantity);
    setQuantityInput(String(validQuantity));
  };
  const handleQuantityInput = (value: string) => {
    const numericValue = value.replace(/\D/gu, '');
    setQuantityInput(numericValue);
    if (numericValue) updateQuantity(Number.parseInt(numericValue, 10));
  };
  const handleAddToCart = () => {
    if (!product) return;
    dispatch(addToCart({ product, quantity }));
    Alert.alert(t('success'), t('productAddedToCartWithQuantity', { quantity, name: product.name }), [{ text: t('viewCart'), onPress: () => navigation.navigate('Cart', cartNavigationParams) }, { text: t('continueShopping') }]);
  };

  return (
    <View style={styles.root}>
      <AppHeader title={t('productDetails')} onBack={() => navigation.goBack()} backLabel={t('back')} rightAction={<IconButton icon="cart-outline" variant="ghost" tone="inverse" accessibilityLabel={`${t('cart')} ${cartItemsCount}`} badge={cartItemsCount} onPress={() => navigation.navigate('Cart', cartNavigationParams)} />} />
      {isLoading ? <LoadingState message={t('loading')} /> : null}
      {!isLoading && loadError ? <ErrorState message={loadError} actionLabel={t('retry')} onAction={loadProduct} /> : null}
      {!isLoading && product ? (
        <>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <Card style={styles.hero}>
              <View style={styles.imageWrap}><Image source={getProductBrandAsset(product.brand)} style={styles.image} resizeMode="contain" /></View>
              <AppText variant="caption" color="muted">{product.brand.toUpperCase()}</AppText>
              <AppText variant="screenTitle">{displayName}</AppText>
              <View style={styles.badges}>
                <Badge label={`${product.pellet_size_mm} mm`} tone="info" />
                {product.phase ? <Badge label={t(product.phase)} tone="success" /> : null}
              </View>
              <Divider />
              <AppText variant="caption" color="muted">{t('pricePerBag')}</AppText>
              <AppText variant="metric" color="link">{Number(product.price_per_package).toLocaleString()} FCFA</AppText>
              <AppText variant="helper" color="muted">{Number(product.price_per_kg).toLocaleString()} FCFA/kg · {product.package_weight_kg} kg</AppText>
            </Card>
            {product.protein_percentage !== null || product.lipid_percentage !== null ? <Card variant="outlined" style={styles.section}><AppText variant="sectionTitle">{t('nutritionalComposition')}</AppText><View style={styles.nutrients}>{product.protein_percentage !== null ? <Nutrient label={t('protein')} value={`${product.protein_percentage}%`} icon="nutrition" /> : null}{product.lipid_percentage !== null ? <Nutrient label={t('lipids')} value={`${product.lipid_percentage}%`} icon="water" /> : null}</View></Card> : null}
            <Card variant="outlined" style={styles.section}>
              <AppText variant="sectionTitle">{t('quantity')}</AppText>
              <View style={styles.stepper}><IconButton icon="remove" variant="surface" accessibilityLabel={t('decreaseQuantity')} onPress={() => updateQuantity(quantity - 1)} disabled={quantity === 1} /><View style={styles.quantity}><TextField value={quantityInput} onChangeText={handleQuantityInput} onBlur={() => { if (!quantityInput) setQuantityInput(String(quantity)); }} keyboardType="number-pad" accessibilityLabel={t('quantity')} style={styles.quantityInput} /><AppText variant="caption" color="muted">{t(quantity > 1 ? 'bags' : 'bag')}</AppText></View><IconButton icon="add" variant="surface" accessibilityLabel={t('increaseQuantity')} onPress={() => updateQuantity(quantity + 1)} /></View>
              <Divider /><AppText variant="caption" color="muted">{t('total')}</AppText><AppText variant="metric" color="link">{(Number(product.price_per_package) * quantity).toLocaleString()} FCFA</AppText>
            </Card>
          </ScrollView>
          {product.is_available ? <View style={styles.cta}><Button label={t('addToCart')} iconLeft="cart" size="large" onPress={handleAddToCart} /></View> : null}
        </>
      ) : null}
    </View>
  );
}

function Nutrient({ label, value, icon }: { label: string; value: string; icon: keyof typeof Ionicons.glyphMap }) {
  return <View style={styles.nutrient}><Ionicons name={icon} size={sizing.iconMedium} color={colors.brand.primary} /><AppText variant="metric" color="link">{value}</AppText><AppText variant="caption" color="muted">{label}</AppText></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.page }, content: { padding: spacing[4], gap: spacing[4], paddingBottom: 112 }, hero: { alignItems: 'center', gap: spacing[2] }, imageWrap: { width: 176, height: 176, borderRadius: radii.full, backgroundColor: colors.surface.page, alignItems: 'center', justifyContent: 'center' }, image: { width: 112, height: 112 }, badges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing[2] }, section: { gap: spacing[3] }, nutrients: { flexDirection: 'row', gap: spacing[3] }, nutrient: { flex: 1, alignItems: 'center', gap: spacing[1], padding: spacing[3], backgroundColor: colors.surface.page, borderRadius: radii.lg }, stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[4] }, quantity: { width: 88, alignItems: 'center', gap: spacing[1] }, quantityInput: { textAlign: 'center' }, cta: { padding: spacing[4], borderTopWidth: 1, borderTopColor: colors.border.subtle, backgroundColor: colors.surface.card },
});
