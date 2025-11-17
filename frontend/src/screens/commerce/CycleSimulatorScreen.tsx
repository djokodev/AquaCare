/**
 * CycleSimulatorScreen - Simulateur Cycle Production MAVECAM
 *
 * Outil prédictif permettant de simuler un cycle complet :
 * - Paramètres configurables (espèce, nb poissons, durée, etc.)
 * - Calcul croissance jour par jour (modèle logarithmique backend)
 * - Phases alimentation automatiques
 * - Estimation besoins aliments par phase
 * - Calcul FCR estimé vs cible MAVECAM
 * - Projection ROI (coûts aliments vs revenus vente)
 * - Ajout direct au panier des produits simulés
 *
 * @screen commerce/CycleSimulatorScreen
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';

import { AppDispatch, RootState } from '@/store/store';
import { fetchCycleSimulation, resetSimulation, addToCart } from '@/store/slices/commerceSlice';
import { CycleSimulationParams, SimulatedFeedingPhase } from '@/types/commerce';
import { MAVECAM_COLORS } from '@/constants/colors';
import { CYCLE_SIMULATION_DEFAULTS } from '@/domain/commerce';
import CustomPicker from '@/components/common/CustomPicker';

export default function CycleSimulatorScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const dispatch = useDispatch<AppDispatch>();

  // Redux state
  const { simulation, cart, products } = useSelector((state: RootState) => state.commerce);
  const { result: simulationResult, loading, error } = simulation;

  // Form state
  const [species, setSpecies] = useState<'tilapia' | 'catfish'>('tilapia');
  const [initialFishCount, setInitialFishCount] = useState('1000');
  const [initialWeightG, setInitialWeightG] = useState(
    CYCLE_SIMULATION_DEFAULTS.tilapia.initial_weight_g.toString()
  );
  const [targetWeightG, setTargetWeightG] = useState(
    CYCLE_SIMULATION_DEFAULTS.tilapia.target_weight_g.toString()
  );
  const [cycleDurationDays, setCycleDurationDays] = useState(
    CYCLE_SIMULATION_DEFAULTS.tilapia.cycle_duration_days.toString()
  );
  const [survivalRate, setSurvivalRate] = useState(
    (CYCLE_SIMULATION_DEFAULTS.tilapia.survival_rate * 100).toString()
  );

  // Change species - update defaults
  const handleSpeciesChange = (newSpecies: 'tilapia' | 'catfish') => {
    setSpecies(newSpecies);
    const defaults = CYCLE_SIMULATION_DEFAULTS[newSpecies];
    setInitialWeightG(defaults.initial_weight_g.toString());
    setTargetWeightG(defaults.target_weight_g.toString());
    setCycleDurationDays(defaults.cycle_duration_days.toString());
    setSurvivalRate((defaults.survival_rate * 100).toString());
  };

  // Launch simulation
  const handleLaunchSimulation = () => {
    // Validation
    const fishCount = parseInt(initialFishCount);
    const initWeight = parseFloat(initialWeightG);
    const targWeight = parseFloat(targetWeightG);
    const duration = parseInt(cycleDurationDays);
    const survival = parseFloat(survivalRate) / 100;

    if (
      isNaN(fishCount) ||
      fishCount <= 0 ||
      isNaN(initWeight) ||
      initWeight <= 0 ||
      isNaN(targWeight) ||
      targWeight <= initWeight ||
      isNaN(duration) ||
      duration < 30 ||
      duration > 365 ||
      isNaN(survival) ||
      survival <= 0 ||
      survival > 1
    ) {
      Alert.alert(t('error'), t('invalidSimulationParams'));
      return;
    }

    const params: CycleSimulationParams = {
      species,
      initial_fish_count: fishCount,
      initial_weight_g: initWeight,
      target_weight_g: targWeight,
      cycle_duration_days: duration,
      survival_rate: survival,
    };

    dispatch(fetchCycleSimulation(params));
  };

  // Reset simulation
  const handleReset = () => {
    dispatch(resetSimulation());
    setInitialFishCount('1000');
    handleSpeciesChange(species); // Reset to defaults
  };

  // Add all products to cart
  const handleAddAllToCart = () => {
    if (!simulationResult) return;

    let totalProducts = 0;
    simulationResult.feeding_phases.forEach((phase) => {
      phase.products.forEach((simulatedProduct) => {
        const product = products.items.find((p) => p.id === simulatedProduct.product_id);
        if (product) {
          dispatch(addToCart({ product, quantity: simulatedProduct.quantity_bags }));
          totalProducts += simulatedProduct.quantity_bags;
        }
      });
    });

    Alert.alert(t('success'), t('simulationProductsAdded', { count: totalProducts }), [
      {
        text: t('viewCart'),
        onPress: () => navigation.navigate('Cart' as never),
      },
      { text: t('ok') },
    ]);
  };

  // Render phase card
  const renderPhaseCard = (phase: SimulatedFeedingPhase, index: number) => {
    const totalBags = phase.products.reduce((sum, p) => sum + p.quantity_bags, 0);

    return (
      <View key={index} style={styles.phaseCard}>
        <View style={styles.phaseHeader}>
          <View style={styles.phaseIconContainer}>
            <Ionicons name="fast-food" size={20} color={MAVECAM_COLORS.GREEN_PRIMARY} />
          </View>
          <View style={styles.phaseInfo}>
            <Text style={styles.phaseName}>{phase.phase_name}</Text>
            <Text style={styles.phaseSpecs}>
              {t('days')} {phase.days_range[0]}-{phase.days_range[1]} • {phase.pellet_size_mm}mm
              • {phase.weight_range_g[0]}-{phase.weight_range_g[1]}g
            </Text>
          </View>
        </View>

        <View style={styles.phaseMetrics}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>{t('duration')}</Text>
            <Text style={styles.metricValue}>
              {phase.duration_days} {t('days')}
            </Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>{t('consumption')}</Text>
            <Text style={styles.metricValue}>{phase.total_consumption_kg}kg</Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>{t('dailyAverage')}</Text>
            <Text style={styles.metricValue}>{phase.daily_avg_kg.toFixed(1)}kg/j</Text>
          </View>
        </View>

        <View style={styles.phaseSummary}>
          <View style={styles.phaseSummaryLeft}>
            <Text style={styles.phaseTotalBags}>
              {totalBags} {t(totalBags > 1 ? 'bags' : 'bag')}
            </Text>
          </View>
          <Text style={styles.phaseTotalPrice}>
            {parseFloat(phase.total_price).toLocaleString()} FCFA
          </Text>
        </View>

        {/* Products list */}
        <View style={styles.phaseProducts}>
          {phase.products.map((product, pIndex) => (
            <View key={pIndex} style={styles.productRow}>
              <Text style={styles.productName} numberOfLines={1}>
                {product.product_name}
              </Text>
              <Text style={styles.productQuantity}>
                {product.quantity_bags}x {product.package_weight_kg}kg
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={MAVECAM_COLORS.GRAY_DARK} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t('cycleSimulator')}</Text>
          <Text style={styles.headerSubtitle}>{t('predictROI')}</Text>
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

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Form section */}
        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>{t('simulationParameters')}</Text>

          {/* Species */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('species')} *</Text>
            <View style={styles.speciesSelector}>
              <TouchableOpacity
                style={[
                  styles.speciesButton,
                  species === 'tilapia' && styles.speciesButtonActive,
                ]}
                onPress={() => handleSpeciesChange('tilapia')}
              >
                <Ionicons
                  name="fish"
                  size={20}
                  color={species === 'tilapia' ? MAVECAM_COLORS.WHITE : MAVECAM_COLORS.GRAY_DARK}
                />
                <Text
                  style={[
                    styles.speciesButtonText,
                    species === 'tilapia' && styles.speciesButtonTextActive,
                  ]}
                >
                  {t('tilapia')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.speciesButton,
                  species === 'catfish' && styles.speciesButtonActive,
                ]}
                onPress={() => handleSpeciesChange('catfish')}
              >
                <Ionicons
                  name="fish"
                  size={20}
                  color={species === 'catfish' ? MAVECAM_COLORS.WHITE : MAVECAM_COLORS.GRAY_DARK}
                />
                <Text
                  style={[
                    styles.speciesButtonText,
                    species === 'catfish' && styles.speciesButtonTextActive,
                  ]}
                >
                  {t('catfish')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Initial fish count */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('initialFishCount')} *</Text>
            <TextInput
              style={styles.input}
              value={initialFishCount}
              onChangeText={setInitialFishCount}
              keyboardType="numeric"
              placeholder="1000"
            />
          </View>

          {/* Initial weight */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('simulationInitialWeight')} (g)</Text>
            <TextInput
              style={styles.input}
              value={initialWeightG}
              onChangeText={setInitialWeightG}
              keyboardType="numeric"
              placeholder="5"
            />
          </View>

          {/* Target weight */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('targetWeight')} (g)</Text>
            <TextInput
              style={styles.input}
              value={targetWeightG}
              onChangeText={setTargetWeightG}
              keyboardType="numeric"
              placeholder={species === 'tilapia' ? '300' : '400'}
            />
          </View>

          {/* Cycle duration */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('cycleDuration')} ({t('days')})</Text>
            <TextInput
              style={styles.input}
              value={cycleDurationDays}
              onChangeText={setCycleDurationDays}
              keyboardType="numeric"
              placeholder={species === 'tilapia' ? '120' : '150'}
            />
          </View>

          {/* Survival rate */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('survivalRate')} (%)</Text>
            <TextInput
              style={styles.input}
              value={survivalRate}
              onChangeText={setSurvivalRate}
              keyboardType="numeric"
              placeholder="85"
            />
          </View>

          {/* Buttons */}
          <View style={styles.formActions}>
            <TouchableOpacity
              style={[styles.simulateButton, loading && styles.buttonDisabled]}
              onPress={handleLaunchSimulation}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={MAVECAM_COLORS.WHITE} />
              ) : (
                <>
                  <Ionicons name="analytics" size={20} color={MAVECAM_COLORS.WHITE} />
                  <Text style={styles.simulateButtonText}>{t('simulate')}</Text>
                </>
              )}
            </TouchableOpacity>
            {simulationResult && (
              <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
                <Ionicons name="refresh" size={20} color={MAVECAM_COLORS.GRAY_DARK} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Error state */}
        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={32} color={MAVECAM_COLORS.ERROR} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Results */}
        {simulationResult && (
          <View style={styles.resultsSection}>
            <Text style={styles.sectionTitle}>{t('simulationResults')}</Text>

            {/* Summary cards */}
            <View style={styles.summaryGrid}>
              <View style={styles.summaryCard}>
                <Ionicons name="scale-outline" size={24} color={MAVECAM_COLORS.GREEN_PRIMARY} />
                <Text style={styles.summaryValue}>
                  {simulationResult.summary.total_feed_kg.toLocaleString()}kg
                </Text>
                <Text style={styles.summaryLabel}>{t('totalFeed')}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Ionicons name="wallet-outline" size={24} color={MAVECAM_COLORS.GREEN_PRIMARY} />
                <Text style={styles.summaryValue}>
                  {simulationResult.summary.total_cost_fcfa.toLocaleString()}
                </Text>
                <Text style={styles.summaryLabel}>{t('feedCost')}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Ionicons name="trending-up-outline" size={24} color={MAVECAM_COLORS.GREEN_PRIMARY} />
                <Text style={styles.summaryValue}>
                  {simulationResult.summary.estimated_fcr.toFixed(2)}
                </Text>
                <Text style={styles.summaryLabel}>{t('estimatedFCR')}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Ionicons name="heart-outline" size={24} color={MAVECAM_COLORS.GREEN_PRIMARY} />
                <Text style={styles.summaryValue}>
                  {(simulationResult.summary.survival_rate * 100).toFixed(0)}%
                </Text>
                <Text style={styles.summaryLabel}>{t('survivalRate')}</Text>
              </View>
            </View>

            {/* ROI section */}
            <View style={styles.roiCard}>
              <Text style={styles.roiTitle}>{t('roi')}</Text>
              <View style={styles.roiMetrics}>
                <View style={styles.roiMetric}>
                  <Text style={styles.roiLabel}>{t('estimatedRevenue')}</Text>
                  <Text style={styles.roiValue}>
                    {simulationResult.summary.estimated_revenue_fcfa.toLocaleString()} FCFA
                  </Text>
                </View>
                <View style={styles.roiMetric}>
                  <Text style={styles.roiLabel}>{t('estimatedProfit')}</Text>
                  <Text style={styles.roiValue}>
                    {simulationResult.summary.estimated_profit_fcfa.toLocaleString()} FCFA
                  </Text>
                </View>
                <View style={styles.roiMetric}>
                  <Text style={styles.roiLabel}>{t('roiPercentage')}</Text>
                  <Text
                    style={[
                      styles.roiValueLarge,
                      {
                        color:
                          simulationResult.summary.roi_percentage > 0
                            ? MAVECAM_COLORS.SUCCESS
                            : MAVECAM_COLORS.ERROR,
                      },
                    ]}
                  >
                    {simulationResult.summary.roi_percentage > 0 ? '+' : ''}
                    {simulationResult.summary.roi_percentage.toFixed(1)}%
                  </Text>
                </View>
              </View>
            </View>

            {/* Feeding phases */}
            <Text style={styles.subsectionTitle}>{t('feedingPhases')}</Text>
            {simulationResult.feeding_phases.map((phase, index) =>
              renderPhaseCard(phase, index)
            )}

            {/* Add all to cart */}
            <TouchableOpacity style={styles.addAllButton} onPress={handleAddAllToCart}>
              <Ionicons name="cart" size={20} color={MAVECAM_COLORS.WHITE} />
              <Text style={styles.addAllButtonText}>{t('addAllToCart')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
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
  formSection: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    padding: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 8,
  },
  speciesSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  speciesButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: MAVECAM_COLORS.GRAY_LIGHT,
    gap: 8,
  },
  speciesButtonActive: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    borderColor: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  speciesButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  speciesButtonTextActive: {
    color: MAVECAM_COLORS.WHITE,
  },
  input: {
    borderWidth: 1,
    borderColor: MAVECAM_COLORS.GRAY_LIGHT,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
  },
  simulateButton: {
    flex: 1,
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  simulateButtonText: {
    color: MAVECAM_COLORS.WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
  resetButton: {
    backgroundColor: MAVECAM_COLORS.CREAM,
    padding: 14,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    padding: 20,
    marginBottom: 8,
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: MAVECAM_COLORS.ERROR,
    textAlign: 'center',
  },
  resultsSection: {
    padding: 16,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: MAVECAM_COLORS.WHITE,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    marginTop: 8,
  },
  summaryLabel: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginTop: 4,
    textAlign: 'center',
  },
  roiCard: {
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
  roiTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 16,
  },
  roiMetrics: {
    gap: 12,
  },
  roiMetric: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roiLabel: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
  },
  roiValue: {
    fontSize: 14,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  roiValueLarge: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 12,
  },
  phaseCard: {
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
  phaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  phaseIconContainer: {
    width: 40,
    height: 40,
    backgroundColor: MAVECAM_COLORS.CREAM,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  phaseInfo: {
    flex: 1,
  },
  phaseName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  phaseSpecs: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginTop: 2,
  },
  phaseMetrics: {
    flexDirection: 'row',
    backgroundColor: MAVECAM_COLORS.CREAM,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    gap: 16,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 11,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  phaseSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  phaseSummaryLeft: {},
  phaseTotalBags: {
    fontSize: 14,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  phaseTotalPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  phaseProducts: {
    backgroundColor: MAVECAM_COLORS.CREAM,
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  productRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productName: {
    flex: 1,
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_DARK,
    marginRight: 8,
  },
  productQuantity: {
    fontSize: 12,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_LIGHT,
  },
  addAllButton: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  addAllButtonText: {
    color: MAVECAM_COLORS.WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
});
