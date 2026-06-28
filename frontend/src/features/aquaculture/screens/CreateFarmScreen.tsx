/**
 * CreateFarmScreen — Flux "Créer mon élevage"
 *
 * Le setup est désormais piloté par les unités de production, tout en gardant
 * une couche de compatibilité legacy pour la simulation actuelle.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { runCycleSimulation } from '@/features/aquaculture/store/farmSetupSlice';
import {
  buildCycleSimulationInput,
  getCycleProductionEstimate,
  hasFarmSetupErrors,
  validateFarmSetupForm,
  getFingerlingsCapacityStatusPreview,
  getFingerlingsCoherencePreview,
  getFingerlingsSuggestionPreview,
  getStockingDensityPreview,
  sanitizePositiveIntegerInput,
  todayISO,
  type FarmSetupFormState,
  type FarmSetupSpecies,
} from '@/features/aquaculture/utils/farmSetupForm';
import {
  createIdenticalProductionUnitDrafts,
  createProductionUnitDraft,
  getProductionUnitAllocationStatus,
  getProductionUnitCapacity,
  getProductionUnitDisplayDimension,
  getProductionUnitsCompatibilitySummary,
  getTotalProductionUnitsCapacity,
  normalizeProductionUnitType,
  suggestProductionUnitFishAllocations,
  validateProductionUnitDraft,
  validateProductionUnitFishAllocations,
  type ProductionUnitDraftErrors,
} from '@/features/aquaculture/utils/productionUnits';
import type {
  ProductionUnitDraft,
  ProductionUnitFishAllocationDraft,
  ProductionUnitType,
} from '@/features/aquaculture/types/productionUnits';

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

const PRODUCTION_UNIT_TYPE_OPTIONS: Array<{
  type: ProductionUnitType;
  labelKey: 'productionUnitTypeTank' | 'productionUnitTypePond' | 'productionUnitTypeCage';
}> = [
  { type: 'tank', labelKey: 'productionUnitTypeTank' },
  { type: 'pond', labelKey: 'productionUnitTypePond' },
  { type: 'cage', labelKey: 'productionUnitTypeCage' },
];

interface UnitDraftState {
  name: string;
  unit_type: ProductionUnitType | null;
  volume_m3: string;
  surface_m2: string;
}

interface BulkUnitDraftState {
  unit_type: ProductionUnitType | null;
  count: string;
  base_name: string;
  volume_m3: string;
  surface_m2: string;
}

type BulkUnitDraftErrors = Partial<Record<'count', string>> & ProductionUnitDraftErrors;

const getDefaultSingleDraft = (): UnitDraftState => ({
  name: '',
  unit_type: null,
  volume_m3: '',
  surface_m2: '',
});

const getDefaultBulkDraft = (): BulkUnitDraftState => ({
  unit_type: null,
  count: '',
  base_name: '',
  volume_m3: '',
  surface_m2: '',
});

const getUnitTypeLabelKey = (
  unitType: ProductionUnitType
): 'productionUnitTypeTank' | 'productionUnitTypePond' | 'productionUnitTypeCage' => {
  if (unitType === 'pond') return 'productionUnitTypePond';
  if (unitType === 'cage') return 'productionUnitTypeCage';
  return 'productionUnitTypeTank';
};

const getAllocationDensityLabelKey = (
  densityUnit: 'm2' | 'm3' | null
): 'productionUnitDensityFingerlingsPerSquareMeter' | 'productionUnitDensityFingerlingsPerCubicMeter' =>
  densityUnit === 'm2'
    ? 'productionUnitDensityFingerlingsPerSquareMeter'
    : 'productionUnitDensityFingerlingsPerCubicMeter';

const areProductionUnitAllocationsEqual = (
  left: ProductionUnitFishAllocationDraft[],
  right: ProductionUnitFishAllocationDraft[]
): boolean =>
  left.length === right.length &&
  left.every(
    (allocation, index) =>
      allocation.production_unit_local_id === right[index]?.production_unit_local_id &&
      allocation.fish_count === right[index]?.fish_count
  );

export default function CreateFarmScreen({ navigation }: Props) {
  const { t, i18n } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const scrollViewRef = useRef<React.ElementRef<typeof ScrollView> | null>(null);
  const { loading: simLoading } = useSelector(
    (s: RootState) => s.farmSetup.cycleSimulation
  );
  const numberLocale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US';
  const formatNumber = (value: number): string => new Intl.NumberFormat(numberLocale).format(value);
  const formatKgEstimate = (value: number): string =>
    new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 1 }).format(value);

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
    productionUnits: [],
    productionUnitAllocations: [],
  });
  const [singleUnitDraft, setSingleUnitDraft] = useState<UnitDraftState>(getDefaultSingleDraft());
  const [bulkUnitDraft, setBulkUnitDraft] = useState<BulkUnitDraftState>(getDefaultBulkDraft());
  const [singleUnitErrors, setSingleUnitErrors] = useState<ProductionUnitDraftErrors>({});
  const [bulkUnitErrors, setBulkUnitErrors] = useState<BulkUnitDraftErrors>({});
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [singleFormOffsetY, setSingleFormOffsetY] = useState(0);
  const [allocationMode, setAllocationMode] = useState<'auto' | 'manual'>('auto');

  useEffect(() => {
    const summary = getProductionUnitsCompatibilitySummary(form.productionUnits);
    setForm((prev) => {
      if (!summary) {
        if (
          prev.infraType === '' &&
          prev.unitCount === '' &&
          prev.unitVolume === '' &&
          prev.unitSurface === ''
        ) {
          return prev;
        }

        return {
          ...prev,
          infraType: '',
          unitCount: '',
          unitVolume: '',
          unitSurface: '',
        };
      }

      const isPond = normalizeProductionUnitType(summary.primary_unit?.unit_type ?? null) === 'pond';
      const nextUnitVolume = isPond ? '' : summary.primary_unit?.volume_m3?.trim() ?? '';
      const nextUnitSurface = isPond ? summary.primary_unit?.surface_m2?.trim() ?? '' : '';

      const nextLegacyValues = {
        infraType: summary.legacy_infrastructure_type,
        unitCount: String(summary.legacy_unit_count),
        unitVolume: nextUnitVolume,
        unitSurface: nextUnitSurface,
      };

      if (
        prev.infraType === nextLegacyValues.infraType &&
        prev.unitCount === nextLegacyValues.unitCount &&
        prev.unitVolume === nextLegacyValues.unitVolume &&
        prev.unitSurface === nextLegacyValues.unitSurface
      ) {
        return prev;
      }

      return {
        ...prev,
        ...nextLegacyValues,
      };
    });
  }, [form.productionUnits]);

  const stockingDensityCheck = useMemo(() => {
    return getStockingDensityPreview(form);
  }, [form]);

  const fingerlingsCoherence = useMemo(() => {
    return getFingerlingsCoherencePreview(form);
  }, [form]);

  const cycleProductionEstimate = useMemo(() => {
    return getCycleProductionEstimate(form);
  }, [form.fingerlingsCount, form.survivalRate, form.harvestWeight, form.species]);

  const fingerlingsCapacityStatus = useMemo(() => {
    return getFingerlingsCapacityStatusPreview(form);
  }, [form]);

  const fingerlingsSuggestion = useMemo(() => {
    return getFingerlingsSuggestionPreview(form);
  }, [form]);

  const totalRecommendedCapacity = useMemo(() => {
    return getTotalProductionUnitsCapacity(form.productionUnits);
  }, [form.productionUnits]);

  const recommendedAllocations = useMemo(() => {
    return suggestProductionUnitFishAllocations({
      productionUnits: form.productionUnits,
      totalFishCount: form.fingerlingsCount,
    });
  }, [form.fingerlingsCount, form.productionUnits]);

  const allocationValidation = useMemo(() => {
    return validateProductionUnitFishAllocations({
      productionUnits: form.productionUnits,
      allocations: form.productionUnitAllocations,
      totalFishCount: form.fingerlingsCount,
      survivalRatePct: form.survivalRate,
      targetWeightG: form.harvestWeight,
    });
  }, [
    form.fingerlingsCount,
    form.harvestWeight,
    form.productionUnitAllocations,
    form.productionUnits,
    form.survivalRate,
  ]);

  const allocationByUnitId = useMemo(
    () => new Map(form.productionUnitAllocations.map((allocation) => [allocation.production_unit_local_id, allocation.fish_count] as const)),
    [form.productionUnitAllocations]
  );

  useEffect(() => {
    if (allocationMode === 'manual') {
      return;
    }

    const nextAllocations = recommendedAllocations ?? [];
    setForm((prev) => {
      if (areProductionUnitAllocationsEqual(prev.productionUnitAllocations, nextAllocations)) {
        return prev;
      }

      return {
        ...prev,
        productionUnitAllocations: nextAllocations,
      };
    });
  }, [allocationMode, recommendedAllocations]);

  const fingerlingsCountPlaceholder = fingerlingsSuggestion
    ? t('createFarmFingerlingsCountPlaceholderMax', {
      max: formatNumber(fingerlingsSuggestion.value),
      })
    : t('createFarmFingerlingsCountPlaceholder');

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
      productionUnits: t('createFarmProductionUnitsSectionTitle'),
      productionUnitAllocations: t('createFarmProductionUnitAllocationSectionTitle'),
    };

    return labelByField[field];
  };

  const clearSingleUnitFieldErrors = () => {
    setSingleUnitErrors((prev) => {
      const next = { ...prev };
      delete next.unit_type;
      delete next.volume_m3;
      delete next.surface_m2;
      return next;
    });
  };

  const clearBulkUnitFieldErrors = () => {
    setBulkUnitErrors((prev) => {
      const next = { ...prev };
      delete next.unit_type;
      delete next.volume_m3;
      delete next.surface_m2;
      return next;
    });
  };

  const scrollToSingleUnitForm = () => {
    if (!singleFormOffsetY) {
      return;
    }

    const scroll = () => {
      scrollViewRef.current?.scrollTo({
        y: Math.max(0, singleFormOffsetY - 12),
        animated: true,
      });
    };

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(scroll);
      return;
    }

    scroll();
  };

  const validateSingleUnitDraft = (
    draft: UnitDraftState
  ): ProductionUnitDraftErrors => {
    if (!draft.unit_type) {
      return {
        ...(draft.name.trim() ? {} : { name: 'required' }),
        unit_type: 'createFarmNoUnitTypeSelected',
      };
    }

    return validateProductionUnitDraft({
      local_id: editingUnitId ?? 'draft-unit',
      name: draft.name.trim(),
      unit_type: draft.unit_type,
      volume_m3: draft.unit_type === 'pond' ? '' : draft.volume_m3.trim(),
      surface_m2: draft.unit_type === 'pond' ? draft.surface_m2.trim() : '',
    });
  };

  const validateBulkUnitDraft = (): BulkUnitDraftErrors => {
    const count = Number.parseInt(bulkUnitDraft.count.trim(), 10);
    const countError = !bulkUnitDraft.count.trim() || !Number.isInteger(count) || count <= 0
      ? 'createFarmPositiveIntegerError'
      : undefined;

    if (!bulkUnitDraft.unit_type) {
      return {
        count: countError,
        unit_type: 'createFarmNoUnitTypeSelected',
      };
    }

    const validationErrors = validateProductionUnitDraft({
      local_id: 'draft-bulk-unit',
      name: bulkUnitDraft.base_name.trim() || 'bulk',
      unit_type: bulkUnitDraft.unit_type,
      volume_m3: bulkUnitDraft.unit_type === 'pond' ? '' : bulkUnitDraft.volume_m3.trim(),
      surface_m2: bulkUnitDraft.unit_type === 'pond' ? bulkUnitDraft.surface_m2.trim() : '',
    });
    delete validationErrors.name;

    return {
      ...validationErrors,
      count: countError,
    };
  };

  const getFirstValidationMessage = (): string | null => {
    if (form.productionUnits.length === 0) {
      return t('createFarmAtLeastOneUnitError');
    }

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

  const resetSingleUnitDraft = () => {
    setSingleUnitDraft(getDefaultSingleDraft());
    setSingleUnitErrors({});
    setEditingUnitId(null);
  };

  const resetBulkUnitDraft = () => {
    setBulkUnitDraft(getDefaultBulkDraft());
    setBulkUnitErrors({});
  };

  const getUnitsOfTypeCount = (unitType: ProductionUnitType): number =>
    form.productionUnits.filter(
      (unit) => normalizeProductionUnitType(unit.unit_type) === unitType
    ).length;

  const syncProductionUnits = (nextUnits: ProductionUnitDraft[]) => {
    setForm((prev) => ({
      ...prev,
      productionUnits: nextUnits,
    }));
  };

  const handleSaveSingleUnit = () => {
    const validationErrors = validateSingleUnitDraft(singleUnitDraft);
    setSingleUnitErrors(validationErrors);

    if (Object.values(validationErrors).some(Boolean)) {
      return;
    }

    const nextDraft = createProductionUnitDraft({
      local_id: editingUnitId ?? `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: singleUnitDraft.name.trim(),
      unit_type: singleUnitDraft.unit_type ?? 'tank',
      volume_m3: singleUnitDraft.unit_type === 'pond' ? '' : singleUnitDraft.volume_m3.trim(),
      surface_m2: singleUnitDraft.unit_type === 'pond' ? singleUnitDraft.surface_m2.trim() : '',
    });

    const normalizedUnits = editingUnitId
      ? form.productionUnits.map((unit) => (unit.local_id === editingUnitId ? nextDraft : unit))
      : [...form.productionUnits, nextDraft];

    syncProductionUnits(normalizedUnits);
    resetSingleUnitDraft();
  };

  const handleSaveBulkUnits = () => {
    const validationErrors = validateBulkUnitDraft();
    setBulkUnitErrors(validationErrors);

    if (Object.values(validationErrors).some(Boolean)) {
      return;
    }

    const unitType = bulkUnitDraft.unit_type;
    if (!unitType) {
      return;
    }

    const count = Number.parseInt(bulkUnitDraft.count.trim(), 10);
    const nextIndex = getUnitsOfTypeCount(unitType) + 1;
    const prefix = bulkUnitDraft.base_name.trim() || t(getUnitTypeLabelKey(unitType));
    const bulkUnits = createIdenticalProductionUnitDrafts({
      unitType,
      count,
      namePrefix: prefix,
      volumeM3: bulkUnitDraft.volume_m3.trim(),
      surfaceM2: bulkUnitDraft.surface_m2.trim(),
      startIndex: nextIndex,
    });

    syncProductionUnits([...form.productionUnits, ...bulkUnits]);
    resetBulkUnitDraft();
  };

  const handleEditUnit = (unit: ProductionUnitDraft) => {
    setEditingUnitId(unit.local_id);
    setSingleUnitDraft({
      name: unit.name,
      unit_type: unit.unit_type,
      volume_m3: unit.volume_m3 ?? '',
      surface_m2: unit.surface_m2 ?? '',
    });
    setSingleUnitErrors({});
    scrollToSingleUnitForm();
  };

  const handleDeleteUnit = (unitId: string) => {
    const nextUnits = form.productionUnits.filter((unit) => unit.local_id !== unitId);
    syncProductionUnits(nextUnits);
    if (editingUnitId === unitId) {
      resetSingleUnitDraft();
    }
  };

  const handleAllocationChange = (unitId: string, fishCount: string) => {
    setAllocationMode('manual');
    setForm((prev) => {
      const nextAllocations = prev.productionUnitAllocations.some(
        (allocation) => allocation.production_unit_local_id === unitId
      )
        ? prev.productionUnitAllocations.map((allocation) =>
            allocation.production_unit_local_id === unitId
              ? { ...allocation, fish_count: fishCount }
              : allocation
          )
        : [...prev.productionUnitAllocations, { production_unit_local_id: unitId, fish_count: fishCount }];

      return {
        ...prev,
        productionUnitAllocations: nextAllocations,
      };
    });
  };

  const resetRecommendedAllocations = () => {
    setAllocationMode('auto');
    setForm((prev) => ({
      ...prev,
      productionUnitAllocations: recommendedAllocations ?? [],
    }));
  };

  const getAllocationValidationMessage = (): string | null => {
    if (!allocationValidation) {
      return null;
    }

    if (allocationValidation.global_error) {
      return t(allocationValidation.global_error);
    }

    const firstErrorUnit = form.productionUnits.find(
      (unit) => allocationValidation.unit_errors[unit.local_id]
    );
    if (!firstErrorUnit) {
      return null;
    }

    const errorKey = allocationValidation.unit_errors[firstErrorUnit.local_id];
    if (!errorKey) {
      return null;
    }

    return `${firstErrorUnit.name} : ${t(errorKey)}`;
  };

  const handleSingleDraftTypeChange = (unitType: ProductionUnitType) => {
    setSingleUnitDraft((prev) => ({
      ...prev,
      unit_type: prev.unit_type === unitType ? null : unitType,
      volume_m3: prev.unit_type === unitType ? '' : unitType === 'pond' ? '' : prev.volume_m3,
      surface_m2: prev.unit_type === unitType ? '' : unitType === 'pond' ? prev.surface_m2 : '',
    }));
    clearSingleUnitFieldErrors();
  };

  const handleBulkDraftTypeChange = (unitType: ProductionUnitType) => {
    setBulkUnitDraft((prev) => ({
      ...prev,
      unit_type: prev.unit_type === unitType ? null : unitType,
      volume_m3: prev.unit_type === unitType ? '' : unitType === 'pond' ? '' : prev.volume_m3,
      surface_m2: prev.unit_type === unitType ? '' : unitType === 'pond' ? prev.surface_m2 : '',
    }));
    clearBulkUnitFieldErrors();
  };

  async function handleSimulate() {
    const firstValidationMessage = getFirstValidationMessage();
    if (firstValidationMessage) {
      Alert.alert(t('error'), firstValidationMessage);
      return;
    }

    const allocationValidationMessage = getAllocationValidationMessage();
    if (allocationValidationMessage) {
      Alert.alert(t('error'), allocationValidationMessage);
      return;
    }

    const params = buildCycleSimulationInput(form);

    const result = await dispatch(runCycleSimulation(params));
    if (runCycleSimulation.fulfilled.match(result)) {
      navigation.navigate('CycleSimulation', { formData: form });
    } else {
      const errorMessage =
        typeof result.payload === 'string' && result.payload.trim()
          ? result.payload
          : t('simulationErrorRetry');
      Alert.alert(t('error'), errorMessage);
    }
  }

  const singleDraftUsesSurface = singleUnitDraft.unit_type === 'pond';
  const bulkDraftUsesSurface = bulkUnitDraft.unit_type === 'pond';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
    <ScrollView
      ref={scrollViewRef}
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

      <SectionTitle label={t('createFarmProductionUnitsSectionTitle')} icon="layers-outline" />
      <Text style={styles.sectionDescription}>{t('createFarmProductionUnitsSectionDescription')}</Text>

      {form.productionUnits.length === 0 && (
        <View style={styles.noticeBadge}>
          <Ionicons name="alert-circle-outline" size={16} color={AQUACARE_COLORS.WARNING} />
          <Text style={styles.noticeText}>{t('createFarmAtLeastOneUnitError')}</Text>
        </View>
      )}

      <View
        style={styles.formCard}
        onLayout={(event) => setSingleFormOffsetY(event.nativeEvent.layout.y)}
      >
        <Text style={styles.formCardTitle}>
          {editingUnitId ? t('createFarmEditUnitTitle') : t('createFarmAddUnitTitle')}
        </Text>
        <Text style={styles.formCardDescription}>{t('createFarmAddUnitDescription')}</Text>

        <FieldLabel label={t('createFarmUnitNameLabel')} required />
        <TextInput
          style={[styles.input, singleUnitErrors.name && styles.inputError]}
          placeholder={t('createFarmUnitNamePlaceholder')}
          placeholderTextColor={AQUACARE_COLORS.GRAY_LIGHT}
          value={singleUnitDraft.name}
          onChangeText={(value) => setSingleUnitDraft((prev) => ({ ...prev, name: value }))}
        />
        {singleUnitErrors.name && <Text style={styles.inlineError}>{t(singleUnitErrors.name)}</Text>}

        <FieldLabel label={t('createFarmUnitTypeLabel')} required />
        <View style={styles.chipRow}>
          {PRODUCTION_UNIT_TYPE_OPTIONS.map(({ type, labelKey }) => (
            <Chip
              key={type}
              label={t(labelKey)}
              selected={singleUnitDraft.unit_type === type}
              onPress={() => handleSingleDraftTypeChange(type)}
            />
          ))}
        </View>
        {singleUnitErrors.unit_type ? (
          <Text style={styles.inlineError}>{t(singleUnitErrors.unit_type)}</Text>
        ) : !singleUnitDraft.unit_type ? (
          <Text style={styles.unitTypeHint}>{t('createFarmNoUnitTypeSelected')}</Text>
        ) : null}

        {singleUnitDraft.unit_type ? (
          singleDraftUsesSurface ? (
            <>
              <FieldLabel label={t('createFarmUnitSurfaceLabel')} required />
              <TextInput
                style={[styles.input, singleUnitErrors.surface_m2 && styles.inputError]}
                keyboardType="numeric"
                placeholder={t('createFarmUnitSurfacePlaceholder')}
                placeholderTextColor={AQUACARE_COLORS.GRAY_LIGHT}
                value={singleUnitDraft.surface_m2}
                onChangeText={(value) =>
                  setSingleUnitDraft((prev) => ({ ...prev, surface_m2: value }))
                }
              />
              {singleUnitErrors.surface_m2 && (
                <Text style={styles.inlineError}>{t(singleUnitErrors.surface_m2)}</Text>
              )}
            </>
          ) : (
            <>
              <FieldLabel label={t('createFarmUnitVolumeLabel')} required />
              <TextInput
                style={[styles.input, singleUnitErrors.volume_m3 && styles.inputError]}
                keyboardType="numeric"
                placeholder={t('createFarmUnitVolumePlaceholder')}
                placeholderTextColor={AQUACARE_COLORS.GRAY_LIGHT}
                value={singleUnitDraft.volume_m3}
                onChangeText={(value) =>
                  setSingleUnitDraft((prev) => ({ ...prev, volume_m3: value }))
                }
              />
              {singleUnitErrors.volume_m3 && (
                <Text style={styles.inlineError}>{t(singleUnitErrors.volume_m3)}</Text>
              )}
            </>
          )
        ) : null}

        <TouchableOpacity style={styles.primaryMiniBtn} onPress={handleSaveSingleUnit} activeOpacity={0.8}>
          <Text style={styles.primaryMiniBtnText}>
            {editingUnitId ? t('createFarmSaveUnitBtn') : `+ ${t('createFarmAddUnitBtn')}`}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkBtn} onPress={resetSingleUnitDraft} activeOpacity={0.8}>
          <Text style={styles.linkBtnText}>{t('cancel')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.formCardTitle}>{t('createFarmAddUnitsIdenticalTitle')}</Text>
        <Text style={styles.formCardDescription}>{t('createFarmAddUnitsIdenticalDescription')}</Text>

        <FieldLabel label={t('createFarmUnitTypeLabel')} required />
        <View style={styles.chipRow}>
          {PRODUCTION_UNIT_TYPE_OPTIONS.map(({ type, labelKey }) => (
            <Chip
              key={type}
              label={t(labelKey)}
              selected={bulkUnitDraft.unit_type === type}
              onPress={() => handleBulkDraftTypeChange(type)}
            />
          ))}
        </View>
        {bulkUnitErrors.unit_type ? (
          <Text style={styles.inlineError}>{t(bulkUnitErrors.unit_type)}</Text>
        ) : !bulkUnitDraft.unit_type ? (
          <Text style={styles.unitTypeHint}>{t('createFarmNoUnitTypeSelected')}</Text>
        ) : null}

        <FieldLabel label={t('createFarmBulkUnitCountLabel')} required />
        <TextInput
          style={[styles.input, bulkUnitErrors.count && styles.inputError]}
          keyboardType="numeric"
          placeholder={t('createFarmBulkUnitCountPlaceholder')}
          placeholderTextColor={AQUACARE_COLORS.GRAY_LIGHT}
          value={bulkUnitDraft.count}
          onChangeText={(value) =>
            setBulkUnitDraft((prev) => ({ ...prev, count: sanitizePositiveIntegerInput(value) }))
          }
        />
        {bulkUnitErrors.count && <Text style={styles.inlineError}>{t(bulkUnitErrors.count)}</Text>}

        <FieldLabel label={t('createFarmUnitBaseNameLabel')} />
        <TextInput
          style={styles.input}
          placeholder={t('createFarmUnitBaseNamePlaceholder')}
          placeholderTextColor={AQUACARE_COLORS.GRAY_LIGHT}
          value={bulkUnitDraft.base_name}
          onChangeText={(value) => setBulkUnitDraft((prev) => ({ ...prev, base_name: value }))}
        />

        {bulkUnitDraft.unit_type ? (
          bulkDraftUsesSurface ? (
            <>
              <FieldLabel label={t('createFarmUnitSurfaceLabel')} required />
              <TextInput
                style={[styles.input, bulkUnitErrors.surface_m2 && styles.inputError]}
                keyboardType="numeric"
                placeholder={t('createFarmUnitSurfacePlaceholder')}
                placeholderTextColor={AQUACARE_COLORS.GRAY_LIGHT}
                value={bulkUnitDraft.surface_m2}
                onChangeText={(value) =>
                  setBulkUnitDraft((prev) => ({ ...prev, surface_m2: value }))
                }
              />
              {bulkUnitErrors.surface_m2 && (
                <Text style={styles.inlineError}>{t(bulkUnitErrors.surface_m2)}</Text>
              )}
            </>
          ) : (
            <>
              <FieldLabel label={t('createFarmUnitVolumeLabel')} required />
              <TextInput
                style={[styles.input, bulkUnitErrors.volume_m3 && styles.inputError]}
                keyboardType="numeric"
                placeholder={t('createFarmUnitVolumePlaceholder')}
                placeholderTextColor={AQUACARE_COLORS.GRAY_LIGHT}
                value={bulkUnitDraft.volume_m3}
                onChangeText={(value) =>
                  setBulkUnitDraft((prev) => ({ ...prev, volume_m3: value }))
                }
              />
              {bulkUnitErrors.volume_m3 && (
                <Text style={styles.inlineError}>{t(bulkUnitErrors.volume_m3)}</Text>
              )}
            </>
          )
        ) : null}

        <TouchableOpacity style={styles.secondaryMiniBtn} onPress={handleSaveBulkUnits} activeOpacity={0.8}>
          <Text style={styles.secondaryMiniBtnText}>+ {t('createFarmAddUnitsIdenticalBtn')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkBtn} onPress={resetBulkUnitDraft} activeOpacity={0.8}>
          <Text style={styles.linkBtnText}>{t('cancel')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.unitsList}>
        {form.productionUnits.length > 0 ? (
          form.productionUnits.map((unit) => {
            const displayDimension = getProductionUnitDisplayDimension(unit);
            const capacity = getProductionUnitCapacity(unit);

            return (
              <View key={unit.local_id} style={styles.unitCard}>
                <View style={styles.unitCardHeader}>
                  <View style={styles.unitCardHeaderText}>
                    <Text style={styles.unitCardTitle}>{unit.name}</Text>
                    <Text style={styles.unitCardMeta}>
                      {t(getUnitTypeLabelKey(unit.unit_type))}{" "}
                      {displayDimension ? `• ${displayDimension}` : ''}
                    </Text>
                    {capacity !== null && (
                      <Text style={styles.unitCardMeta}>
                        {String(t('createFarmUnitCapacityLabel', {
                          count: formatNumber(Math.round(capacity)),
                        } as any))}
                      </Text>
                    )}
                  </View>
                </View>

                <View style={styles.unitCardActions}>
                  <TouchableOpacity
                    style={styles.unitActionBtn}
                    onPress={() => handleEditUnit(unit)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.unitActionBtnText}>{t('createFarmEditUnitAction')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.unitActionBtn, styles.unitDeleteBtn]}
                    onPress={() => handleDeleteUnit(unit.local_id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.unitActionBtnText, styles.unitDeleteBtnText]}>
                      {t('createFarmDeleteUnitAction')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        ) : null}
      </View>

      {totalRecommendedCapacity !== null && (
        <View style={styles.capacityBadge}>
          <Ionicons name="checkmark-circle" size={16} color={AQUACARE_COLORS.GREEN_PRIMARY} />
          <Text style={styles.capacityText}>
            {t('createFarmRecommendedCapacityLabel')} :{' '}
            <Text style={styles.capacityValue}>
              {formatNumber(totalRecommendedCapacity)} {t('productionUnitFingerlingsUnit')}
            </Text>
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
        placeholder={fingerlingsCountPlaceholder}
        placeholderTextColor={AQUACARE_COLORS.GRAY_LIGHT}
        value={form.fingerlingsCount}
        onChangeText={v => setField('fingerlingsCount', sanitizePositiveIntegerInput(v))}
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
          fingerlingsCapacityStatus?.level === 'ok' && styles.coherenceBadgeOk,
          fingerlingsCapacityStatus?.level === 'warn' && styles.coherenceBadgeWarn,
          fingerlingsCapacityStatus?.level === 'error' && styles.coherenceBadgeError,
        ]}>
          <Text style={[
            styles.coherenceText,
            fingerlingsCapacityStatus?.level === 'ok' && styles.coherenceTextOk,
            fingerlingsCapacityStatus?.level === 'warn' && styles.coherenceTextWarn,
            fingerlingsCapacityStatus?.level === 'error' && styles.coherenceTextError,
          ]}>
            {fingerlingsCapacityStatus
              ? t(
                  fingerlingsCapacityStatus.key,
                  fingerlingsCapacityStatus.key === 'createFarmCapacityOver'
                    ? { max: formatNumber(fingerlingsCapacityStatus.maxCycle) }
                    : {}
                )
              : t('createFarmCapacityConsistent')}
          </Text>
        </View>
      )}

      {form.productionUnits.length > 0 && (
        <>
          <SectionTitle
            label={t('createFarmProductionUnitAllocationSectionTitle')}
            icon="layers-outline"
          />
          <Text style={styles.sectionDescription}>
            {t('createFarmProductionUnitAllocationSectionDescription')}
          </Text>

          {allocationValidation?.global_error && (
            <View style={styles.allocationNoticeBadge}>
              <Ionicons name="alert-circle-outline" size={16} color={AQUACARE_COLORS.ERROR} />
              <Text style={styles.allocationNoticeText}>
                {t(allocationValidation.global_error)}
              </Text>
            </View>
          )}

          {recommendedAllocations !== null && (
            <TouchableOpacity
              style={styles.secondaryMiniBtn}
              onPress={resetRecommendedAllocations}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryMiniBtnText}>
                {t('createFarmProductionUnitAllocationResetBtn')}
              </Text>
            </TouchableOpacity>
          )}

          <View style={styles.allocationUnitsList}>
            {form.productionUnits.map((unit, index) => {
              const allocationValue = allocationByUnitId.get(unit.local_id) ?? '';
              const status =
                allocationValidation?.unit_statuses[index] ??
                getProductionUnitAllocationStatus({
                  unit,
                  productionUnitLocalId: unit.local_id,
                  allocation: allocationValue,
                  survivalRatePct: form.survivalRate,
                  targetWeightG: form.harvestWeight,
                });
              const allocationError = allocationValidation?.unit_errors[unit.local_id] ?? null;
              const allocationDensityLabel = status.density_unit
                ? t(getAllocationDensityLabelKey(status.density_unit))
                : null;

              return (
                <View key={unit.local_id} style={styles.allocationUnitCard}>
                  <View style={styles.unitCardHeader}>
                    <View style={styles.unitCardHeaderText}>
                      <Text style={styles.unitCardTitle}>{unit.name}</Text>
                      <Text style={styles.unitCardMeta}>
                        {t(getUnitTypeLabelKey(unit.unit_type))}{" "}
                        {getProductionUnitDisplayDimension(unit)
                          ? `• ${getProductionUnitDisplayDimension(unit)}`
                          : ''}
                      </Text>
                      <Text style={styles.unitCardMeta}>
                        {t('createFarmProductionUnitRecommendedCapacityLabel')} :{' '}
                        {status.recommended_capacity !== null
                          ? `${formatNumber(Math.round(status.recommended_capacity))} ${t('productionUnitFingerlingsUnit')}`
                          : '—'}
                      </Text>
                    </View>
                  </View>

                  <FieldLabel
                    label={t('createFarmProductionUnitAssignedFishLabel')}
                    required
                  />
                  <TextInput
                    style={[styles.input, allocationError && styles.inputError]}
                    keyboardType="numeric"
                    placeholder={t('createFarmProductionUnitAssignedFishPlaceholder')}
                    placeholderTextColor={AQUACARE_COLORS.GRAY_LIGHT}
                    value={allocationValue}
                    onChangeText={(value) =>
                      handleAllocationChange(unit.local_id, sanitizePositiveIntegerInput(value))
                    }
                  />
                  {allocationError && (
                    <Text style={styles.inlineError}>{t(allocationError)}</Text>
                  )}

                  <View style={styles.allocationMetrics}>
                    <Text style={styles.allocationMetric}>
                      {t('createFarmProductionUnitDensityLabel')} :{' '}
                      {status.density !== null && allocationDensityLabel
                        ? `${formatNumber(status.density)} ${allocationDensityLabel}`
                        : '—'}
                    </Text>
                    <Text style={styles.allocationMetric}>
                      {t('createFarmProductionUnitEstimatedProductionLabel')} :{' '}
                      {status.estimated_production_kg !== null
                        ? `${formatKgEstimate(status.estimated_production_kg)} kg`
                        : '—'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </>
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
  sectionDescription: {
    marginBottom: 12,
    fontSize: 13,
    lineHeight: 18,
    color: AQUACARE_COLORS.GRAY_LIGHT,
  },
  noticeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#fffbeb',
    borderLeftWidth: 3,
    borderLeftColor: AQUACARE_COLORS.WARNING,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#92400e',
  },
  formCard: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dbe4ee',
  },
  formCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  formCardDescription: {
    marginTop: 4,
    marginBottom: 8,
    fontSize: 12,
    lineHeight: 17,
    color: AQUACARE_COLORS.GRAY_LIGHT,
  },
  inlineError: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 16,
    color: AQUACARE_COLORS.ERROR,
  },
  primaryMiniBtn: {
    marginTop: 14,
    borderRadius: 12,
    backgroundColor: AQUACARE_COLORS.GREEN_PRIMARY,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryMiniBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryMiniBtn: {
    marginTop: 14,
    borderRadius: 12,
    backgroundColor: '#ecfdf5',
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: AQUACARE_COLORS.GREEN_PRIMARY,
  },
  secondaryMiniBtnText: {
    color: AQUACARE_COLORS.GREEN_PRIMARY,
    fontSize: 14,
    fontWeight: '700',
  },
  linkBtn: {
    marginTop: 8,
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  linkBtnText: {
    color: AQUACARE_COLORS.GREEN_PRIMARY,
    fontSize: 13,
    fontWeight: '600',
  },
  unitsList: {
    gap: 12,
    marginBottom: 16,
  },
  unitCard: {
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dbe4ee',
    padding: 14,
  },
  unitCardHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 12,
  },
  unitCardHeaderText: {
    flex: 1,
    gap: 4,
  },
  unitCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  unitCardMeta: {
    fontSize: 12,
    lineHeight: 16,
    color: AQUACARE_COLORS.GRAY_LIGHT,
  },
  unitTypeHint: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 16,
    color: AQUACARE_COLORS.GRAY_LIGHT,
  },
  unitCardActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  unitActionBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: AQUACARE_COLORS.GREEN_PRIMARY,
  },
  unitDeleteBtn: {
    backgroundColor: '#fef2f2',
    borderColor: AQUACARE_COLORS.ERROR,
  },
  unitActionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: AQUACARE_COLORS.GREEN_PRIMARY,
  },
  unitDeleteBtnText: {
    color: AQUACARE_COLORS.ERROR,
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
  allocationNoticeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#fef2f2',
    borderLeftWidth: 3,
    borderLeftColor: AQUACARE_COLORS.ERROR,
  },
  allocationNoticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#991b1b',
  },
  allocationUnitsList: {
    gap: 12,
    marginTop: 12,
  },
  allocationUnitCard: {
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dbe4ee',
    padding: 14,
  },
  allocationMetrics: {
    gap: 4,
    marginTop: 10,
  },
  allocationMetric: {
    fontSize: 12,
    lineHeight: 17,
    color: AQUACARE_COLORS.GRAY_LIGHT,
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
