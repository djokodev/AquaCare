/**
 * CreateFarmScreen — Flux "Créer mon élevage"
 *
 * Formulaire annuel affiché après les slides d'onboarding (première connexion)
 * ou quand un utilisateur n'a pas encore de cycle actif.
 * Collecte les données d'exploitation pour lancer la simulation de rentabilité.
 */
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { StackNavigationProp } from '@react-navigation/stack';
import { useDispatch, useSelector } from 'react-redux';

import { MAVECAM_COLORS } from '@/constants/colors';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { AppDispatch, RootState } from '@/store/store';
import { runAnnualSimulation } from '@/features/auth/store/authSlice';
import type { AnnualSimulationInput } from '@/types/auth';

type NavigationProp = StackNavigationProp<RootStackParamList, 'CreateFarm'>;

interface Props {
  navigation: NavigationProp;
}

type Species = 'tilapia' | 'clarias' | 'autre';
type InfraType = 'etang' | 'cage_flottante' | 'bac_hors_sol' | 'bac_en_sol';

interface FormState {
  species: Species | '';
  infraType: InfraType | '';
  unitCount: string;
  unitVolume: string;
  unitSurface: string;
  annualTarget: string;
  startDate: string;
  fingerlingsPrice: string;
  sellingPrice: string;
  otherCosts: string;
}

const SELLING_PRICE_DEFAULTS: Record<string, string> = {
  tilapia: '1800',
  clarias: '2000',
  autre: '1800',
};

