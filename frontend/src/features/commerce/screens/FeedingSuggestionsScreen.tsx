import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
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
import { fetchFeedingSuggestions, addToCart } from '@/features/commerce/store/commerceSlice';
import { CycleSuggestion, FeedingPhase, SuggestedProduct } from '@/types/commerce';
import { MAVECAM_COLORS } from '@/constants/colors';
import { RootStackParamList } from '@/navigation/MainNavigator';

type NavigationProp = StackNavigationProp<RootStackParamList>;

export default function FeedingSuggestionsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const dispatch = useDispatch<AppDispatch>();

  const { suggestions, cart, products } = useSelector((state: RootState) => state.commerce);
  const { data: suggestionsData, loading, error } = suggestions;
  const { user, farmProfile } = useSelector((state: RootState) => state.auth);

  const [refreshing, setRefreshing] = useState(false);
  const [expandedCycleId, setExpandedCycleId] = useState<string | null>(null);
  const [expandedPhaseIndex, setExpandedPhaseIndex] = useState<{ [key: string]: number | null }>({});

  useEffect(() => {
    if (farmProfile) {
      dispatch(fetchFeedingSuggestions(farmProfile.id));
    }
  }, [farmProfile]);

  const handleRefresh = async () => {
    if (!farmProfile) return;
    setRefreshing(true);
    await dispatch(fetchFeedingSuggestions(farmProfile.id));
    setRefreshing(false);
  };

  const toggleCycleExpansion = (cycleId: string) => {
    setExpandedCycleId(expandedCycleId === cycleId ? null : cycleId);
  };

  const togglePhaseExpansion = (cycleId: string, phaseIndex: number) => {
    setExpandedPhaseIndex({
      ...expandedPhaseIndex,
      [cycleId]: expandedPhaseIndex[cycleId] === phaseIndex ? null : phaseIndex,
    });
  };

  const handleAddToCart = (productId: string, quantity: number) => {
    const product = products.items.find((p) => p.id === productId);
    if (!product) {
      Alert.alert(t('error'), t('productNotFound'));
      return;
    }

    dispatch(addToCart({ product, quantity }));
    Alert.alert(t('success'), t('productAddedToCart', { quantity }), [{ text: t('ok') }]);
  };

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
        { text: t('viewCart'), onPress: () => navigation.navigate('Cart') },
        { text: t('ok') },
      ]
    );
  };

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
      <View className="bg-white rounded-xl p-4 mb-4">
        <View className="flex-row items-center mb-3 gap-2">
          <Ionicons name="analytics-outline" size={24} color={scoreColor} />
          <Text className="text-base font-bold text-gray-dark">{t('dataQuality')}</Text>
        </View>
        <View className="flex-row gap-4">
          <View className="items-center px-4">
            <Text className="text-3xl font-bold" style={{ color: scoreColor }}>
              {confidence_score}%
            </Text>
            <Text className="text-xs text-gray-light mt-1">{t('confidenceScore')}</Text>
          </View>
          <View className="flex-1 justify-center gap-1">
            <Text className="text-sm text-gray-dark">
              {t('cyclesAnalyzed')}: {cycles_with_data}/{total_cycles}
            </Text>
            <Text className="text-sm text-gray-dark">
              {t('analysisPeriod')}: {suggestionsData.analysis.analysis_period_days} {t('days')}
            </Text>
            <Text className="text-sm text-gray-dark">
              {t('safetyBuffer')}: +{suggestionsData.analysis.safety_buffer_days} {t('days')}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderSuggestedProduct = (suggestedProduct: SuggestedProduct) => {
    const totalPrice = suggestedProduct.total_price;

    return (
      <View key={suggestedProduct.product_id} className="flex-row justify-between bg-white p-3 rounded-lg mb-2">
        <View className="flex-1 mr-3">
          <Text className="text-[10px] text-gray-light font-semibold mb-1">{suggestedProduct.brand.toUpperCase()}</Text>
          <Text className="text-sm text-gray-dark mb-1" numberOfLines={2}>
            {suggestedProduct.product_name}
          </Text>
          <Text className="text-xs text-gray-light">
            {suggestedProduct.quantity_bags} {t('bags')} - {suggestedProduct.total_kg}kg
          </Text>
        </View>
        <View className="items-end justify-between">
          <Text className="text-sm font-semibold text-mavecam-primary">
            {totalPrice.toLocaleString()} FCFA
          </Text>
          <TouchableOpacity
            className="bg-mavecam-primary w-8 h-8 rounded-full items-center justify-center"
            onPress={() => handleAddToCart(suggestedProduct.product_id, suggestedProduct.quantity_bags)}
          >
            <Ionicons name="cart-outline" size={16} color={MAVECAM_COLORS.WHITE} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderFeedingPhase = (phase: FeedingPhase, cycleId: string, index: number) => {
    const isExpanded = expandedPhaseIndex[cycleId] === index;
    const totalBags = phase.products.reduce((sum, p) => sum + p.quantity_bags, 0);

    return (
      <View key={index} className="bg-cream rounded-lg p-3 mb-3">
        <TouchableOpacity
          className="flex-row justify-between items-center"
          onPress={() => togglePhaseExpansion(cycleId, index)}
          activeOpacity={0.8}
        >
          <View className="flex-row items-center flex-1 gap-3">
            <View className="w-10 h-10 bg-white rounded-full items-center justify-center">
              <Ionicons name="fast-food-outline" size={20} color={MAVECAM_COLORS.GREEN_PRIMARY} />
            </View>
            <View>
              <Text className="text-sm font-semibold text-gray-dark">{phase.phase_name}</Text>
              <Text className="text-xs text-gray-light">
                {phase.pellet_size_mm}mm - {phase.weight_range_g[0]}-{phase.weight_range_g[1]}g
              </Text>
            </View>
          </View>
          <View className="items-end gap-1">
            <Text className="text-sm font-semibold text-mavecam-primary">
              {phase.total_price.toLocaleString()} FCFA
            </Text>
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={MAVECAM_COLORS.GRAY_LIGHT}
            />
          </View>
        </TouchableOpacity>

        <View className="flex-row mt-3 gap-4">
          <View className="flex-row items-center gap-1">
            <Ionicons name="calendar-outline" size={14} color={MAVECAM_COLORS.GRAY_LIGHT} />
            <Text className="text-xs text-gray-light">{phase.days_coverage} {t('days')}</Text>
          </View>
          <View className="flex-row items-center gap-1">
            <Ionicons name="scale-outline" size={14} color={MAVECAM_COLORS.GRAY_LIGHT} />
            <Text className="text-xs text-gray-light">{phase.estimated_need_kg}kg</Text>
          </View>
          <View className="flex-row items-center gap-1">
            <Ionicons name="cube-outline" size={14} color={MAVECAM_COLORS.GRAY_LIGHT} />
            <Text className="text-xs text-gray-light">{totalBags} {t('bags')}</Text>
          </View>
        </View>

        {isExpanded && (
          <View className="mt-3 pt-3 border-t border-[#e5e7eb]">
            <Text className="text-xs font-semibold text-gray-dark mb-2">{t('recommendedProducts')}</Text>
            {phase.products.map((product) => renderSuggestedProduct(product))}
          </View>
        )}
      </View>
    );
  };

  const renderCycleSuggestion = ({ item: cycle }: { item: CycleSuggestion }) => {
    const isExpanded = expandedCycleId === cycle.cycle_id;

    return (
      <View className="bg-white rounded-xl p-4 mb-4">
        <TouchableOpacity
          className="flex-row items-center justify-between"
          onPress={() => toggleCycleExpansion(cycle.cycle_id)}
          activeOpacity={0.8}
        >
          <View className="flex-row items-center flex-1 gap-3">
            <Ionicons name="water-outline" size={28} color={MAVECAM_COLORS.GREEN_PRIMARY} />
            <View className="flex-1">
              <Text className="text-base font-bold text-gray-dark">{cycle.cycle_name}</Text>
              <Text className="text-sm text-mavecam-primary">{t(cycle.species)}</Text>
              <Text className="text-xs text-gray-light mt-1">
                {t('currentPhase')}: {cycle.current_phase} - {cycle.current_avg_weight_g}g - {cycle.days_remaining} {t('daysRemaining')}
              </Text>
            </View>
          </View>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={24}
            color={MAVECAM_COLORS.GRAY_LIGHT}
          />
        </TouchableOpacity>

        <View className="flex-row flex-wrap bg-cream rounded-lg p-3 mt-3 gap-3">
          <View className="flex-1 min-w-[45%] items-center">
            <Text className="text-xs text-gray-light">{t('totalNeeded')}</Text>
            <Text className="text-sm font-bold text-gray-dark">{cycle.summary.total_needed_kg}kg</Text>
          </View>
          <View className="flex-1 min-w-[45%] items-center">
            <Text className="text-xs text-gray-light">{t('totalBags')}</Text>
            <Text className="text-sm font-bold text-gray-dark">{cycle.summary.total_bags}</Text>
          </View>
          <View className="flex-1 min-w-[45%] items-center">
            <Text className="text-xs text-gray-light">{t('totalCost')}</Text>
            <Text className="text-sm font-bold text-mavecam-primary">
              {cycle.summary.total_price.toLocaleString()} FCFA
            </Text>
          </View>
          <View className="flex-1 min-w-[45%] items-center">
            <Text className="text-xs text-gray-light">{t('coverage')}</Text>
            <Text className="text-sm font-bold text-gray-dark">{cycle.summary.coverage_days} {t('days')}</Text>
          </View>
        </View>

        <TouchableOpacity
          className="bg-mavecam-primary flex-row items-center justify-center py-3 rounded-lg mt-3 gap-2"
          onPress={() => handleAddCycleToCart(cycle)}
        >
          <Ionicons name="cart" size={20} color={MAVECAM_COLORS.WHITE} />
          <Text className="text-white text-base font-semibold">{t('addAllToCart')}</Text>
        </TouchableOpacity>

        {isExpanded && (
          <View className="mt-4">
            <Text className="text-sm font-bold text-gray-dark mb-3">{t('feedingPhases')}</Text>
            {cycle.phases.map((phase, index) => renderFeedingPhase(phase, cycle.cycle_id, index))}
          </View>
        )}
      </View>
    );
  };

  const renderEmptyState = () => (
    <View className="py-16 items-center">
      <Ionicons name="bulb-outline" size={100} color={MAVECAM_COLORS.GRAY_LIGHT} />
      <Text className="mt-5 text-2xl font-bold text-gray-dark">{t('noSuggestionsYet')}</Text>
      <Text className="mt-3 text-base text-gray-light text-center px-8">{t('noSuggestionsDescription')}</Text>
      <TouchableOpacity
        className="mt-6 bg-mavecam-primary flex-row items-center px-6 py-3 rounded-lg gap-2"
        onPress={() => navigation.navigate('NewCycle')}
      >
        <Ionicons name="add-circle-outline" size={20} color={MAVECAM_COLORS.WHITE} />
        <Text className="text-white text-base font-semibold">{t('startNewCycle')}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View className="flex-1 bg-cream">
      <View className="bg-white px-5 pt-16 pb-5 flex-row items-center justify-between shadow">
        <TouchableOpacity onPress={() => navigation.goBack()} className="w-10">
          <Ionicons name="arrow-back" size={24} color={MAVECAM_COLORS.GRAY_DARK} />
        </TouchableOpacity>
        <View className="flex-1 items-center">
          <Text className="text-xl font-bold text-gray-dark">{t('feedingSuggestions')}</Text>
          <Text className="text-xs text-gray-light mt-1">{t('intelligentRecommendations')}</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Cart')} className="relative">
          <Ionicons name="cart-outline" size={24} color={MAVECAM_COLORS.GREEN_PRIMARY} />
          {cart.items.length > 0 && (
            <View className="absolute -top-2 -right-2 bg-[#dc2626] rounded-full min-w-[20px] h-5 items-center justify-center px-1">
              <Text className="text-white text-[10px] font-bold">
                {cart.items.reduce((sum, item) => sum + item.quantity, 0)}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={MAVECAM_COLORS.GREEN_PRIMARY} />
          <Text className="mt-3 text-base text-gray-light">{t('analyzingCycles')}</Text>
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-10 py-10">
          <Ionicons name="alert-circle-outline" size={48} color={MAVECAM_COLORS.ERROR} />
          <Text className="mt-3 text-base text-[#dc2626] text-center">{error}</Text>
          <TouchableOpacity
            className="mt-5 bg-mavecam-primary px-6 py-3 rounded-lg"
            onPress={() => farmProfile && dispatch(fetchFeedingSuggestions(farmProfile.id))}
          >
            <Text className="text-white text-base font-semibold">{t('retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
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
            <View className="p-4">
              <View className="flex-row bg-[#dbeafe] p-3 rounded-lg mb-4 gap-3">
                <Ionicons name="information-circle" size={24} color={MAVECAM_COLORS.INFO} />
                <Text className="flex-1 text-sm text-mavecam-primary">
                  {t('suggestionsInfoBanner')}
                </Text>
              </View>

              {renderConfidenceScore()}

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



