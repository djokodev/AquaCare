/**
 * CreateFarmScreen — Flux "Créer mon élevage"
 *
 * Formulaire cycle-first affiché après les slides d'onboarding (première connexion)
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
  KeyboardAvoidingView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { StackNavigationProp } from '@react-navigation/stack';
import { useDispatch, useSelector } from 'react-redux';

import { AQUACARE_COLORS } from '@/constants/colors';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { AppDispatch, RootState } from '@/store/store';
import { runAnnualSimulation } from '@/features/aquaculture/store/farmSetupSlice';
import {
  buildAnnualSimulationInput,
  getCycleProductionEstimate,
  hasFarmSetupErrors,
  validateFarmSetupForm,
  getFingerlingsCoherencePreview,
  getStockingDensityPreview,
  getTotalCapacityPreview,
  todayISO,
  type FarmSetupFormState,
  type FarmSetupInfraType,
  type FarmSetupSpecies,
} from '@/features/aquaculture/utils/farmSetupForm';

type NavigationProp = StackNavigationProp<RootStackParamList, 'CreateFarm'>;

interface Props {
  navigation: NavigationProp;
}

const SELLING_PRICE_DEFAULTS: Record<string, string> = {
  tilapia: '2800',
  clarias: '2000',
  autre: '2800',
};

const FINGERLINGS_DEFAULTS: Record<string, string> = {
  tilapia: '50',
  clarias: '75',
  autre: '50',
};

const HARVEST_WEIGHT_DEFAULTS: Record<string, string> = {
  tilapia: '350',
  clarias: '400',
  autre: '350',
};

export default function CreateFarmScreen({ navigation }: Props) {
  const { t, i18n } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const { loading: simLoading } = useSelector(
    (s: RootState) => s.farmSetup.annualSimulation
  );
  const numberLocale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US';
  const formatNumber = (value: number): string => new Intl.NumberFormat(numberLocale).format(value);

  const [form, setForm] = useState<FarmSetupFormState>({
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
    fingerlingsCount: '',
    harvestWeight: '',
    survivalRate: '95',
  });

  const stockingDensityCheck = useMemo(() => {
    return getStockingDensityPreview(form);
  }, [form.fingerlingsCount, form.infraType, form.unitCount, form.unitVolume, form.unitSurface]);

  const fingerlingsCoherence = useMemo(() => {
    return getFingerlingsCoherencePreview(form);
  }, [form.fingerlingsCount, form.infraType, form.unitCount, form.unitSurface, form.unitVolume]);

  const totalCapacity = useMemo(() => {
    return getTotalCapacityPreview(form);
  }, [form.infraType, form.unitCount, form.unitVolume, form.unitSurface]);

  const cycleProductionEstimate = useMemo(() => {
    return getCycleProductionEstimate(form);
  }, [form.fingerlingsCount, form.survivalRate, form.harvestWeight, form.species]);

  const fingerlingsCapacityStatus = useMemo(() => {
    if (!fingerlingsCoherence) {
      return null;
    }

    const ratio = fingerlingsCoherence.count / fingerlingsCoherence.maxCycle;
    if (ratio < 0.7) {
      return { key: 'createFarmCapacityUnderused', params: {} };
    }
    if (ratio < 0.9) {
      return { key: 'createFarmCapacityConsistent', params: {} };
    }
    if (ratio <= 1) {
      return { key: 'createFarmCapacityNearMax', params: {} };
    }

    return {
      key: 'createFarmCapacityOver',
      params: { max: formatNumber(fingerlingsCoherence.maxCycle) },
    };
  }, [fingerlingsCoherence, formatNumber]);

  const getFieldLabel = (field: keyof FarmSetupFormState): string => {
    const labelByField: Record<keyof FarmSetupFormState, string> = {
      species: t('createFarmSpeciesLabel'),
      infraType: t('createFarmInfraLabel'),
      unitCount: t('createFarmUnitCountLabel'),
      unitVolume: t('createFarmUnitVolumeLabel'),
      unitSurface: t('createFarmUnitSurfaceLabel'),
      annualTarget: t('createFarmCycleProductionLabel'),
      startDate: t('createFarmStartDateLabel'),
      fingerlingsPrice: t('createFarmFingerlingsLabel'),
      sellingPrice: t('createFarmSellingPriceLabel'),
      otherCosts: t('createFarmOtherCostsLabel'),
      fingerlingsCount: t('createFarmFingerlingsCountLabel'),
      harvestWeight: t('createFarmHarvestWeightLabel'),
      survivalRate: t('createFarmSurvivalRateLabel'),
    };

    return labelByField[field];
  };

  const getFirstValidationMessage = (): string | null => {
    const validationErrors = validateFarmSetupForm(form);
    if (!hasFarmSetupErrors(validationErrors)) {
      return null;
    }

    const firstErrorEntry = (Object.keys(validationErrors) as (keyof FarmSetupFormState)[])
      .find((field) => Boolean(validationErrors[field]));
    if (!firstErrorEntry) {
      return t('createFarmRequiredFieldsError');
    }

    const errorCode = validationErrors[firstErrorEntry];
    if (!errorCode) {
      return t('createFarmRequiredFieldsError');
    }

    const fieldLabel = getFieldLabel(firstErrorEntry);
    if (errorCode === 'createFarmStockingDensityError' && fingerlingsCoherence) {
      return `${fieldLabel} : ${t('createFarmFingerlingsCoherenceError', {
        count: fingerlingsCoherence.count,
        max: formatNumber(fingerlingsCoherence.maxCycle),
      })}`;
    }

    const reason =
      errorCode === 'required'
        ? t('required')
        : t(errorCode);

    return `${fieldLabel} : ${reason}`;
  };

  function setField(key: keyof FarmSetupFormState, value: string) {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      // Pré-remplir les prix par défaut quand l'espèce change
      if (key === 'species' && value) {
        // Toujours pré-remplir quand l'espèce change — l'utilisateur peut modifier ensuite
        next.sellingPrice = SELLING_PRICE_DEFAULTS[value] ?? '2800';
        next.fingerlingsPrice = FINGERLINGS_DEFAULTS[value] ?? '50';
        next.harvestWeight = HARVEST_WEIGHT_DEFAULTS[value] ?? '350';
      }
      return next;
    });
  }

  async function handleSimulate() {
    const firstValidationMessage = getFirstValidationMessage();
    if (firstValidationMessage) {
      Alert.alert(t('error'), firstValidationMessage);
      return;
    }

    const params = buildAnnualSimulationInput(form);

    const result = await dispatch(runAnnualSimulation(params));
    if (runAnnualSimulation.fulfilled.match(result)) {
      navigation.navigate('AnnualSimulation', { formData: form });
    } else {
      const errorMessage =
        typeof result.payload === 'string' && result.payload.trim()
          ? result.payload
          : t('simulationErrorRetry');
      Alert.alert(t('error'), errorMessage);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <FieldLabel label={t('createFarmSpeciesLabel')} required />
      <View style={styles.chipRow}>
        {(['tilapia', 'clarias'] as FarmSetupSpecies[]).map(sp => (
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
          ] as [FarmSetupInfraType, string][]
        ).map(([val, key]) => (
          <Chip
            key={val}
            label={t(key as any)}
            selected={form.infraType === val}
            onPress={() => setField('infraType', val)}
          />
        ))}
      </View>

      <FieldLabel label={t('createFarmUnitCountLabel')} required />
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        placeholder={t('createFarmUnitCountPlaceholder')}
        placeholderTextColor={AQUACARE_COLORS.GRAY_LIGHT}
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
            placeholderTextColor={AQUACARE_COLORS.GRAY_LIGHT}
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
            placeholderTextColor={AQUACARE_COLORS.GRAY_LIGHT}
            value={form.unitVolume}
            onChangeText={v => setField('unitVolume', v)}
          />
        </>
      ) : null}

      {totalCapacity && (
        <View style={styles.capacityBadge}>
          <Ionicons name="checkmark-circle" size={16} color={AQUACARE_COLORS.GREEN_PRIMARY} />
          <Text style={styles.capacityText}>
            {t('createFarmTotalCapacity')} : <Text style={styles.capacityValue}>{totalCapacity}</Text>
          </Text>
        </View>
      )}

      <FieldLabel label={t('createFarmFingerlingsLabel')} />
      <TextInput
        style={styles.input}
        placeholder={t('createFarmFingerlingsPlaceholder')}
        placeholderTextColor={AQUACARE_COLORS.GRAY_LIGHT}
        keyboardType="numeric"
        value={form.fingerlingsPrice}
        onChangeText={v => setField('fingerlingsPrice', v)}
      />

      <FieldLabel label={t('createFarmFingerlingsCountLabel')} required />
      <TextInput
        style={[
          styles.input,
          fingerlingsCoherence?.level === 'error' && styles.inputError,
        ]}
        keyboardType="numeric"
        placeholder={t('createFarmFingerlingsCountPlaceholder')}
        placeholderTextColor={AQUACARE_COLORS.GRAY_LIGHT}
        value={form.fingerlingsCount}
        onChangeText={v => setField('fingerlingsCount', v)}
      />
      {stockingDensityCheck && (
        <View style={[
          styles.coherenceBadge,
          stockingDensityCheck.isOk ? styles.coherenceBadgeOk : styles.coherenceBadgeError,
        ]}>
          <Text style={[
            styles.coherenceText,
            stockingDensityCheck.isOk ? styles.coherenceTextOk : styles.coherenceTextError,
          ]}>
            {stockingDensityCheck.isOk
              ? t('createFarmStockingDensityOk', {
                  density: formatNumber(Math.round(stockingDensityCheck.density)),
                  unit: stockingDensityCheck.unit,
                })
              : t('createFarmStockingDensityError', {
                  density: formatNumber(Math.round(stockingDensityCheck.density)),
                  unit: stockingDensityCheck.unit,
                  max: formatNumber(stockingDensityCheck.max),
                })
            }
          </Text>
        </View>
      )}
      {fingerlingsCoherence && (
        <View style={[
          styles.coherenceBadge,
          fingerlingsCoherence.level === 'ok' && styles.coherenceBadgeOk,
          fingerlingsCoherence.level === 'warn' && styles.coherenceBadgeWarn,
          fingerlingsCoherence.level === 'error' && styles.coherenceBadgeError,
        ]}>
          <Text style={[
            styles.coherenceText,
            fingerlingsCoherence.level === 'ok' && styles.coherenceTextOk,
            fingerlingsCoherence.level === 'warn' && styles.coherenceTextWarn,
            fingerlingsCoherence.level === 'error' && styles.coherenceTextError,
          ]}>
            {t(
              fingerlingsCapacityStatus?.key ?? 'createFarmCapacityConsistent',
              fingerlingsCapacityStatus?.params ?? {}
            )}
          </Text>
        </View>
      )}

      <FieldLabel label={t('createFarmCycleProductionLabel')} />
      <TextInput
        style={[styles.input, styles.readonlyInput]}
        editable={false}
        selectTextOnFocus={false}
        value={
          cycleProductionEstimate !== null
            ? `${Math.round(cycleProductionEstimate)} kg / cycle`
            : t('createFarmCycleProductionPending')
        }
      />
      <Text style={styles.readonlyHelper}>{t('createFarmCycleProductionHelper')}</Text>

      <FieldLabel label={t('createFarmStartDateLabel')} />
      <TextInput
        style={styles.input}
        placeholder={t('createFarmStartDatePlaceholder')}
        placeholderTextColor={AQUACARE_COLORS.GRAY_LIGHT}
        value={form.startDate}
        onChangeText={v => setField('startDate', v)}
      />

      <FieldLabel label={t('createFarmSellingPriceLabel')} />
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        placeholder={t('createFarmSellingPricePlaceholder')}
        placeholderTextColor={AQUACARE_COLORS.GRAY_LIGHT}
        value={form.sellingPrice}
        onChangeText={v => setField('sellingPrice', v)}
      />

      <FieldLabel label={t('createFarmHarvestWeightLabel')} />
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        placeholder={t('createFarmHarvestWeightPlaceholder')}
        placeholderTextColor={AQUACARE_COLORS.GRAY_LIGHT}
        value={form.harvestWeight}
        onChangeText={v => setField('harvestWeight', v)}
      />

      <FieldLabel label={t('createFarmSurvivalRateLabel')} />
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        placeholder={t('createFarmSurvivalRatePlaceholder')}
        placeholderTextColor={AQUACARE_COLORS.GRAY_LIGHT}
        value={form.survivalRate}
        onChangeText={v => setField('survivalRate', v)}
      />

      {/* CTA */}
      <TouchableOpacity
        style={[styles.ctaBtn, simLoading && styles.ctaBtnDisabled]}
        onPress={handleSimulate}
        disabled={simLoading}
        activeOpacity={0.8}
      >
        {simLoading ? (
          <ActivityIndicator color={AQUACARE_COLORS.WHITE} />
        ) : (
          <Text style={styles.ctaBtnText}>{t('createFarmSimulateBtn')}</Text>
        )}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ label, icon }: { label: string; icon: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Ionicons name={icon as any} size={18} color={AQUACARE_COLORS.GREEN_PRIMARY} />
      <Text style={styles.sectionTitleText}>{label}</Text>
    </View>
  );
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Text style={styles.fieldLabel}>
      {label}
      {required && <Text style={{ color: AQUACARE_COLORS.ERROR }}> *</Text>}
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
    backgroundColor: AQUACARE_COLORS.CREAM,
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
    color: AQUACARE_COLORS.GRAY_DARK,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: AQUACARE_COLORS.GRAY_LIGHT,
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
    color: AQUACARE_COLORS.GREEN_DARK,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: AQUACARE_COLORS.GRAY_DARK,
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
    borderColor: AQUACARE_COLORS.GREEN_PRIMARY,
    backgroundColor: '#ecfdf5',
  },
  chipText: {
    fontSize: 13,
    color: AQUACARE_COLORS.GRAY_LIGHT,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: AQUACARE_COLORS.GREEN_PRIMARY,
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
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  inputError: {
    borderColor: AQUACARE_COLORS.ERROR,
  },
  coherenceBadge: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderLeftWidth: 3,
  },
  coherenceBadgeOk: {
    backgroundColor: '#ecfdf5',
    borderLeftColor: AQUACARE_COLORS.GREEN_PRIMARY,
  },
  coherenceBadgeWarn: {
    backgroundColor: '#fffbeb',
    borderLeftColor: AQUACARE_COLORS.WARNING,
  },
  coherenceBadgeError: {
    backgroundColor: '#fef2f2',
    borderLeftColor: AQUACARE_COLORS.ERROR,
  },
  coherenceText: {
    fontSize: 12,
    lineHeight: 17,
  },
  coherenceTextOk: {
    color: AQUACARE_COLORS.GREEN_DARK,
  },
  coherenceTextWarn: {
    color: '#92400e',
  },
  coherenceTextError: {
    color: AQUACARE_COLORS.ERROR,
    fontWeight: '600',
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
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  capacityValue: {
    fontWeight: '700',
    color: AQUACARE_COLORS.GREEN_PRIMARY,
  },
  readonlyInput: {
    backgroundColor: '#f8fafc',
    color: AQUACARE_COLORS.GRAY_DARK,
    borderColor: '#dbe4ee',
  },
  readonlyHelper: {
    marginTop: 6,
    marginBottom: 4,
    fontSize: 12,
    color: AQUACARE_COLORS.GRAY_LIGHT,
    lineHeight: 17,
  },
  ctaBtn: {
    backgroundColor: AQUACARE_COLORS.GREEN_PRIMARY,
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