const FINGERLINGS_DEFAULTS: Record<string, string> = {
  tilapia: '50',
  clarias: '75',
  autre: '50',
};

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export default function CreateFarmScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const { loading: simLoading } = useSelector(
    (s: RootState) => s.auth.annualSimulation
  );

  const [form, setForm] = useState<FormState>({
    species: '',
    infraType: '',
    unitCount: '',
    unitVolume: '',
    unitSurface: '',
    annualTarget: '',
    startDate: todayISO(),
    fingerlingsPrice: '',
    sellingPrice: '',
    otherCosts: '',
  });

  // Capacité totale calculée en temps réel
  const totalCapacity = useMemo(() => {
    const count = parseFloat(form.unitCount) || 0;
    if (form.infraType === 'etang') {
      const surf = parseFloat(form.unitSurface) || 0;
      return count * surf > 0 ? `${count * surf} m²` : null;
    }
    const vol = parseFloat(form.unitVolume) || 0;
    return count * vol > 0 ? `${count * vol} m³` : null;
  }, [form.infraType, form.unitCount, form.unitVolume, form.unitSurface]);

  function setField(key: keyof FormState, value: string) {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      // Pré-remplir les prix par défaut quand l'espèce change
      if (key === 'species' && value) {
        if (!prev.sellingPrice) next.sellingPrice = SELLING_PRICE_DEFAULTS[value] ?? '1800';
        if (!prev.fingerlingsPrice) next.fingerlingsPrice = FINGERLINGS_DEFAULTS[value] ?? '50';
      }
      return next;
    });
  }

  async function handleSimulate() {
    // Validation des champs requis
    if (!form.species || !form.infraType || !form.unitCount || !form.annualTarget) {
      Alert.alert(t('error'), t('createFarmRequiredFieldsError'));
      return;
    }
    if (form.infraType === 'etang' && !form.unitSurface) {
      Alert.alert(t('error'), t('createFarmRequiredFieldsError'));
      return;
    }
    if (form.infraType !== 'etang' && !form.unitVolume) {
      Alert.alert(t('error'), t('createFarmRequiredFieldsError'));
      return;
    }

    const speciesForSim: 'tilapia' | 'clarias' =
      form.species === 'clarias' ? 'clarias' : 'tilapia';

    const params: AnnualSimulationInput = {
      species: speciesForSim,
      annual_production_target_kg: parseFloat(form.annualTarget),
      num_cycles: 2, // valeur par défaut — l'utilisateur choisit sur l'écran suivant
      start_date: form.startDate || todayISO(),
      selling_price_per_kg_fcfa: form.sellingPrice ? parseFloat(form.sellingPrice) : undefined,
      fingerlings_cost_per_unit_fcfa: form.fingerlingsPrice
        ? parseFloat(form.fingerlingsPrice)
        : undefined,
      other_costs_fcfa_per_year: form.otherCosts ? parseFloat(form.otherCosts) : 0,
    };

    const result = await dispatch(runAnnualSimulation(params));
    if (runAnnualSimulation.fulfilled.match(result)) {
      navigation.navigate('AnnualSimulation', { formData: form as unknown as Record<string, string> });
    } else {
      Alert.alert(t('error'), t('simulationErrorRetry'));
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="fish-outline" size={36} color={MAVECAM_COLORS.GREEN_PRIMARY} />
        <Text style={styles.title}>{t('createFarmTitle')}</Text>
        <Text style={styles.subtitle}>{t('createFarmSubtitle')}</Text>
      </View>

      {/* Section 1 : Votre élevage */}
      <SectionTitle label={t('createFarmSectionBreeding')} icon="leaf-outline" />

      <FieldLabel label={t('createFarmSpeciesLabel')} required />
      <View style={styles.chipRow}>
        {(['tilapia', 'clarias', 'autre'] as Species[]).map(sp => (
          <Chip
            key={sp}
            label={t(`createFarmSpecies${sp.charAt(0).toUpperCase() + sp.slice(1)}` as any)}
            selected={form.species === sp}
            onPress={() => setField('species', sp)}
          />
        ))}
      </View>

      <FieldLabel label={t('createFarmInfraLabel')} required />
      <View style={styles.chipRow}>
        {(
          [
            ['etang', 'createFarmInfraEtang'],
            ['cage_flottante', 'createFarmInfraCageFlottante'],
            ['bac_hors_sol', 'createFarmInfraBacHorsSol'],
            ['bac_en_sol', 'createFarmInfraBacEnSol'],
          ] as [InfraType, string][]
        ).map(([val, key]) => (
          <Chip
            key={val}
            label={t(key as any)}
            selected={form.infraType === val}
            onPress={() => setField('infraType', val)}
          />
        ))}
      </View>

      {/* Section 2 : Capacité */}
      <SectionTitle label={t('createFarmSectionCapacity')} icon="cube-outline" />

      <FieldLabel label={t('createFarmUnitCountLabel')} required />
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        placeholder={t('createFarmUnitCountPlaceholder')}
        placeholderTextColor={MAVECAM_COLORS.GRAY_LIGHT}
        value={form.unitCount}
        onChangeText={v => setField('unitCount', v)}
      />

      {form.infraType === 'etang' ? (
        <>
          <FieldLabel label={t('createFarmUnitSurfaceLabel')} required />
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            placeholder={t('createFarmUnitSurfacePlaceholder')}
            placeholderTextColor={MAVECAM_COLORS.GRAY_LIGHT}
            value={form.unitSurface}
            onChangeText={v => setField('unitSurface', v)}
          />
        </>
      ) : form.infraType !== '' ? (
        <>
          <FieldLabel label={t('createFarmUnitVolumeLabel')} required />
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            placeholder={t('createFarmUnitVolumePlaceholder')}
            placeholderTextColor={MAVECAM_COLORS.GRAY_LIGHT}
            value={form.unitVolume}
            onChangeText={v => setField('unitVolume', v)}
          />
        </>
      ) : null}

      {totalCapacity && (
        <View style={styles.capacityBadge}>
          <Ionicons name="checkmark-circle" size={16} color={MAVECAM_COLORS.GREEN_PRIMARY} />
          <Text style={styles.capacityText}>
            {t('createFarmTotalCapacity')} : <Text style={styles.capacityValue}>{totalCapacity}</Text>
          </Text>
        </View>
      )}

      {/* Section 3 : Objectif annuel */}
      <SectionTitle label={t('createFarmSectionAnnual')} icon="trending-up-outline" />

      <FieldLabel label={t('createFarmAnnualTargetLabel')} required />
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        placeholder={t('createFarmAnnualTargetPlaceholder')}
        placeholderTextColor={MAVECAM_COLORS.GRAY_LIGHT}
        value={form.annualTarget}
        onChangeText={v => setField('annualTarget', v)}
      />

      <FieldLabel label={t('createFarmStartDateLabel')} />
      <TextInput
        style={styles.input}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={MAVECAM_COLORS.GRAY_LIGHT}
        value={form.startDate}
        onChangeText={v => setField('startDate', v)}
      />

      {/* Section 4 : Économie */}
      <SectionTitle label={t('createFarmSectionEconomy')} icon="cash-outline" />

      <FieldLabel label={t('createFarmFingerlingsLabel')} />
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        placeholder={t('createFarmFingerlingsPlaceholder')}
        placeholderTextColor={MAVECAM_COLORS.GRAY_LIGHT}
        value={form.fingerlingsPrice}
        onChangeText={v => setField('fingerlingsPrice', v)}
      />

      <FieldLabel label={t('createFarmSellingPriceLabel')} />
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        placeholder={t('createFarmSellingPricePlaceholder')}
        placeholderTextColor={MAVECAM_COLORS.GRAY_LIGHT}
        value={form.sellingPrice}
        onChangeText={v => setField('sellingPrice', v)}
      />

      <FieldLabel label={t('createFarmOtherCostsLabel')} />
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        placeholder={t('createFarmOtherCostsPlaceholder')}
        placeholderTextColor={MAVECAM_COLORS.GRAY_LIGHT}
        value={form.otherCosts}
        onChangeText={v => setField('otherCosts', v)}
      />

      {/* CTA */}
      <TouchableOpacity
        style={[styles.ctaBtn, simLoading && styles.ctaBtnDisabled]}
        onPress={handleSimulate}
        disabled={simLoading}
        activeOpacity={0.8}
      >
        {simLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.ctaBtnText}>{t('createFarmSimulateBtn')}</Text>
        )}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ label, icon }: { label: string; icon: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Ionicons name={icon as any} size={18} color={MAVECAM_COLORS.GREEN_PRIMARY} />
      <Text style={styles.sectionTitleText}>{label}</Text>
    </View>
  );
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Text style={styles.fieldLabel}>
      {label}
      {required && <Text style={{ color: MAVECAM_COLORS.ERROR }}> *</Text>}
    </Text>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MAVECAM_COLORS.CREAM,
  },
  content: {
    padding: 16,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: MAVECAM_COLORS.GRAY_DARK,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    textAlign: 'center',
    lineHeight: 20,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 8,
  },
  sectionTitleText: {
    fontSize: 15,
    fontWeight: '600',
    color: MAVECAM_COLORS.GREEN_DARK,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 6,
    marginTop: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  chipSelected: {
    borderColor: MAVECAM_COLORS.GREEN_PRIMARY,
    backgroundColor: '#ecfdf5',
  },
  chipText: {
    fontSize: 13,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 15,
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  capacityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  capacityText: {
    fontSize: 13,
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  capacityValue: {
    fontWeight: '700',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  ctaBtn: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  ctaBtnDisabled: {
    opacity: 0.6,
  },
  ctaBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
