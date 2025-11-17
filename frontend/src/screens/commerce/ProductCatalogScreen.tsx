/**
 * ProductCatalogScreen - Catalogue Produits MAVECAM
 *
 * Affiche le catalogue complet des 22 produits alimentaires avec :
 * - Filtres (espèce, phase, marque, recherche)
 * - Liste produits (FlatList optimisée)
 * - Ajout rapide au panier
 * - Navigation vers détails produit
 * - Badge compteur panier
 *
 * @screen commerce/ProductCatalogScreen
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
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

  // Redux state
  const { products, cart } = useSelector((state: RootState) => state.commerce);
  const { items: productsList, loading, error, filters } = products;
  const cartItemsCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  // Local state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpecies, setSelectedSpecies] = useState<string | undefined>();
  const [selectedBrand, setSelectedBrand] = useState<string | undefined>();
  const [refreshing, setRefreshing] = useState(false);

  // Fetch produits au mount
  useEffect(() => {
    dispatch(fetchProducts(filters));
  }, []);

  // Appliquer filtres automatiquement quand espèce/marque/recherche changent
  useEffect(() => {
    const newFilters: any = {};
    if (selectedSpecies) newFilters.species = selectedSpecies;
    if (selectedBrand) newFilters.brand = selectedBrand;
    if (searchQuery.trim()) newFilters.search = searchQuery.trim();

    dispatch(applyFilters(newFilters));
    dispatch(fetchProducts(newFilters));
  }, [selectedSpecies, selectedBrand]);

  // Appliquer filtres
  const handleApplyFilters = () => {
    const newFilters: any = {};
    if (selectedSpecies) newFilters.species = selectedSpecies;
    if (selectedBrand) newFilters.brand = selectedBrand;
    if (searchQuery.trim()) newFilters.search = searchQuery.trim();

    dispatch(applyFilters(newFilters));
    dispatch(fetchProducts(newFilters));
  };

  // Reset filtres
  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedSpecies(undefined);
    setSelectedBrand(undefined);
    dispatch(applyFilters({}));
    dispatch(fetchProducts(undefined));
  };

  // Pull-to-refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    await dispatch(fetchProducts(filters));
    setRefreshing(false);
  };

  // Ajout rapide au panier
  const handleQuickAddToCart = (product: Product) => {
    dispatch(addToCart({ product, quantity: 1 }));
    Alert.alert(t('success'), t('productAddedToCart'), [{ text: t('ok') }]);
  };

  // Navigation vers détails
  const handleProductPress = (product: Product) => {
    navigation.navigate('ProductDetail', { productId: product.id });
  };

  // Navigation vers panier
  const handleCartPress = () => {
    navigation.navigate('Cart');
  };

  // Render product card
  const renderProductCard = ({ item }: { item: Product }) => (
    <TouchableOpacity
      style={styles.productCard}
      onPress={() => handleProductPress(item)}
      activeOpacity={0.7}
    >
      {/* Image placeholder */}
      <View style={styles.productImagePlaceholder}>
        <Ionicons name="cube-outline" size={40} color={MAVECAM_COLORS.GREEN_PRIMARY} />
      </View>

      {/* Infos produit */}
      <View style={styles.productInfo}>
        <Text style={styles.productBrand}>{item.brand.toUpperCase()}</Text>
        <Text style={styles.productName} numberOfLines={2}>
          {item.name}
        </Text>

        {/* Specs */}
        <View style={styles.specsRow}>
          <Text style={styles.specText}>
            {item.pellet_size_mm}mm
            {item.protein_percentage && ` • ${item.protein_percentage}% ${t('protein')}`}
          </Text>
        </View>

        {/* Prix */}
        <View style={styles.priceRow}>
          <View>
            <Text style={styles.priceLabel}>{item.package_weight_kg}kg</Text>
            <Text style={styles.price}>{parseFloat(item.price_per_package).toLocaleString()} FCFA</Text>
          </View>

          {/* Bouton ajout rapide */}
          <TouchableOpacity
            style={styles.quickAddButton}
            onPress={() => handleQuickAddToCart(item)}
          >
            <Ionicons name="cart-outline" size={20} color={MAVECAM_COLORS.WHITE} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  // Empty state
  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="cube-outline" size={80} color={MAVECAM_COLORS.GRAY_LIGHT} />
      <Text style={styles.emptyTitle}>{t('noProductsFound')}</Text>
      <Text style={styles.emptyDescription}>{t('tryDifferentFilters')}</Text>
      <TouchableOpacity style={styles.resetButton} onPress={handleResetFilters}>
        <Text style={styles.resetButtonText}>{t('resetFilters')}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header avec compteur panier */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{t('productCatalog')}</Text>
          <Text style={styles.headerSubtitle}>
            {productsList.length} {t('products')}
          </Text>
        </View>

        <TouchableOpacity style={styles.cartButton} onPress={handleCartPress}>
          <Ionicons name="cart-outline" size={28} color={MAVECAM_COLORS.GREEN_PRIMARY} />
          {cartItemsCount > 0 && (
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{cartItemsCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Filtres */}
      <View style={styles.filtersContainer}>
        {/* Recherche */}
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={20} color={MAVECAM_COLORS.GRAY_LIGHT} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('searchProducts')}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleApplyFilters}
          />
        </View>

        {/* Filtres rapides */}
        <View style={styles.quickFilters}>
          {/* Espèce */}
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>{t('species')}</Text>
            <View style={styles.filterButtons}>
              {PRODUCT_SPECIES.map((species) => (
                <TouchableOpacity
                  key={species.value}
                  style={[
                    styles.filterChip,
                    selectedSpecies === species.value && styles.filterChipActive,
                  ]}
                  onPress={() =>
                    setSelectedSpecies(selectedSpecies === species.value ? undefined : species.value)
                  }
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedSpecies === species.value && styles.filterChipTextActive,
                    ]}
                  >
                    {t(species.labelKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Marque */}
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>{t('brand')}</Text>
            <View style={styles.filterButtons}>
              {PRODUCT_BRANDS.map((brand) => (
                <TouchableOpacity
                  key={brand.value}
                  style={[
                    styles.filterChip,
                    selectedBrand === brand.value && styles.filterChipActive,
                  ]}
                  onPress={() =>
                    setSelectedBrand(selectedBrand === brand.value ? undefined : brand.value)
                  }
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedBrand === brand.value && styles.filterChipTextActive,
                    ]}
                  >
                    {brand.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Boutons actions */}
          <View style={styles.filterActions}>
            <TouchableOpacity style={styles.applyButton} onPress={handleApplyFilters}>
              <Text style={styles.applyButtonText}>{t('applyFilters')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.clearButton} onPress={handleResetFilters}>
              <Text style={styles.clearButtonText}>{t('clear')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Liste produits */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={MAVECAM_COLORS.GREEN_PRIMARY} />
          <Text style={styles.loadingText}>{t('loading')}</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={MAVECAM_COLORS.ERROR} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => dispatch(fetchProducts(filters))}>
            <Text style={styles.retryButtonText}>{t('retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={productsList}
          renderItem={renderProductCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
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
  cartButton: {
    position: 'relative',
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
  filtersContainer: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    padding: 16,
    marginBottom: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MAVECAM_COLORS.CREAM,
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingLeft: 8,
    fontSize: 16,
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  quickFilters: {
    gap: 12,
  },
  filterGroup: {
    gap: 8,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  filterButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: MAVECAM_COLORS.CREAM,
    borderWidth: 1,
    borderColor: MAVECAM_COLORS.GRAY_LIGHT,
  },
  filterChipActive: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    borderColor: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  filterChipText: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  filterChipTextActive: {
    color: MAVECAM_COLORS.WHITE,
    fontWeight: '600',
  },
  filterActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  applyButton: {
    flex: 1,
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  applyButtonText: {
    color: MAVECAM_COLORS.WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
  clearButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: MAVECAM_COLORS.GRAY_LIGHT,
  },
  clearButtonText: {
    color: MAVECAM_COLORS.GRAY_DARK,
    fontSize: 16,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  productCard: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  productImagePlaceholder: {
    width: 80,
    height: 80,
    backgroundColor: MAVECAM_COLORS.CREAM,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  productInfo: {
    flex: 1,
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
    marginBottom: 8,
  },
  specsRow: {
    marginBottom: 8,
  },
  specText: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
  },
  price: {
    fontSize: 18,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  quickAddButton: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeAvailable: {
    backgroundColor: MAVECAM_COLORS.SUCCESS,
  },
  badgeUnavailable: {
    backgroundColor: MAVECAM_COLORS.ERROR,
  },
  badgeText: {
    color: MAVECAM_COLORS.WHITE,
    fontSize: 10,
    fontWeight: '600',
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    marginTop: 12,
    fontSize: 16,
    color: MAVECAM_COLORS.ERROR,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: MAVECAM_COLORS.WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
  emptyState: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyTitle: {
    marginTop: 20,
    fontSize: 20,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  emptyDescription: {
    marginTop: 8,
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    textAlign: 'center',
  },
  resetButton: {
    marginTop: 24,
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  resetButtonText: {
    color: MAVECAM_COLORS.WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
});
