import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert, TextInput, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { NutritionalGuide, Species } from '@/types/aquaculture';
import { MAVECAM_COLORS } from '@/constants/colors';

interface FilterState {
  species: 'all' | Species;
  searchText: string;
  selectedStage: string | null;
}

export default function NutritionalGuidesScreen({ navigation }: any) {
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [guides, setGuides] = useState<NutritionalGuide[]>([]);
  const [filteredGuides, setFilteredGuides] = useState<NutritionalGuide[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedGuide, setSelectedGuide] = useState<NutritionalGuide | null>(null);

  const [filters, setFilters] = useState<FilterState>({
    species: 'all',
    searchText: '',
    selectedStage: null,
  });

  const speciesOptions = [
    { key: 'all', label: t('allSpecies') },
    { key: 'tilapia', label: t('tilapia') },
    { key: 'clarias', label: t('clarias') },
  ];

  useEffect(() => {
    loadNutritionalGuides();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [guides, filters]);

  const loadNutritionalGuides = async () => {
    try {
      setError(null);
      const data = await aquacultureService.getAllNutritionalGuides();
      setGuides(data);
    } catch (err: any) {
      console.error('Erreur chargement guides nutritionnels:', err);
      setError(err.message || t('errorLoadingGuides'));
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await loadNutritionalGuides();
    setRefreshing(false);
  }, []);

  const applyFilters = () => {
    let filtered = [...guides];

    if (filters.species !== 'all') {
      filtered = filtered.filter((guide) => guide.species === filters.species);
    }

    if (filters.searchText.trim()) {
      const searchLower = filters.searchText.toLowerCase();
      filtered = filtered.filter(
        (guide) =>
          guide.growth_stage.toLowerCase().includes(searchLower) ||
          guide.feeding_notes?.toLowerCase().includes(searchLower) ||
          guide.recommended_products.some((product) => product.toLowerCase().includes(searchLower))
      );
    }

    if (filters.selectedStage) {
      filtered = filtered.filter((guide) => guide.growth_stage === filters.selectedStage);
    }

    filtered.sort((a, b) => {
      if (a.species !== b.species) {
        return a.species.localeCompare(b.species);
      }
      return a.min_weight - b.min_weight;
    });

    setFilteredGuides(filtered);
  };

  const updateFilter = (key: keyof FilterState, value: any) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const resetFilters = () => {
    setFilters({
      species: 'all',
      searchText: '',
      selectedStage: null,
    });
    setSelectedGuide(null);
  };

  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'alevin':
        return MAVECAM_COLORS.INFO;
      case 'juvenile':
        return MAVECAM_COLORS.WARNING;
      case 'croissance':
        return MAVECAM_COLORS.GREEN_LIGHT;
      case 'finition':
        return MAVECAM_COLORS.GREEN_DARK;
      default:
        return MAVECAM_COLORS.GRAY_LIGHT;
    }
  };

  const formatWeight = (min: number, max: number) => {
    if (min === max) return `${min}g`;
    return `${min}-${max}g`;
  };

  const renderSpeciesFilter = () => (
    <View className="flex-row mb-3">
      {speciesOptions.map((option) => (
        <TouchableOpacity
          key={option.key}
          className={`flex-row items-center justify-center px-4 py-2 rounded-full border mr-2 ${
            filters.species === option.key ? 'bg-mavecam-primary border-mavecam-primary' : 'bg-white border-mavecam-primary'
          }`}
          onPress={() => updateFilter('species', option.key)}
        >
          <Text
            className={`text-sm font-medium ${
              filters.species === option.key ? 'text-white' : 'text-mavecam-primary'
            }`}
          >
            {option.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderSearchBar = () => (
    <View className="flex-row items-center bg-cream rounded-lg px-3 py-2 mb-2">
      <Ionicons name="search" size={20} color={MAVECAM_COLORS.GRAY_LIGHT} />
      <TextInput
        className="flex-1 ml-2 text-base text-gray-dark"
        placeholder={t('searchInGuides')}
        placeholderTextColor={MAVECAM_COLORS.GRAY_LIGHT}
        value={filters.searchText}
        onChangeText={(text) => updateFilter('searchText', text)}
      />
      {filters.searchText.length > 0 && (
        <TouchableOpacity onPress={() => updateFilter('searchText', '')}>
          <Ionicons name="close-circle" size={20} color={MAVECAM_COLORS.GRAY_LIGHT} />
        </TouchableOpacity>
      )}
    </View>
  );

  const renderGuideCard = ({ item: guide }: { item: NutritionalGuide }) => (
    <TouchableOpacity
      className={`bg-white rounded-xl p-4 mb-3 shadow ${selectedGuide?.id === guide.id ? 'border-2 border-mavecam-primary' : ''}`}
      onPress={() => setSelectedGuide(selectedGuide?.id === guide.id ? null : guide)}
    >
      <View className="flex-row justify-between items-center mb-3">
        <View className="flex-row items-center flex-1">
          <View className="px-2 py-1 rounded-full mr-2" style={{ backgroundColor: getStageColor(guide.growth_stage) }}>
            <Text className="text-xs font-semibold text-white">{t(guide.growth_stage)}</Text>
          </View>
          <Text className="text-base font-semibold text-gray-dark capitalize">{t(guide.species)}</Text>
        </View>
        <View className="flex-row items-center">
          <Text className="text-sm font-semibold text-mavecam-primary mr-2">{formatWeight(guide.min_weight, guide.max_weight)}</Text>
          <Ionicons
            name={selectedGuide?.id === guide.id ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={MAVECAM_COLORS.GRAY_LIGHT}
          />
        </View>
      </View>

      <View>
        <View className="flex-row justify-between">
          <View className="items-center flex-1">
            <Text className="text-xs text-gray-light mb-1">{t('feedingRate')}</Text>
            <Text className="text-sm font-semibold text-gray-dark">{guide.feeding_rate_percentage}%</Text>
          </View>
          <View className="items-center flex-1">
            <Text className="text-xs text-gray-light mb-1">{t('protein')}</Text>
            <Text className="text-sm font-semibold text-gray-dark">{guide.protein_requirement}%</Text>
          </View>
          <View className="items-center flex-1">
            <Text className="text-xs text-gray-light mb-1">{t('mealsPerDay')}</Text>
            <Text className="text-sm font-semibold text-gray-dark">{guide.meals_per_day}</Text>
          </View>
        </View>

        {selectedGuide?.id === guide.id && (
          <View className="mt-3 pt-3 border-t border-slate-200">
            {guide.recommended_products && guide.recommended_products.length > 0 && (
              <View className="mb-3">
                <Text className="text-sm font-semibold text-gray-dark mb-1">{t('recommendedProducts')}</Text>
                {guide.recommended_products.map((product, index) => (
                  <Text key={index} className="text-sm text-gray-dark mb-1">- {product}</Text>
                ))}
              </View>
            )}

            <View className="mb-3">
              <Text className="text-sm font-semibold text-gray-dark mb-1">{t('expectedFCR')}</Text>
              <Text className="text-sm text-mavecam-primary font-semibold">{guide.expected_fcr}</Text>
            </View>

            {guide.feeding_notes && (
              <View>
                <Text className="text-sm font-semibold text-gray-dark mb-1">{t('feedingNotes')}</Text>
                <Text className="text-sm text-gray-light leading-5">{guide.feeding_notes}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderContent = () => {
    if (loading) {
      return (
        <View className="flex-1 items-center justify-center p-8">
          <ActivityIndicator size="large" color={MAVECAM_COLORS.GREEN_PRIMARY} />
          <Text className="mt-4 text-base text-gray-light">{t('loadingGuides')}</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View className="flex-1 items-center justify-center p-8">
          <Ionicons name="alert-circle" size={60} color={MAVECAM_COLORS.ERROR} />
          <Text className="mt-4 text-base text-error text-center">{error}</Text>
          <TouchableOpacity className="mt-4 bg-mavecam-primary px-5 py-3 rounded-lg" onPress={loadNutritionalGuides}>
            <Text className="text-white text-base font-semibold">{t('retry')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (filteredGuides.length === 0) {
      return (
        <View className="flex-1 items-center justify-center p-8">
          <Ionicons name="document-outline" size={60} color={MAVECAM_COLORS.GRAY_LIGHT} />
          <Text className="mt-4 text-base text-gray-light text-center">{t('noGuidesFound')}</Text>
          <TouchableOpacity className="mt-4 px-5 py-3 rounded-lg border border-mavecam-primary" onPress={resetFilters}>
            <Text className="text-mavecam-primary text-base font-semibold">{t('clearFilters')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <FlatList
        data={filteredGuides}
        renderItem={renderGuideCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[MAVECAM_COLORS.GREEN_PRIMARY]} tintColor={MAVECAM_COLORS.GREEN_PRIMARY} />}
        showsVerticalScrollIndicator={false}
      />
    );
  };

  return (
    <View className="flex-1 bg-cream">
      <View className="bg-mavecam-primary flex-row items-center justify-between px-4 pt-14 pb-4">
        <TouchableOpacity className="p-2" onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={MAVECAM_COLORS.WHITE} />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-white flex-1 text-center">{t('nutritionalGuides')}</Text>
        <TouchableOpacity
          className="p-2"
          onPress={() => {
            Alert.alert(t('aboutGuides'), t('nutritionalGuidesDescription'), [{ text: t('understood'), style: 'default' }]);
          }}
        >
          <Ionicons name="information-circle-outline" size={24} color={MAVECAM_COLORS.WHITE} />
        </TouchableOpacity>
      </View>

      <View className="bg-white px-4 py-3 border-b border-slate-200">
        {renderSpeciesFilter()}
        {renderSearchBar()}

        {(filters.species !== 'all' || filters.searchText || filters.selectedStage) && (
          <TouchableOpacity className="flex-row items-center" onPress={resetFilters}>
            <Ionicons name="refresh" size={16} color={MAVECAM_COLORS.GREEN_PRIMARY} />
            <Text className="ml-2 text-sm font-medium text-mavecam-primary">{t('resetFilters')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View className="bg-white px-4 py-2 border-b border-slate-200">
        <Text className="text-sm text-gray-light text-center">
          {t('guidesCount', { count: filteredGuides.length, total: guides.length })}
        </Text>
      </View>

      {renderContent()}
    </View>
  );
}




