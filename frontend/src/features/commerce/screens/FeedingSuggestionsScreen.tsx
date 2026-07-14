import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  FlatList,
  RefreshControl,
  Alert,
  Pressable,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useDispatch, useSelector } from 'react-redux';

import { AppDispatch, RootState } from '@/store/store';
import { fetchFeedingSuggestions, addToCart } from '@/features/commerce/store/commerceSlice';
import { CycleSuggestion, FeedingPhase, SuggestedProduct } from '@/types/commerce';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { AppHeader, AppText, Button, Card, EmptyState, ErrorState, IconButton, InlineAlert, LoadingState } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { getProductDisplayName } from '@/features/commerce/utils/productPresentation';

type NavigationProp = StackNavigationProp<RootStackParamList>;

export default function FeedingSuggestionsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const dispatch = useDispatch<AppDispatch>();

  const { suggestions, cart, products } = useSelector((state: RootState) => state.commerce);
  const { data: suggestionsData, loading, error } = suggestions;
  const { farmProfile } = useSelector((state: RootState) => state.auth);
  const currentCycle = useSelector((state: RootState) => state.aquaculture.currentCycle);

  const [refreshing, setRefreshing] = useState(false);
  const [expandedCycleId, setExpandedCycleId] = useState<string | null>(null);
  const [expandedPhaseIndex, setExpandedPhaseIndex] = useState<{ [key: string]: number | null }>({});
  const cartItemsCount = useMemo(
    () => cart.items.reduce((sum, item) => sum + item.quantity, 0),
    [cart.items]
  );
  const suggestionCycles = useMemo(
    () => (suggestionsData?.has_suggestions ? suggestionsData.suggestions : []),
    [suggestionsData]
  );

  useEffect(() => {
    if (farmProfile?.id && currentCycle?.id) {
      dispatch(
        fetchFeedingSuggestions({
          farmProfileId: farmProfile.id,
          cycleId: currentCycle.id,
        })
      );
    }
  }, [farmProfile?.id, currentCycle?.id, dispatch]);

  const handleRefresh = useCallback(async () => {
    if (!farmProfile?.id || !currentCycle?.id) return;
    setRefreshing(true);
    await dispatch(
      fetchFeedingSuggestions({
        farmProfileId: farmProfile.id,
        cycleId: currentCycle.id,
      })
    );
    setRefreshing(false);
  }, [currentCycle?.id, dispatch, farmProfile?.id]);

  const toggleCycleExpansion = useCallback((cycleId: string) => {
    setExpandedCycleId((currentCycleId) => (currentCycleId === cycleId ? null : cycleId));
  }, []);

  const togglePhaseExpansion = useCallback((cycleId: string, phaseIndex: number) => {
    setExpandedPhaseIndex((currentState) => ({
      ...currentState,
      [cycleId]: currentState[cycleId] === phaseIndex ? null : phaseIndex,
    }));
  }, []);

  const handleAddToCart = useCallback((productId: string, quantity: number) => {
    const product = products.items.find((p) => p.id === productId);
    if (!product) {
      Alert.alert(t('error'), t('productNotFound'));
      return;
    }

    dispatch(addToCart({ product, quantity }));
    Alert.alert(t('success'), t('productAddedToCart', { quantity }), [{ text: t('ok') }]);
  }, [dispatch, products.items, t]);

  const handleAddCycleToCart = useCallback((cycle: CycleSuggestion) => {
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
        { text: t('viewCart'), onPress: () => navigation.navigate('Cart') },
        { text: t('ok') },
      ]
    );
  }, [dispatch, navigation, products.items, t]);

  const renderConfidenceScore = useCallback(() => {
    if (!suggestionsData?.analysis) return null;

    const { confidence_score, cycles_with_data, total_cycles } = suggestionsData.analysis;
    const scoreColor =
      confidence_score >= 80
        ? colors.status.success
        : confidence_score >= 60
        ? colors.status.warning
        : colors.status.error;

    return (
      <Card variant="outlined" style={styles.sectionCard}>
        <View className="flex-row items-center mb-3 gap-2">
          <Ionicons name="analytics-outline" size={24} color={scoreColor} />
          <AppText className="text-base font-bold text-gray-dark">{t('dataQuality')}</AppText>
        </View>
        <View className="flex-row gap-4">
          <View className="items-center px-4">
            <AppText className="text-2xl font-bold" style={{ color: scoreColor }}>
              {confidence_score}%
            </AppText>
            <AppText className="text-xs text-gray-light mt-1">{t('confidenceScore')}</AppText>
          </View>
          <View className="flex-1 justify-center gap-1">
            <AppText className="text-sm text-gray-dark">
              {t('cyclesAnalyzed')}: {cycles_with_data}/{total_cycles}
            </AppText>
            <AppText className="text-sm text-gray-dark">
              {t('analysisPeriod')}: {suggestionsData.analysis.analysis_period_days} {t('days')}
            </AppText>
            <AppText className="text-sm text-gray-dark">
              {t('safetyBuffer')}: +{suggestionsData.analysis.safety_buffer_days} {t('days')}
            </AppText>
          </View>
        </View>
      </Card>
    );
  }, [suggestionsData?.analysis, t]);

  const renderSuggestedProduct = useCallback((suggestedProduct: SuggestedProduct) => {
    const totalPrice = suggestedProduct.total_price;

    return (
      <Card key={suggestedProduct.product_id} style={styles.productCard}>
        <View className="flex-1 mr-3">
          <AppText className="text-xs text-gray-light font-semibold mb-1">{suggestedProduct.brand.toUpperCase()}</AppText>
          <AppText className="text-sm text-gray-dark mb-1" numberOfLines={2}>
            {getProductDisplayName(suggestedProduct.product_name, t('catfish'))}
          </AppText>
          <AppText className="text-xs text-gray-light">
            {suggestedProduct.quantity_bags} {t('bags')} - {suggestedProduct.total_kg}kg
          </AppText>
        </View>
        <View className="items-end justify-between">
          <AppText className="text-sm font-semibold text-aquacare-primary">
            {totalPrice.toLocaleString()} FCFA
          </AppText>
          <IconButton
            icon="cart-outline"
            accessibilityLabel={`${t('addToCart')} ${getProductDisplayName(suggestedProduct.product_name, t('catfish'))}`}
            onPress={() => handleAddToCart(suggestedProduct.product_id, suggestedProduct.quantity_bags)}
          />
        </View>
      </Card>
    );
  }, [handleAddToCart, t]);

  const renderFeedingPhase = useCallback((phase: FeedingPhase, cycleId: string, index: number) => {
    const isExpanded = expandedPhaseIndex[cycleId] === index;
    const totalBags = phase.products.reduce((sum, p) => sum + p.quantity_bags, 0);

    return (
      <View key={index} className="bg-cream rounded-lg p-3 mb-3">
        <Pressable
          className="flex-row justify-between items-center"
          onPress={() => togglePhaseExpansion(cycleId, index)}
        >
          <View className="flex-row items-center flex-1 gap-3">
            <View className="w-10 h-10 bg-white rounded-full items-center justify-center">
              <Ionicons name="fast-food-outline" size={20} color={colors.brand.primary} />
            </View>
            <View>
              <AppText className="text-sm font-semibold text-gray-dark">{phase.phase_name}</AppText>
              <AppText className="text-xs text-gray-light">
                {phase.pellet_size_mm}mm - {phase.weight_range_g[0]}-{phase.weight_range_g[1]}g
              </AppText>
            </View>
          </View>
          <View className="items-end gap-1">
            <AppText className="text-sm font-semibold text-aquacare-primary">
              {phase.total_price.toLocaleString()} FCFA
            </AppText>
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={colors.text.muted}
            />
          </View>
        </Pressable>

        <View className="flex-row mt-3 gap-4">
          <View className="flex-row items-center gap-1">
            <Ionicons name="calendar-outline" size={14} color={colors.text.muted} />
            <AppText className="text-xs text-gray-light">{phase.days_coverage} {t('days')}</AppText>
          </View>
          <View className="flex-row items-center gap-1">
            <Ionicons name="scale-outline" size={14} color={colors.text.muted} />
            <AppText className="text-xs text-gray-light">{phase.estimated_need_kg}kg</AppText>
          </View>
          <View className="flex-row items-center gap-1">
            <Ionicons name="cube-outline" size={14} color={colors.text.muted} />
            <AppText className="text-xs text-gray-light">{totalBags} {t('bags')}</AppText>
          </View>
        </View>

        {isExpanded && (
          <View style={styles.expandedSection}>
            <AppText className="text-xs font-semibold text-gray-dark mb-2">{t('recommendedProducts')}</AppText>
            {phase.products.map((product) => renderSuggestedProduct(product))}
          </View>
        )}
      </View>
    );
  }, [expandedPhaseIndex, renderSuggestedProduct, t, togglePhaseExpansion]);

  const renderCycleSuggestion = useCallback(({ item: cycle }: { item: CycleSuggestion }) => {
    const isExpanded = expandedCycleId === cycle.cycle_id;

    return (
      <Card variant="outlined" style={styles.cycleCard}>
        <Pressable
          className="flex-row items-center justify-between"
          onPress={() => toggleCycleExpansion(cycle.cycle_id)}
        >
          <View className="flex-row items-center flex-1 gap-3">
            <Ionicons name="water-outline" size={28} color={colors.brand.primary} />
            <View className="flex-1">
              <AppText className="text-base font-bold text-gray-dark">{cycle.cycle_name}</AppText>
              <AppText className="text-sm text-aquacare-primary">{t(cycle.species)}</AppText>
              <AppText className="text-xs text-gray-light mt-1">
                {t('currentPhase')}: {cycle.current_phase} - {cycle.current_avg_weight_g}g - {cycle.days_remaining} {t('daysRemaining')}
              </AppText>
            </View>
          </View>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={24}
            color={colors.text.muted}
          />
        </Pressable>

        <View className="flex-row flex-wrap bg-cream rounded-lg p-3 mt-3 gap-3">
          <View className="flex-1 min-w-[45%] items-center">
            <AppText className="text-xs text-gray-light">{t('totalNeeded')}</AppText>
            <AppText className="text-sm font-bold text-gray-dark">{cycle.summary.total_needed_kg}kg</AppText>
          </View>
          <View className="flex-1 min-w-[45%] items-center">
            <AppText className="text-xs text-gray-light">{t('totalBags')}</AppText>
            <AppText className="text-sm font-bold text-gray-dark">{cycle.summary.total_bags}</AppText>
          </View>
          <View className="flex-1 min-w-[45%] items-center">
            <AppText className="text-xs text-gray-light">{t('totalCost')}</AppText>
            <AppText className="text-sm font-bold text-aquacare-primary">
              {cycle.summary.total_price.toLocaleString()} FCFA
            </AppText>
          </View>
          <View className="flex-1 min-w-[45%] items-center">
            <AppText className="text-xs text-gray-light">{t('coverage')}</AppText>
            <AppText className="text-sm font-bold text-gray-dark">{cycle.summary.coverage_days} {t('days')}</AppText>
          </View>
        </View>

        <Button label={t('addAllToCart')} iconLeft="cart" onPress={() => handleAddCycleToCart(cycle)} style={styles.buttonSpacing} />

        {isExpanded && (
          <View className="mt-4">
            <AppText className="text-sm font-bold text-gray-dark mb-3">{t('feedingPhases')}</AppText>
            {cycle.phases.map((phase, index) => renderFeedingPhase(phase, cycle.cycle_id, index))}
          </View>
        )}
      </Card>
    );
  }, [expandedCycleId, handleAddCycleToCart, renderFeedingPhase, t, toggleCycleExpansion]);

  const renderListHeader = useCallback(
    () =>
      suggestionCycles.length > 0 ? (
        <>
          <InlineAlert tone="info" message={t('suggestionsInfoBanner')} />

          {renderConfidenceScore()}
        </>
      ) : null,
    [renderConfidenceScore, suggestionCycles.length, t]
  );

  const renderEmptyState = useCallback(
    () => (
      <EmptyState title={t('noSuggestionsYet')} message={t('noSuggestionsDescription')} actionLabel={t('startNewCycle')} onAction={() => navigation.navigate('CreateFarm')} />
    ),
    [navigation, t]
  );

  return (
    <View style={styles.screen}>
      <AppHeader title={t('feedingSuggestions')} subtitle={t('intelligentRecommendations')} onBack={() => navigation.goBack()} backLabel={t('back')} rightAction={<IconButton icon="cart-outline" accessibilityLabel={`${t('cart')} ${cartItemsCount}`} badge={cartItemsCount} onPress={() => navigation.navigate('Cart')} />} />

      {!currentCycle?.id ? (
        <EmptyState title={t('sessionCycleNotSelected')} message={t('sessionCyclePickerDescription')} actionLabel={t('sessionCycleConfirm')} onAction={() => navigation.navigate('CycleSessionEntry', { showBackToDashboard: true })} />
      ) : loading && !refreshing ? (
        <LoadingState message={t('analyzingCycles')} />
      ) : error ? (
        <ErrorState title={error} actionLabel={t('retry')} onAction={() =>
              farmProfile?.id &&
              currentCycle?.id &&
              dispatch(
                fetchFeedingSuggestions({
                  farmProfileId: farmProfile.id,
                  cycleId: currentCycle.id,
                })
              )
            } />
      ) : (
        <FlatList
          data={suggestionCycles}
          keyExtractor={(item) => item.cycle_id}
          renderItem={renderCycleSuggestion}
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={renderEmptyState}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[colors.brand.primary]}
              tintColor={colors.brand.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  content: { padding: spacing[4], paddingBottom: spacing[6] },
  sectionCard: { marginBottom: spacing[4] },
  productCard: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing[2] },
  expandedSection: { marginTop: spacing[3], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.border.default },
  cycleCard: { marginBottom: spacing[4] },
  buttonSpacing: { marginTop: spacing[3] },
});
