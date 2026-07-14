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
import { AppHeader, AppText, Badge, Button, Card, Divider, EmptyState, ErrorState, IconButton, InlineAlert, LoadingState } from '@/components/ui';
import { colors, opacity, sizing, spacing } from '@/theme';
import { getProductDisplayName } from '@/features/commerce/utils/productPresentation';
import MetricCard from '@/features/main/components/MetricCard';

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

  const getPhaseLabel = useCallback((phaseName: string) => {
    const directTranslation = t(phaseName);
    if (directTranslation !== phaseName) return directTranslation;
    const nestedKey = `phase.${phaseName}`;
    const nestedTranslation = t(nestedKey);
    return nestedTranslation !== nestedKey ? nestedTranslation : phaseName;
  }, [t]);

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
        <View style={styles.sectionHeading}>
          <Ionicons name="analytics-outline" size={24} color={scoreColor} />
          <AppText variant="cardTitle">{t('dataQuality')}</AppText>
        </View>
        <View style={styles.confidenceContent}>
          <View style={styles.confidenceScore}>
            <AppText variant="metric" style={{ color: scoreColor }}>
              {confidence_score}%
            </AppText>
            <AppText variant="caption" color="muted">{t('confidenceScore')}</AppText>
          </View>
          <View style={styles.analysisDetails}>
            <AppText variant="caption">
              {t('cyclesAnalyzed')}: {cycles_with_data}/{total_cycles}
            </AppText>
            <AppText variant="caption">
              {t('analysisPeriod')}: {suggestionsData.analysis.analysis_period_days} {t('days')}
            </AppText>
            <AppText variant="caption">
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
      <Card key={suggestedProduct.product_id} variant="outlined" style={styles.productCard}>
        <View style={styles.flex}>
          <AppText variant="caption" color="muted">{suggestedProduct.brand.toUpperCase()}</AppText>
          <AppText numberOfLines={2}>
            {getProductDisplayName(suggestedProduct.product_name, t('catfish'))}
          </AppText>
          <AppText variant="caption" color="muted">
            {suggestedProduct.quantity_bags} {t('bags')} · {suggestedProduct.total_kg} kg
          </AppText>
        </View>
        <View style={styles.productActions}>
          <AppText variant="label" color="link">
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
      <Card key={index} variant="outlined" style={styles.phaseCard}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${getPhaseLabel(phase.phase_name)}, ${t(isExpanded ? 'collapseActions' : 'details')}`}
          accessibilityState={{ expanded: isExpanded }}
          onPress={() => togglePhaseExpansion(cycleId, index)}
          style={({ pressed }) => [styles.expandableControl, pressed && styles.pressed]}
        >
          <View style={styles.expandableHeading}>
            <View style={styles.phaseIcon}>
              <Ionicons name="fast-food-outline" size={20} color={colors.brand.primary} />
            </View>
            <View style={styles.flex}>
              <AppText variant="label">{getPhaseLabel(phase.phase_name)}</AppText>
              <AppText variant="caption" color="muted">
                {phase.pellet_size_mm} mm · {phase.weight_range_g[0]}-{phase.weight_range_g[1]} g
              </AppText>
            </View>
          </View>
          <View style={styles.expandableTrailing}>
            <AppText variant="label" color="link">
              {phase.total_price.toLocaleString()} FCFA
            </AppText>
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={colors.text.muted}
            />
          </View>
        </Pressable>

        <View style={styles.phaseMeta}>
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={14} color={colors.text.muted} />
            <AppText variant="caption" color="muted">{phase.days_coverage} {t('days')}</AppText>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="scale-outline" size={14} color={colors.text.muted} />
            <AppText variant="caption" color="muted">{phase.estimated_need_kg} kg</AppText>
          </View>
          <Badge label={`${totalBags} ${t('bags')}`} />
        </View>

        {isExpanded && (
          <View style={styles.expandedSection}>
            <Divider />
            <AppText variant="label">{t('recommendedProducts')}</AppText>
            {phase.products.map((product) => renderSuggestedProduct(product))}
          </View>
        )}
      </Card>
    );
  }, [expandedPhaseIndex, getPhaseLabel, renderSuggestedProduct, t, togglePhaseExpansion]);

  const renderCycleSuggestion = useCallback(({ item: cycle }: { item: CycleSuggestion }) => {
    const isExpanded = expandedCycleId === cycle.cycle_id;

    return (
      <Card variant="outlined" style={styles.cycleCard}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${cycle.cycle_name}, ${t(isExpanded ? 'collapseActions' : 'details')}`}
          accessibilityState={{ expanded: isExpanded }}
          onPress={() => toggleCycleExpansion(cycle.cycle_id)}
          style={({ pressed }) => [styles.expandableControl, pressed && styles.pressed]}
        >
          <View style={styles.expandableHeading}>
            <Ionicons name="water-outline" size={28} color={colors.brand.primary} />
            <View style={styles.flex}>
              <AppText variant="cardTitle">{cycle.cycle_name}</AppText>
              <Badge label={t(cycle.species)} tone="success" />
              <AppText variant="caption" color="muted">
                {t('currentPhase')}: {getPhaseLabel(cycle.current_phase)} · {cycle.current_avg_weight_g} g · {cycle.days_remaining} {t('daysRemaining')}
              </AppText>
            </View>
          </View>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={24}
            color={colors.text.muted}
          />
        </Pressable>

        <View style={styles.metricGrid}>
          <MetricCard value={`${cycle.summary.total_needed_kg} kg`} label={t('totalNeeded')} />
          <MetricCard value={cycle.summary.total_bags} label={t('totalBags')} />
          <MetricCard value={`${cycle.summary.total_price.toLocaleString()} FCFA`} label={t('totalCost')} />
          <MetricCard value={`${cycle.summary.coverage_days} ${t('days')}`} label={t('coverage')} />
        </View>

        <Button label={t('addAllToCart')} iconLeft="cart" onPress={() => handleAddCycleToCart(cycle)} style={styles.buttonSpacing} />

        {isExpanded && (
          <View style={styles.cyclePhases}>
            <Divider />
            <AppText variant="cardTitle">{t('feedingPhases')}</AppText>
            {cycle.phases.map((phase, index) => renderFeedingPhase(phase, cycle.cycle_id, index))}
          </View>
        )}
      </Card>
    );
  }, [expandedCycleId, getPhaseLabel, handleAddCycleToCart, renderFeedingPhase, t, toggleCycleExpansion]);

  const renderListHeader = useCallback(
    () =>
      suggestionCycles.length > 0 ? (
        <>
          {error ? <InlineAlert tone="error" message={error} /> : null}
          <InlineAlert tone="info" message={t('suggestionsInfoBanner')} />

          {renderConfidenceScore()}
        </>
      ) : null,
    [error, renderConfidenceScore, suggestionCycles.length, t]
  );

  const renderEmptyState = useCallback(
    () => (
      <EmptyState title={t('noSuggestionsYet')} message={t('noSuggestionsDescription')} actionLabel={t('startNewCycle')} onAction={() => navigation.navigate('CreateFarm')} />
    ),
    [navigation, t]
  );

  return (
    <View style={styles.screen}>
      <AppHeader title={t('feedingSuggestions')} subtitle={t('intelligentRecommendations')} onBack={() => navigation.goBack()} backLabel={t('back')} rightAction={<IconButton icon="cart-outline" variant="ghost" tone="inverse" accessibilityLabel={`${t('cart')} ${cartItemsCount}`} badge={cartItemsCount} onPress={() => navigation.navigate('Cart')} />} />

      {!currentCycle?.id ? (
        <EmptyState title={t('sessionCycleNotSelected')} message={t('sessionCyclePickerDescription')} actionLabel={t('sessionCycleConfirm')} onAction={() => navigation.navigate('CycleSessionEntry', { showBackToDashboard: true })} />
      ) : loading && !refreshing ? (
        <LoadingState message={t('analyzingCycles')} />
      ) : error && suggestionCycles.length === 0 ? (
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
  expandableControl: { minHeight: sizing.touchTargetMinimum, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[3] },
  pressed: { opacity: opacity.pressed },
  sectionCard: { marginBottom: spacing[4] },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginBottom: spacing[3] },
  confidenceContent: { flexDirection: 'row', gap: spacing[4] },
  confidenceScore: { alignItems: 'center', paddingHorizontal: spacing[4] },
  analysisDetails: { flex: 1, justifyContent: 'center', gap: spacing[1] },
  flex: { flex: 1 },
  productCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing[3], marginBottom: spacing[2] },
  productActions: { alignItems: 'flex-end', justifyContent: 'space-between' },
  expandedSection: { gap: spacing[2] },
  cycleCard: { marginBottom: spacing[4], gap: spacing[3] },
  phaseCard: { marginBottom: spacing[3], gap: spacing[3] },
  expandableHeading: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: spacing[3] },
  expandableTrailing: { alignItems: 'flex-end', gap: spacing[1] },
  phaseIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface.page, alignItems: 'center', justifyContent: 'center' },
  phaseMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  cyclePhases: { gap: spacing[3] },
  buttonSpacing: { marginTop: spacing[3] },
});
