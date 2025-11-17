/**
 * FeedingSuggestionsScreen - Suggestions Alimentation Intelligentes MAVECAM
 *
 * Feature phare : Recommandations automatiques basées sur cycles actifs
 * - Analyse historique logs 30 derniers jours
 * - Projection besoins multi-granulométrie
 * - Détection automatique changements taille aliment
 * - Buffer sécurité +7 jours
 * - Ajout rapide au panier
 * - Score confiance qualité données
 *
 * @screen commerce/FeedingSuggestionsScreen
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';

import { AppDispatch, RootState } from '@/store/store';
import { fetchFeedingSuggestions, addToCart } from '@/store/slices/commerceSlice';
import { CycleSuggestion, FeedingPhase, SuggestedProduct } from '@/types/commerce';
import { MAVECAM_COLORS } from '@/constants/colors';

export default function FeedingSuggestionsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const dispatch = useDispatch<AppDispatch>();

  // Redux state
  const { suggestions, cart, products } = useSelector((state: RootState) => state.commerce);
  const { data: suggestionsData, loading, error } = suggestions;
  const { user, farmProfile } = useSelector((state: RootState) => state.auth);

  // Local state
  const [refreshing, setRefreshing] = useState(false);
  const [expandedCycleId, setExpandedCycleId] = useState<string | null>(null);
  const [expandedPhaseIndex, setExpandedPhaseIndex] = useState<{ [key: string]: number | null }>(
    {}
  );

  // Fetch suggestions au mount
  useEffect(() => {
    if (farmProfile) {
      dispatch(fetchFeedingSuggestions(farmProfile.id));
    }
  }, [farmProfile]);

  // Pull-to-refresh
  const handleRefresh = async () => {
    if (!farmProfile) return;
    setRefreshing(true);
    await dispatch(fetchFeedingSuggestions(farmProfile.id));
    setRefreshing(false);
  };

  // Toggle cycle expansion
  const toggleCycleExpansion = (cycleId: string) => {
    setExpandedCycleId(expandedCycleId === cycleId ? null : cycleId);
  };

  // Toggle phase expansion
  const togglePhaseExpansion = (cycleId: string, phaseIndex: number) => {
    setExpandedPhaseIndex({
      ...expandedPhaseIndex,
      [cycleId]: expandedPhaseIndex[cycleId] === phaseIndex ? null : phaseIndex,
    });
  };

  // Ajout produit au panier
  const handleAddToCart = (productId: string, quantity: number) => {
    const product = products.items.find((p) => p.id === productId);
    if (!product) {
      Alert.alert(t('error'), t('productNotFound'));
      return;
    }

    dispatch(addToCart({ product, quantity }));
    Alert.alert(t('success'), t('productAddedToCart', { quantity }), [{ text: t('ok') }]);
  };

  // Ajout tous produits cycle au panier
  const handleAddCycleToCart = (cycle: CycleSuggestion) => {
    let totalProducts = 0;
    cycle.phases.forEach((phase) => {
      phase.products.forEach((suggestedProduct) => {
        const product = products.items.find((p) => p.id === suggestedProduct.product_id);
        if (product) {
          dispatch(addToCart({ product, quantity: suggestedProduct.quantity_bags }));
          totalProducts += suggestedProduct.quantity_bags;
        }
      });
    });

    Alert.alert(
      t('success'),
      t('cycleProductsAddedToCart', { count: totalProducts, cycleName: cycle.cycle_name }),
      [
        {
          text: t('viewCart'),
          onPress: () => navigation.navigate('Cart' as never),
        },
        { text: t('ok') },
      ]
    );
  };

  // Render confidence score
  const renderConfidenceScore = () => {
    if (!suggestionsData?.analysis) return null;

    const { confidence_score, cycles_with_data, total_cycles } = suggestionsData.analysis;
    const scoreColor =
      confidence_score >= 80
        ? MAVECAM_COLORS.SUCCESS
        : confidence_score >= 60
        ? MAVECAM_COLORS.WARNING
        : MAVECAM_COLORS.ERROR;

    return (
      <View style={styles.confidenceCard}>
        <View style={styles.confidenceHeader}>
          <Ionicons name="analytics-outline" size={24} color={scoreColor} />
          <Text style={styles.confidenceTitle}>{t('dataQuality')}</Text>
        </View>
        <View style={styles.confidenceContent}>
          <View style={styles.confidenceScoreContainer}>
            <Text style={[styles.confidenceScoreValue, { color: scoreColor }]}>
              {confidence_score}%
            </Text>
            <Text style={styles.confidenceScoreLabel}>{t('confidenceScore')}</Text>
          </View>
          <View style={styles.confidenceDetails}>
            <Text style={styles.confidenceDetailText}>
              {t('cyclesAnalyzed')}: {cycles_with_data}/{total_cycles}
            </Text>
            <Text style={styles.confidenceDetailText}>
              {t('analysisPeriod')}: {suggestionsData.analysis.analysis_period_days} {t('days')}
            </Text>
            <Text style={styles.confidenceDetailText}>
              {t('safetyBuffer')}: +{suggestionsData.analysis.safety_buffer_days} {t('days')}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  // Render suggested product
  const renderSuggestedProduct = (
    suggestedProduct: SuggestedProduct,
    cycleId: string,
    phaseIndex: number
  ) => {
    const totalPrice = suggestedProduct.total_price;

    return (
      <View key={suggestedProduct.product_id} style={styles.suggestedProduct}>
        <View style={styles.suggestedProductLeft}>
          <Text style={styles.suggestedProductBrand}>
            {suggestedProduct.brand.toUpperCase()}
          </Text>
          <Text style={styles.suggestedProductName} numberOfLines={2}>
            {suggestedProduct.product_name}
          </Text>
          <Text style={styles.suggestedProductQuantity}>
            {suggestedProduct.quantity_bags} {t('bags')} • {suggestedProduct.total_kg}kg
          </Text>
        </View>
        <View style={styles.suggestedProductRight}>
          <Text style={styles.suggestedProductPrice}>{totalPrice.toLocaleString()} FCFA</Text>
          <TouchableOpacity
            style={styles.addToCartButton}
            onPress={() =>
              handleAddToCart(suggestedProduct.product_id, suggestedProduct.quantity_bags)
            }
          >
            <Ionicons name="cart-outline" size={16} color={MAVECAM_COLORS.WHITE} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Render feeding phase
  const renderFeedingPhase = (phase: FeedingPhase, cycleId: string, index: number) => {
    const isExpanded = expandedPhaseIndex[cycleId] === index;

    return (
      <View key={index} style={styles.phaseCard}>
        <TouchableOpacity
          style={styles.phaseHeader}
          onPress={() => togglePhaseExpansion(cycleId, index)}
          activeOpacity={0.7}
        >
          <View style={styles.phaseHeaderLeft}>
            <View style={styles.phaseIconContainer}>
              <Ionicons name="fast-food-outline" size={20} color={MAVECAM_COLORS.GREEN_PRIMARY} />
            </View>
            <View>
              <Text style={styles.phaseName}>{phase.phase_name}</Text>
              <Text style={styles.phaseSpecs}>
                {phase.pellet_size_mm}mm • {phase.weight_range_g[0]}-{phase.weight_range_g[1]}g
              </Text>
            </View>
          </View>
          <View style={styles.phaseHeaderRight}>
            <Text style={styles.phaseTotalPrice}>{phase.total_price.toLocaleString()} FCFA</Text>
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={MAVECAM_COLORS.GRAY_LIGHT}
            />
          </View>
        </TouchableOpacity>

        <View style={styles.phaseQuickInfo}>
          <View style={styles.phaseInfoItem}>
            <Ionicons name="calendar-outline" size={14} color={MAVECAM_COLORS.GRAY_LIGHT} />
            <Text style={styles.phaseInfoText}>
              {phase.days_coverage} {t('days')}
            </Text>
          </View>
          <View style={styles.phaseInfoItem}>
            <Ionicons name="scale-outline" size={14} color={MAVECAM_COLORS.GRAY_LIGHT} />
            <Text style={styles.phaseInfoText}>{phase.estimated_need_kg}kg</Text>
          </View>
          <View style={styles.phaseInfoItem}>
            <Ionicons name="cube-outline" size={14} color={MAVECAM_COLORS.GRAY_LIGHT} />
            <Text style={styles.phaseInfoText}>
              {phase.products.reduce((sum, p) => sum + p.quantity_bags, 0)} {t('bags')}
            </Text>
          </View>
        </View>

        {isExpanded && (
          <View style={styles.phaseProducts}>
            <Text style={styles.productsTitle}>{t('recommendedProducts')}</Text>
            {phase.products.map((product) => renderSuggestedProduct(product, cycleId, index))}
          </View>
        )}
      </View>
    );
  };

  // Render cycle suggestion
  const renderCycleSuggestion = ({ item: cycle }: { item: CycleSuggestion }) => {
    const isExpanded = expandedCycleId === cycle.cycle_id;

    return (
      <View style={styles.cycleCard}>
        <TouchableOpacity
          style={styles.cycleHeader}
          onPress={() => toggleCycleExpansion(cycle.cycle_id)}
          activeOpacity={0.7}
        >
          <View style={styles.cycleHeaderLeft}>
            <Ionicons name="water-outline" size={28} color={MAVECAM_COLORS.GREEN_PRIMARY} />
            <View style={styles.cycleInfo}>
              <Text style={styles.cycleName}>{cycle.cycle_name}</Text>
              <Text style={styles.cycleSpecies}>{t(cycle.species)}</Text>
              <Text style={styles.cycleDetails}>
                {t('currentPhase')}: {cycle.current_phase} • {cycle.current_avg_weight_g}g •{' '}
                {cycle.days_remaining} {t('daysRemaining')}
              </Text>
            </View>
          </View>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={24}
            color={MAVECAM_COLORS.GRAY_LIGHT}
          />
        </TouchableOpacity>

        {/* Summary */}
        <View style={styles.cycleSummary}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>{t('totalNeeded')}</Text>
            <Text style={styles.summaryValue}>{cycle.summary.total_needed_kg}kg</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>{t('totalBags')}</Text>
            <Text style={styles.summaryValue}>{cycle.summary.total_bags}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>{t('totalCost')}</Text>
            <Text style={styles.summaryValuePrice}>
              {cycle.summary.total_price.toLocaleString()} FCFA
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>{t('coverage')}</Text>
            <Text style={styles.summaryValue}>
              {cycle.summary.coverage_days} {t('days')}
            </Text>
          </View>
        </View>

        {/* Add all to cart button */}
        <TouchableOpacity
          style={styles.addCycleToCartButton}
          onPress={() => handleAddCycleToCart(cycle)}
        >
          <Ionicons name="cart" size={20} color={MAVECAM_COLORS.WHITE} />
          <Text style={styles.addCycleToCartText}>{t('addAllToCart')}</Text>
        </TouchableOpacity>

        {/* Phases détaillées */}
        {isExpanded && (
          <View style={styles.phasesContainer}>
            <Text style={styles.phasesTitle}>{t('feedingPhases')}</Text>
            {cycle.phases.map((phase, index) => renderFeedingPhase(phase, cycle.cycle_id, index))}
          </View>
        )}
      </View>
    );
  };

  // Empty state
  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="bulb-outline" size={100} color={MAVECAM_COLORS.GRAY_LIGHT} />
      <Text style={styles.emptyTitle}>{t('noSuggestionsYet')}</Text>
      <Text style={styles.emptyDescription}>{t('noSuggestionsDescription')}</Text>
      <TouchableOpacity
        style={styles.createCycleButton}
        onPress={() => navigation.navigate('NewCycle' as never)}
      >
        <Ionicons name="add-circle-outline" size={20} color={MAVECAM_COLORS.WHITE} />
        <Text style={styles.createCycleButtonText}>{t('startNewCycle')}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={MAVECAM_COLORS.GRAY_DARK} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t('feedingSuggestions')}</Text>
          <Text style={styles.headerSubtitle}>{t('intelligentRecommendations')}</Text>
        </View>
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

      {/* Content */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={MAVECAM_COLORS.GREEN_PRIMARY} />
          <Text style={styles.loadingText}>{t('analyzingCycles')}</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={MAVECAM_COLORS.ERROR} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => farmProfile && dispatch(fetchFeedingSuggestions(farmProfile.id))}
          >
            <Text style={styles.retryButtonText}>{t('retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[MAVECAM_COLORS.GREEN_PRIMARY]}
              tintColor={MAVECAM_COLORS.GREEN_PRIMARY}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {suggestionsData?.has_suggestions ? (
            <View style={styles.content}>
              {/* Info banner */}
              <View style={styles.infoBanner}>
                <Ionicons name="information-circle" size={24} color={MAVECAM_COLORS.INFO} />
                <Text style={styles.infoBannerText}>{t('suggestionsInfoBanner')}</Text>
              </View>

              {/* Confidence score */}
              {renderConfidenceScore()}

              {/* Cycle suggestions */}
              {suggestionsData.suggestions.map((cycle) => (
                <View key={cycle.cycle_id}>{renderCycleSuggestion({ item: cycle })}</View>
              ))}
            </View>
          ) : (
            renderEmptyState()
          )}
        </ScrollView>
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
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  headerSubtitle: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginTop: 2,
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
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
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
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: '#dbeafe',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 12,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    color: MAVECAM_COLORS.INFO,
    lineHeight: 18,
  },
  confidenceCard: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  confidenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  confidenceTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  confidenceContent: {
    flexDirection: 'row',
    gap: 16,
  },
  confidenceScoreContainer: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  confidenceScoreValue: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  confidenceScoreLabel: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginTop: 4,
  },
  confidenceDetails: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  confidenceDetailText: {
    fontSize: 13,
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  cycleCard: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cycleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cycleHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  cycleInfo: {
    flex: 1,
  },
  cycleName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  cycleSpecies: {
    fontSize: 14,
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    marginTop: 2,
  },
  cycleDetails: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginTop: 4,
  },
  cycleSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: MAVECAM_COLORS.CREAM,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    gap: 12,
  },
  summaryItem: {
    flex: 1,
    minWidth: '45%',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  summaryValuePrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  addCycleToCartButton: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  addCycleToCartText: {
    color: MAVECAM_COLORS.WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
  phasesContainer: {
    marginTop: 16,
  },
  phasesTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 12,
  },
  phaseCard: {
    backgroundColor: MAVECAM_COLORS.CREAM,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  phaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  phaseHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  phaseIconContainer: {
    width: 40,
    height: 40,
    backgroundColor: MAVECAM_COLORS.WHITE,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  phaseName: {
    fontSize: 14,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  phaseSpecs: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginTop: 2,
  },
  phaseHeaderRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  phaseTotalPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  phaseQuickInfo: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 16,
  },
  phaseInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  phaseInfoText: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
  },
  phaseProducts: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  productsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 8,
  },
  suggestedProduct: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: MAVECAM_COLORS.WHITE,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  suggestedProductLeft: {
    flex: 1,
    marginRight: 12,
  },
  suggestedProductBrand: {
    fontSize: 10,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    fontWeight: '600',
    marginBottom: 2,
  },
  suggestedProductName: {
    fontSize: 13,
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 4,
  },
  suggestedProductQuantity: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
  },
  suggestedProductRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  suggestedProductPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    marginBottom: 8,
  },
  addToCartButton: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
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
  createCycleButton: {
    marginTop: 24,
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  createCycleButtonText: {
    color: MAVECAM_COLORS.WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
});
