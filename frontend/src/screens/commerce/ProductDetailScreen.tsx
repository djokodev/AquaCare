/**
 * ProductDetailScreen - Détails Produit MAVECAM
 *
 * Écran de détails d'un produit alimentaire avec :
 * - Informations produit vérifiées (taille, prix, conditionnement)
 * - Composition nutritionnelle (si disponible - Aller Aqua uniquement)
 * - Image placeholder
 * - Sélection quantité
 * - Ajout au panier
 * - Recommandations produits similaires
 *
 * Note: Seules les données du catalogue PDF MAVECAM sont affichées
 * Les produits DIBAQ n'affichent pas de données nutritionnelles (non-vérifiées)
 *
 * @screen commerce/ProductDetailScreen
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
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';

import { AppDispatch, RootState } from '@/store/store';
import { fetchProductDetail, addToCart } from '@/store/slices/commerceSlice';
import { Product } from '@/types/commerce';
import { MAVECAM_COLORS } from '@/constants/colors';

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

  // Redux state
  const { products, cart } = useSelector((state: RootState) => state.commerce);
  const { items: allProducts } = products;

  // Local state
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch product details
  useEffect(() => {
    const loadProduct = async () => {
      setIsLoading(true);
      try {
        // Check if product already in Redux store
        const existingProduct = allProducts.find((p) => p.id === productId);
        if (existingProduct) {
          setProduct(existingProduct);
        } else {
          // Fetch from API
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
  }, [productId]);

  // Add to cart
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

  // Increment quantity
  const handleIncrement = () => {
    setQuantity((prev) => prev + 1);
  };

  // Decrement quantity
  const handleDecrement = () => {
    if (quantity > 1) {
      setQuantity((prev) => prev - 1);
    }
  };

  // Get similar products (same species, different phase/size)
  const getSimilarProducts = () => {
    if (!product) return [];
    return allProducts
      .filter(
        (p) => p.species === product.species && p.id !== product.id && p.is_available
      )
      .slice(0, 3);
  };

  if (isLoading || !product) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={MAVECAM_COLORS.GRAY_DARK} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('productDetails')}</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={MAVECAM_COLORS.GREEN_PRIMARY} />
          <Text style={styles.loadingText}>{t('loading')}</Text>
        </View>
      </View>
    );
  }

  const similarProducts = getSimilarProducts();
  const pricePerPackage = parseFloat(product.price_per_package);
  const pricePerKg = parseFloat(product.price_per_kg);
  const totalPrice = pricePerPackage * quantity;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={MAVECAM_COLORS.GRAY_DARK} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('productDetails')}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Cart' as never)}>
          <Ionicons name="cart-outline" size={24} color={MAVECAM_COLORS.GREEN_PRIMARY} />
          {cart.items.length > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>
                {cart.items.reduce((sum, item) => sum + item.quantity, 0)}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Product Image */}
        <View style={styles.imageContainer}>
          <View style={styles.imagePlaceholder}>
            <Ionicons name="cube" size={80} color={MAVECAM_COLORS.GREEN_PRIMARY} />
          </View>
        </View>

        {/* Product Info */}
        <View style={styles.infoSection}>
          <Text style={styles.brandText}>{product.brand.toUpperCase()}</Text>
          <Text style={styles.productName}>{product.name}</Text>

          {/* Specs */}
          <View style={styles.specsContainer}>
            <View style={styles.specChip}>
              <Ionicons name="fish" size={16} color={MAVECAM_COLORS.GREEN_PRIMARY} />
              <Text style={styles.specChipText}>{t(product.species)}</Text>
            </View>
            <View style={styles.specChip}>
              <Ionicons name="resize" size={16} color={MAVECAM_COLORS.GREEN_PRIMARY} />
              <Text style={styles.specChipText}>{product.pellet_size_mm}mm</Text>
            </View>
            {product.phase && (
              <View style={styles.specChip}>
                <Ionicons name="water" size={16} color={MAVECAM_COLORS.GREEN_PRIMARY} />
                <Text style={styles.specChipText}>{t(product.phase)}</Text>
              </View>
            )}
          </View>

          {/* Price */}
          <View style={styles.priceSection}>
            <View>
              <Text style={styles.priceLabel}>{t('pricePerBag')}</Text>
              <Text style={styles.priceValue}>{pricePerPackage.toLocaleString()} FCFA</Text>
              <Text style={styles.priceSecondary}>
                {pricePerKg.toLocaleString()} FCFA/kg • {product.package_weight_kg}kg
              </Text>
            </View>
          </View>
        </View>

        {/* Nutritional Specs - Affiché seulement si données vérifiées */}
        {product.protein_percentage && product.lipid_percentage && (
          <View style={styles.nutritionSection}>
            <Text style={styles.sectionTitle}>{t('nutritionalComposition')}</Text>
            <View style={styles.nutritionGrid}>
              <View style={styles.nutritionItem}>
                <Ionicons name="nutrition" size={24} color={MAVECAM_COLORS.GREEN_PRIMARY} />
                <Text style={styles.nutritionValue}>{product.protein_percentage}%</Text>
                <Text style={styles.nutritionLabel}>{t('protein')}</Text>
              </View>
              <View style={styles.nutritionItem}>
                <Ionicons name="water" size={24} color={MAVECAM_COLORS.GREEN_PRIMARY} />
                <Text style={styles.nutritionValue}>{product.lipid_percentage}%</Text>
                <Text style={styles.nutritionLabel}>{t('lipids')}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Quantity Selector */}
        <View style={styles.quantitySection}>
          <Text style={styles.sectionTitle}>{t('quantity')}</Text>
          <View style={styles.quantityControls}>
            <TouchableOpacity
              style={[styles.quantityButton, quantity === 1 && styles.quantityButtonDisabled]}
              onPress={handleDecrement}
              disabled={quantity === 1}
            >
              <Ionicons
                name="remove"
                size={24}
                color={quantity === 1 ? MAVECAM_COLORS.GRAY_LIGHT : MAVECAM_COLORS.WHITE}
              />
            </TouchableOpacity>
            <View style={styles.quantityDisplay}>
              <Text style={styles.quantityText}>{quantity}</Text>
              <Text style={styles.quantityUnit}>{t(quantity > 1 ? 'bags' : 'bag')}</Text>
            </View>
            <TouchableOpacity style={styles.quantityButton} onPress={handleIncrement}>
              <Ionicons name="add" size={24} color={MAVECAM_COLORS.WHITE} />
            </TouchableOpacity>
          </View>
          <Text style={styles.totalPriceLabel}>{t('total')}</Text>
          <Text style={styles.totalPriceValue}>{totalPrice.toLocaleString()} FCFA</Text>
        </View>

        {/* Similar Products */}
        {similarProducts.length > 0 && (
          <View style={styles.similarSection}>
            <Text style={styles.sectionTitle}>{t('similarProducts')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {similarProducts.map((similarProduct) => (
                <TouchableOpacity
                  key={similarProduct.id}
                  style={styles.similarCard}
                  onPress={() =>
                    navigation.setParams({ productId: similarProduct.id } as never)
                  }
                >
                  <View style={styles.similarImagePlaceholder}>
                    <Ionicons name="cube-outline" size={32} color={MAVECAM_COLORS.GREEN_PRIMARY} />
                  </View>
                  <Text style={styles.similarBrand}>{similarProduct.brand.toUpperCase()}</Text>
                  <Text style={styles.similarName} numberOfLines={2}>
                    {similarProduct.name}
                  </Text>
                  <Text style={styles.similarPrice}>
                    {parseFloat(similarProduct.price_per_package).toLocaleString()} FCFA
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* Add to Cart Button */}
      {product.is_available && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.addToCartButton} onPress={handleAddToCart}>
            <Ionicons name="cart" size={24} color={MAVECAM_COLORS.WHITE} />
            <Text style={styles.addToCartText}>{t('addToCart')}</Text>
          </TouchableOpacity>
        </View>
      )}
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
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  cartBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: MAVECAM_COLORS.ERROR,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  cartBadgeText: {
    color: MAVECAM_COLORS.WHITE,
    fontSize: 12,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: MAVECAM_COLORS.GRAY_LIGHT,
  },
  scrollView: {
    flex: 1,
  },
  imageContainer: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    alignItems: 'center',
    paddingVertical: 40,
    position: 'relative',
  },
  imagePlaceholder: {
    width: 200,
    height: 200,
    backgroundColor: MAVECAM_COLORS.CREAM,
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoSection: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    padding: 20,
    marginTop: 8,
  },
  brandText: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    fontWeight: '600',
    marginBottom: 4,
  },
  productName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 16,
  },
  specsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  specChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MAVECAM_COLORS.CREAM,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  specChipText: {
    fontSize: 13,
    color: MAVECAM_COLORS.GRAY_DARK,
    fontWeight: '600',
  },
  priceSection: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  priceLabel: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginBottom: 4,
  },
  priceValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    marginBottom: 4,
  },
  priceSecondary: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
  },
  nutritionSection: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    padding: 20,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 16,
  },
  nutritionGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  nutritionItem: {
    flex: 1,
    backgroundColor: MAVECAM_COLORS.CREAM,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  nutritionValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    marginTop: 8,
  },
  nutritionLabel: {
    fontSize: 13,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginTop: 4,
  },
  quantitySection: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    padding: 20,
    marginTop: 8,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 20,
  },
  quantityButton: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonDisabled: {
    backgroundColor: MAVECAM_COLORS.CREAM,
  },
  quantityDisplay: {
    alignItems: 'center',
    minWidth: 80,
  },
  quantityText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  quantityUnit: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginTop: 4,
  },
  totalPriceLabel: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    textAlign: 'center',
    marginBottom: 4,
  },
  totalPriceValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    textAlign: 'center',
  },
  similarSection: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    padding: 20,
    marginTop: 8,
    marginBottom: 100,
  },
  similarCard: {
    width: 140,
    backgroundColor: MAVECAM_COLORS.CREAM,
    borderRadius: 12,
    padding: 12,
    marginRight: 12,
  },
  similarImagePlaceholder: {
    width: '100%',
    height: 100,
    backgroundColor: MAVECAM_COLORS.WHITE,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  similarBrand: {
    fontSize: 10,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    fontWeight: '600',
    marginBottom: 4,
  },
  similarName: {
    fontSize: 13,
    color: MAVECAM_COLORS.GRAY_DARK,
    fontWeight: '600',
    marginBottom: 8,
    minHeight: 36,
  },
  similarPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: MAVECAM_COLORS.WHITE,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  addToCartButton: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 8,
    gap: 12,
  },
  addToCartText: {
    color: MAVECAM_COLORS.WHITE,
    fontSize: 18,
    fontWeight: 'bold',
  },
});
