import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { aquacultureService } from '../../services/aquacultureService';
import { NutritionalGuide, Species } from '../../types/aquaculture';

// Couleurs MAVECAM selon spécifications
const MAVECAM_COLORS = {
  GREEN_PRIMARY: '#059669',
  GREEN_LIGHT: '#10b981',
  GREEN_DARK: '#047857',
  WHITE: '#ffffff',
  CREAM: '#f8fafc',
  BLUE: '#2563eb',
  SUCCESS: '#059669',
  WARNING: '#f59e0b',
  ERROR: '#dc2626',
  INFO: '#0ea5e9',
  GRAY_LIGHT: '#64748b',
  GRAY_DARK: '#1e293b',
};

interface FilterState {
  species: 'all' | Species;
  searchText: string;
  selectedStage: string | null;
}

export default function NutritionalGuidesScreen({ navigation }: any) {
  const { t } = useTranslation();

  // États locaux
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [guides, setGuides] = useState<NutritionalGuide[]>([]);
  const [filteredGuides, setFilteredGuides] = useState<NutritionalGuide[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedGuide, setSelectedGuide] = useState<NutritionalGuide | null>(null);

  // États des filtres
  const [filters, setFilters] = useState<FilterState>({
    species: 'all',
    searchText: '',
    selectedStage: null,
  });

  // Options disponibles
  const speciesOptions = [
    { key: 'all', label: t('allSpecies') },
    { key: 'tilapia', label: t('tilapia') },
    { key: 'clarias', label: t('clarias') },
  ];

  // Chargement initial
  useEffect(() => {
    loadNutritionalGuides();
  }, []);

  // Filtrage des guides
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

    // Filtrer par espèce
    if (filters.species !== 'all') {
      filtered = filtered.filter(guide => guide.species === filters.species);
    }

    // Filtrer par recherche textuelle
    if (filters.searchText.trim()) {
      const searchLower = filters.searchText.toLowerCase();
      filtered = filtered.filter(guide =>
        guide.growth_stage.toLowerCase().includes(searchLower) ||
        guide.feeding_notes?.toLowerCase().includes(searchLower) ||
        guide.recommended_products.some(product =>
          product.toLowerCase().includes(searchLower)
        )
      );
    }

    // Filtrer par stade sélectionné
    if (filters.selectedStage) {
      filtered = filtered.filter(guide => guide.growth_stage === filters.selectedStage);
    }

    // Trier par espèce puis par poids minimum
    filtered.sort((a, b) => {
      if (a.species !== b.species) {
        return a.species.localeCompare(b.species);
      }
      return a.min_weight - b.min_weight;
    });

    setFilteredGuides(filtered);
  };

  const updateFilter = (key: keyof FilterState, value: any) => {
    setFilters(prev => ({
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
    <View style={styles.filterRow}>
      {speciesOptions.map((option) => (
        <TouchableOpacity
          key={option.key}
          style={[
            styles.filterButton,
            filters.species === option.key && styles.filterButtonActive,
          ]}
          onPress={() => updateFilter('species', option.key)}
        >
          <Text
            style={[
              styles.filterButtonText,
              filters.species === option.key && styles.filterButtonTextActive,
            ]}
          >
            {option.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderSearchBar = () => (
    <View style={styles.searchContainer}>
      <Ionicons name="search" size={20} color={MAVECAM_COLORS.GRAY_LIGHT} />
      <TextInput
        style={styles.searchInput}
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
      style={[
        styles.guideCard,
        selectedGuide?.id === guide.id && styles.guideCardSelected,
      ]}
      onPress={() => setSelectedGuide(selectedGuide?.id === guide.id ? null : guide)}
    >
      <View style={styles.guideCardHeader}>
        <View style={styles.guideCardHeaderLeft}>
          <View style={[styles.stageBadge, { backgroundColor: getStageColor(guide.growth_stage) }]}>
            <Text style={styles.stageBadgeText}>{t(guide.growth_stage)}</Text>
          </View>
          <Text style={styles.speciesText}>{t(guide.species)}</Text>
        </View>
        <View style={styles.guideCardHeaderRight}>
          <Text style={styles.weightRange}>{formatWeight(guide.min_weight, guide.max_weight)}</Text>
          <Ionicons
            name={selectedGuide?.id === guide.id ? "chevron-up" : "chevron-down"}
            size={20}
            color={MAVECAM_COLORS.GRAY_LIGHT}
            style={styles.expandIconInline}
          />
        </View>
      </View>

      <View style={styles.guideCardContent}>
        <View style={styles.nutritionRow}>
          <View style={styles.nutritionItem}>
            <Text style={styles.nutritionLabel}>{t('feedingRate')}</Text>
            <Text style={styles.nutritionValue}>{guide.feeding_rate_percentage}%</Text>
          </View>
          <View style={styles.nutritionItem}>
            <Text style={styles.nutritionLabel}>{t('protein')}</Text>
            <Text style={styles.nutritionValue}>{guide.protein_requirement}%</Text>
          </View>
          <View style={styles.nutritionItem}>
            <Text style={styles.nutritionLabel}>{t('mealsPerDay')}</Text>
            <Text style={styles.nutritionValue}>{guide.meals_per_day}</Text>
          </View>
        </View>

        {/* Détails expansibles */}
        {selectedGuide?.id === guide.id && (
          <View style={styles.expandedContent}>
            <View style={styles.divider} />

            {guide.recommended_products && guide.recommended_products.length > 0 && (
              <View style={styles.detailSection}>
                <Text style={styles.detailTitle}>{t('recommendedProducts')}</Text>
                {guide.recommended_products.map((product, index) => (
                  <Text key={index} style={styles.productItem}>• {product}</Text>
                ))}
              </View>
            )}

            <View style={styles.detailSection}>
              <Text style={styles.detailTitle}>{t('expectedFCR')}</Text>
              <Text style={styles.detailValue}>{guide.expected_fcr}</Text>
            </View>

            {guide.feeding_notes && (
              <View style={styles.detailSection}>
                <Text style={styles.detailTitle}>{t('feedingNotes')}</Text>
                <Text style={styles.notesText}>{guide.feeding_notes}</Text>
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
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={MAVECAM_COLORS.GREEN_PRIMARY} />
          <Text style={styles.loadingText}>{t('loadingGuides')}</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle" size={60} color={MAVECAM_COLORS.ERROR} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadNutritionalGuides}>
            <Text style={styles.retryButtonText}>{t('retry')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (filteredGuides.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <Ionicons name="document-outline" size={60} color={MAVECAM_COLORS.GRAY_LIGHT} />
          <Text style={styles.emptyText}>{t('noGuidesFound')}</Text>
          <TouchableOpacity style={styles.clearFiltersButton} onPress={resetFilters}>
            <Text style={styles.clearFiltersText}>{t('clearFilters')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <FlatList
        data={filteredGuides}
        renderItem={renderGuideCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[MAVECAM_COLORS.GREEN_PRIMARY]}
            tintColor={MAVECAM_COLORS.GREEN_PRIMARY}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={MAVECAM_COLORS.WHITE} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('nutritionalGuides')}</Text>
        <TouchableOpacity style={styles.infoButton} onPress={() => {
          Alert.alert(
            t('aboutGuides'),
            t('nutritionalGuidesDescription'),
            [{ text: t('understood'), style: 'default' }]
          );
        }}>
          <Ionicons name="information-circle-outline" size={24} color={MAVECAM_COLORS.WHITE} />
        </TouchableOpacity>
      </View>

      {/* Filtres */}
      <View style={styles.filtersContainer}>
        {renderSpeciesFilter()}
        {renderSearchBar()}

        {(filters.species !== 'all' || filters.searchText || filters.selectedStage) && (
          <TouchableOpacity style={styles.resetFiltersButton} onPress={resetFilters}>
            <Ionicons name="refresh" size={16} color={MAVECAM_COLORS.GREEN_PRIMARY} />
            <Text style={styles.resetFiltersText}>{t('resetFilters')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Statistiques */}
      <View style={styles.statsContainer}>
        <Text style={styles.statsText}>
          {t('guidesCount', { count: filteredGuides.length, total: guides.length })}
        </Text>
      </View>

      {/* Contenu principal */}
      {renderContent()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MAVECAM_COLORS.CREAM,
  },
  header: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.WHITE,
    flex: 1,
    textAlign: 'center',
  },
  infoButton: {
    padding: 8,
  },
  filtersContainer: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  filterRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: MAVECAM_COLORS.GREEN_PRIMARY,
    marginRight: 8,
    backgroundColor: MAVECAM_COLORS.WHITE,
  },
  filterButtonActive: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  filterButtonText: {
    fontSize: 14,
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    fontWeight: '500',
    textAlign: 'center',
  },
  filterButtonTextActive: {
    color: MAVECAM_COLORS.WHITE,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MAVECAM_COLORS.CREAM,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  resetFiltersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  resetFiltersText: {
    marginLeft: 4,
    fontSize: 14,
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    fontWeight: '500',
  },
  statsContainer: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  statsText: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    textAlign: 'center',
  },
  listContainer: {
    padding: 16,
  },
  guideCard: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  guideCardSelected: {
    borderWidth: 2,
    borderColor: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  guideCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  guideCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  guideCardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stageBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  stageBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: MAVECAM_COLORS.WHITE,
  },
  speciesText: {
    fontSize: 16,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
    textTransform: 'capitalize',
  },
  weightRange: {
    fontSize: 14,
    fontWeight: '500',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  guideCardContent: {
    flex: 1,
  },
  nutritionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  nutritionItem: {
    alignItems: 'center',
    flex: 1,
  },
  nutritionLabel: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginBottom: 4,
  },
  nutritionValue: {
    fontSize: 16,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  expandIconInline: {
    marginLeft: 4,
  },
  expandedContent: {
    marginTop: 16,
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e5e5',
    marginBottom: 16,
  },
  detailSection: {
    marginBottom: 12,
  },
  detailTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    fontWeight: '500',
  },
  productItem: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 2,
  },
  notesText: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_DARK,
    lineHeight: 20,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: MAVECAM_COLORS.GRAY_LIGHT,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: MAVECAM_COLORS.ERROR,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: MAVECAM_COLORS.WHITE,
    fontWeight: '600',
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    textAlign: 'center',
  },
  clearFiltersButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  clearFiltersText: {
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    fontWeight: '600',
  },
});