/**
 * CreateFarmScreen — Flux "Créer mon élevage"
 *
 * Le setup est désormais piloté par les unités de production, tout en gardant
 * une couche de compatibilité legacy pour la simulation actuelle.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
  KeyboardAvoidingView,
  type AccessibilityState,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { StackNavigationProp } from '@react-navigation/stack';
import { useDispatch, useSelector } from 'react-redux';

import { useAuth } from '@/hooks/useAuth';
import { createClientUuid } from '@/utils/clientUuid';
import {
  AppHeader,
  AppText,
  Button,
  Card,
  TextField,
} from '@/components/ui';
import { colors, radii, sizing, spacing } from '@/theme';
import { INPUT_LIMITS } from '@/domain/aquaculture/constants';
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
  getRecommendedCycleDuration,
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
  const { farmProfile } = useAuth();
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
    launchRequestId: createClientUuid(),
    species: '',
    infraType: '',
    unitCount: '',
    unitVolume: '',
    unitSurface: '',
    annualTarget: '',
    startDate: todayISO(),
    cycleDuration: '',
    fingerlingsPrice: '',
    sellingPrice: '',
    otherCosts: '',
    fingerlingsCount: '',
    harvestWeight: '',
    survivalRate: '95',
    productionUnits: [],
    productionUnitAllocations: [],
    calibrationUnits: [],
  });
  const [calibrationName, setCalibrationName] = useState('');
  const [calibrationVolume, setCalibrationVolume] = useState('');
  const [singleUnitDraft, setSingleUnitDraft] = useState<UnitDraftState>(getDefaultSingleDraft());
  const [bulkUnitDraft, setBulkUnitDraft] = useState<BulkUnitDraftState>(getDefaultBulkDraft());
  const [singleUnitErrors, setSingleUnitErrors] = useState<ProductionUnitDraftErrors>({});
  const [bulkUnitErrors, setBulkUnitErrors] = useState<BulkUnitDraftErrors>({});
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [singleFormOffsetY, setSingleFormOffsetY] = useState(0);
  const [allocationMode, setAllocationMode] = useState<'auto' | 'manual'>('auto');
  const [isCycleDurationCustomized, setIsCycleDurationCustomized] = useState(false);
  const formErrors = useMemo(() => validateFarmSetupForm(form), [form]);
  const cycleDurationErrorKey = formErrors.cycleDuration;
  const fingerlingsCountLimitError =
    formErrors.fingerlingsCount === 'createFarmFishCountLimitError'
      ? t('createFarmFishCountLimitError', {
          max: formatNumber(INPUT_LIMITS.fishCount.max),
        })
      : undefined;
  const cycleDurationAccessibilityText = cycleDurationErrorKey
    ? t(cycleDurationErrorKey === 'required' ? 'required' : cycleDurationErrorKey)
    : form.cycleDuration
      ? `${form.cycleDuration} ${t('days')}`
      : '';

  const handleGoBack = () => {
    if (navigation.canGoBack?.()) {
      navigation.goBack();
      return;
    }

    navigation.reset({
      index: 0,
      routes: [{ name: 'MainTabs' }],
    });
  };

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
      launchRequestId: '',
      species: t('createFarmSpeciesLabel'),
      infraType: t('createFarmInfraLabel'),
      unitCount: t('createFarmUnitCountLabel'),
      unitVolume: t('createFarmUnitVolumeLabel'),
      unitSurface: t('createFarmUnitSurfaceLabel'),
      annualTarget: t('createFarmCycleProductionLabel'),
      startDate: t('createFarmStartDateLabel'),
      cycleDuration: t('createFarmCycleDurationLabel'),
      fingerlingsPrice: t('createFarmFingerlingsLabel'),
      sellingPrice: t('createFarmSellingPriceLabel'),
      otherCosts: t('createFarmOtherCostsLabel'),
      fingerlingsCount: t('createFarmFingerlingsCountLabel'),
      harvestWeight: t('createFarmHarvestWeightLabel'),
      survivalRate: t('createFarmSurvivalRateLabel'),
      productionUnits: t('createFarmProductionUnitsSectionTitle'),
      productionUnitAllocations: t('createFarmProductionUnitAllocationSectionTitle'),
      calibrationUnits: t('prepareCalibrationTanks'),
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

    const validationErrors = formErrors;
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

    if (errorCode === 'createFarmFishCountLimitError') {
      return `${fieldLabel} : ${t('createFarmFishCountLimitError', {
        max: formatNumber(INPUT_LIMITS.fishCount.max),
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
        if (!isCycleDurationCustomized) {
          next.cycleDuration = String(getRecommendedCycleDuration(value as FarmSetupSpecies));
        }
      }
      return next;
    });
    if (key === 'cycleDuration') {
      setIsCycleDurationCustomized(true);
    }
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

  const addCalibrationUnit = () => {
    const volume = Number(calibrationVolume.replace(',', '.'));
    const normalizedName = calibrationName.trim().toLocaleLowerCase();
    if (
      !normalizedName ||
      !Number.isFinite(volume) ||
      volume <= 0 ||
      (form.calibrationUnits ?? []).some((unit) => unit.name.toLocaleLowerCase() === normalizedName)
    ) {
      Alert.alert(t('error'), t('calibrationLaunchUnitsInvalid'));
      return;
    }
    setForm((current) => ({
      ...current,
      calibrationUnits: [...(current.calibrationUnits ?? []), {
        client_uuid: createClientUuid(),
        name: calibrationName.trim(),
        volume_m3: volume,
      }],
    }));
    setCalibrationName('');
    setCalibrationVolume('');
  };

  const singleDraftUsesSurface = singleUnitDraft.unit_type === 'pond';
  const bulkDraftUsesSurface = bulkUnitDraft.unit_type === 'pond';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <AppHeader title={t('createFarmTitle')} onBack={handleGoBack} backLabel={t('back')} backTestID="createFarmBackButton" />

    <ScrollView
      ref={scrollViewRef}
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Card variant="outlined" style={{ marginBottom: spacing[5] }}>
        <AppText variant="caption" color="muted">{t('currentFarm')}</AppText>
        <AppText variant="cardTitle">{farmProfile?.farm_name || t('farmNotDefined')}</AppText>
      </Card>

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

      <AppText variant="sectionTitle" style={styles.productionUnitsHeading}>
        {t('createFarmProductionUnitsSectionTitle')}
      </AppText>

      {form.productionUnits.length === 0 && (
        <View style={styles.noticeBadge}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.status.warning} />
          <AppText variant="helper" color="warning" style={styles.noticeText}>{t('createFarmAtLeastOneUnitError')}</AppText>
        </View>
      )}

      <View
        style={styles.formCard}
        onLayout={(event) => setSingleFormOffsetY(event.nativeEvent.layout.y)}
      >
        <AppText variant="cardTitle" style={styles.formCardTitle}>
          {editingUnitId ? t('createFarmEditUnitTitle') : t('createFarmAddUnitTitle')}
        </AppText>
        <AppText variant="helper" color="muted" style={styles.formCardDescription}>{t('createFarmAddUnitDescription')}</AppText>

        <FieldLabel label={t('createFarmUnitNameLabel')} required />
        <TextField
          error={singleUnitErrors.name ? t(singleUnitErrors.name) : undefined}
          placeholder={t('createFarmUnitNamePlaceholder')}
          value={singleUnitDraft.name}
          onChangeText={(value) => setSingleUnitDraft((prev) => ({ ...prev, name: value }))}
        />
        {singleUnitErrors.name && <AppText variant="helper" color="error" style={styles.inlineError}>{t(singleUnitErrors.name)}</AppText>}

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
          <AppText variant="helper" color="error" style={styles.inlineError}>{t(singleUnitErrors.unit_type)}</AppText>
        ) : !singleUnitDraft.unit_type ? (
          <AppText variant="helper" color="muted" style={styles.unitTypeHint}>{t('createFarmNoUnitTypeSelected')}</AppText>
        ) : null}

        {singleUnitDraft.unit_type ? (
          singleDraftUsesSurface ? (
            <>
              <FieldLabel label={t('createFarmUnitSurfaceLabel')} required />
              <TextField
                error={singleUnitErrors.surface_m2 ? t(singleUnitErrors.surface_m2) : undefined}
                keyboardType="numeric"
                placeholder={t('createFarmUnitSurfacePlaceholder')}
                value={singleUnitDraft.surface_m2}
                onChangeText={(value) =>
                  setSingleUnitDraft((prev) => ({ ...prev, surface_m2: value }))
                }
              />
              {singleUnitErrors.surface_m2 && (
                <AppText variant="helper" color="error" style={styles.inlineError}>{t(singleUnitErrors.surface_m2)}</AppText>
              )}
            </>
          ) : (
            <>
              <FieldLabel label={t('createFarmUnitVolumeLabel')} required />
              <TextField
                error={singleUnitErrors.volume_m3 ? t(singleUnitErrors.volume_m3) : undefined}
                keyboardType="numeric"
                placeholder={t('createFarmUnitVolumePlaceholder')}
                value={singleUnitDraft.volume_m3}
                onChangeText={(value) =>
                  setSingleUnitDraft((prev) => ({ ...prev, volume_m3: value }))
                }
              />
              {singleUnitErrors.volume_m3 && (
                <AppText variant="helper" color="error" style={styles.inlineError}>{t(singleUnitErrors.volume_m3)}</AppText>
              )}
            </>
          )
        ) : null}

        <View style={styles.formActions}>
          <Button label={editingUnitId ? t('createFarmSaveUnitBtn') : `+ ${t('createFarmAddUnitBtn')}`} onPress={handleSaveSingleUnit} />
          <Button label={t('cancel')} variant="ghost" onPress={resetSingleUnitDraft} />
        </View>
      </View>

      <View style={styles.formCard}>
        <AppText variant="cardTitle" style={styles.formCardTitle}>{t('createFarmAddUnitsIdenticalTitle')}</AppText>
        <AppText variant="helper" color="muted" style={styles.formCardDescription}>{t('createFarmAddUnitsIdenticalDescription')}</AppText>

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
          <AppText variant="helper" color="error" style={styles.inlineError}>{t(bulkUnitErrors.unit_type)}</AppText>
        ) : !bulkUnitDraft.unit_type ? (
          <AppText variant="helper" color="muted" style={styles.unitTypeHint}>{t('createFarmNoUnitTypeSelected')}</AppText>
        ) : null}

        <FieldLabel label={t('createFarmBulkUnitCountLabel')} required />
        <TextField
          error={bulkUnitErrors.count ? t(bulkUnitErrors.count) : undefined}
          keyboardType="numeric"
          placeholder={t('createFarmBulkUnitCountPlaceholder')}
          value={bulkUnitDraft.count}
          onChangeText={(value) =>
            setBulkUnitDraft((prev) => ({ ...prev, count: sanitizePositiveIntegerInput(value) }))
          }
        />
        {bulkUnitErrors.count && <AppText variant="helper" color="error" style={styles.inlineError}>{t(bulkUnitErrors.count)}</AppText>}

        <FieldLabel label={t('createFarmUnitBaseNameLabel')} />
        <TextField
          placeholder={t('createFarmUnitBaseNamePlaceholder')}
          value={bulkUnitDraft.base_name}
          onChangeText={(value) => setBulkUnitDraft((prev) => ({ ...prev, base_name: value }))}
        />

        {bulkUnitDraft.unit_type ? (
          bulkDraftUsesSurface ? (
            <>
              <FieldLabel label={t('createFarmUnitSurfaceLabel')} required />
              <TextField
                error={bulkUnitErrors.surface_m2 ? t(bulkUnitErrors.surface_m2) : undefined}
                keyboardType="numeric"
                placeholder={t('createFarmUnitSurfacePlaceholder')}
                value={bulkUnitDraft.surface_m2}
                onChangeText={(value) =>
                  setBulkUnitDraft((prev) => ({ ...prev, surface_m2: value }))
                }
              />
              {bulkUnitErrors.surface_m2 && (
                <AppText variant="helper" color="error" style={styles.inlineError}>{t(bulkUnitErrors.surface_m2)}</AppText>
              )}
            </>
          ) : (
            <>
              <FieldLabel label={t('createFarmUnitVolumeLabel')} required />
              <TextField
                error={bulkUnitErrors.volume_m3 ? t(bulkUnitErrors.volume_m3) : undefined}
                keyboardType="numeric"
                placeholder={t('createFarmUnitVolumePlaceholder')}
                value={bulkUnitDraft.volume_m3}
                onChangeText={(value) =>
                  setBulkUnitDraft((prev) => ({ ...prev, volume_m3: value }))
                }
              />
              {bulkUnitErrors.volume_m3 && (
                <AppText variant="helper" color="error" style={styles.inlineError}>{t(bulkUnitErrors.volume_m3)}</AppText>
              )}
            </>
          )
        ) : null}

        <View style={styles.formActions}>
          <Button label={`+ ${t('createFarmAddUnitsIdenticalBtn')}`} onPress={handleSaveBulkUnits} />
          <Button label={t('cancel')} variant="ghost" onPress={resetBulkUnitDraft} />
        </View>
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
                    <AppText variant="cardTitle" style={styles.unitCardTitle}>{unit.name}</AppText>
                    <AppText variant="helper" color="muted" style={styles.unitCardMeta}>
                      {t(getUnitTypeLabelKey(unit.unit_type))}{" "}
                      {displayDimension ? `• ${displayDimension}` : ''}
                    </AppText>
                    {capacity !== null && (
                      <AppText variant="helper" color="muted" style={styles.unitCardMeta}>
                        {String(t('createFarmUnitCapacityLabel', {
                          count: formatNumber(Math.round(capacity)),
                        } as any))}
                      </AppText>
                    )}
                  </View>
                </View>

                <View style={styles.unitCardActions}>
                  <Button label={t('createFarmEditUnitAction')} variant="outline" size="small" fullWidth={false} onPress={() => handleEditUnit(unit)} />
                  <Button label={t('createFarmDeleteUnitAction')} variant="danger" size="small" fullWidth={false} onPress={() => handleDeleteUnit(unit.local_id)} />
                </View>
              </View>
            );
          })
        ) : null}
      </View>

      {totalRecommendedCapacity !== null && (
        <View style={styles.capacityBadge}>
          <Ionicons name="checkmark-circle" size={16} color={colors.brand.primary} />
          <AppText variant="helper" style={styles.capacityText}>
            {t('createFarmRecommendedCapacityLabel')} :{' '}
            <AppText variant="helper" color="link" style={styles.capacityValue}>
              {formatNumber(totalRecommendedCapacity)} {t('productionUnitFingerlingsUnit')}
            </AppText>
          </AppText>
        </View>
      )}

      <FieldLabel label={t('createFarmFingerlingsLabel')} />
      <TextField
        placeholder={t('createFarmFingerlingsPlaceholder')}
        keyboardType="numeric"
        value={form.fingerlingsPrice}
        onChangeText={v => setField('fingerlingsPrice', v)}
      />

      <FieldLabel label={t('createFarmFingerlingsCountLabel')} required />
      <TextField
        error={
          fingerlingsCountLimitError ??
          (fingerlingsCoherence?.level === 'error' ? t('error') : undefined)
        }
        keyboardType="numeric"
        placeholder={fingerlingsCountPlaceholder}
        value={form.fingerlingsCount}
        onChangeText={v => setField('fingerlingsCount', sanitizePositiveIntegerInput(v))}
        accessibilityState={
          {
            invalid: Boolean(
              fingerlingsCountLimitError || fingerlingsCoherence?.level === 'error'
            ),
          } as AccessibilityState
        }
        accessibilityLiveRegion="polite"
      />
      {fingerlingsCountLimitError && (
        <AppText
          variant="helper"
          color="error"
          style={styles.inlineError}
          accessibilityLiveRegion="polite"
        >
          {fingerlingsCountLimitError}
        </AppText>
      )}
      {!fingerlingsCountLimitError && stockingDensityCheck && (
        <View style={[
          styles.coherenceBadge,
          stockingDensityCheck.isOk ? styles.coherenceBadgeOk : styles.coherenceBadgeError,
        ]}>
          <AppText
            variant="helper"
            color={stockingDensityCheck.isOk ? 'link' : 'error'}
            style={styles.coherenceText}
          >
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
          </AppText>
        </View>
      )}
      {!fingerlingsCountLimitError && fingerlingsCoherence && (
        <View style={[
          styles.coherenceBadge,
          fingerlingsCapacityStatus?.level === 'ok' && styles.coherenceBadgeOk,
          fingerlingsCapacityStatus?.level === 'warn' && styles.coherenceBadgeWarn,
          fingerlingsCapacityStatus?.level === 'error' && styles.coherenceBadgeError,
        ]}>
          <AppText
            variant="helper"
            style={styles.coherenceText}
            color={fingerlingsCapacityStatus?.level === 'error' ? 'error' : fingerlingsCapacityStatus?.level === 'ok' ? 'link' : 'secondary'}
          >
            {fingerlingsCapacityStatus
              ? t(
                  fingerlingsCapacityStatus.key,
                  fingerlingsCapacityStatus.key === 'createFarmCapacityOver'
                    ? { max: formatNumber(fingerlingsCapacityStatus.maxCycle) }
                    : {}
                )
              : t('createFarmCapacityConsistent')}
          </AppText>
        </View>
      )}

      {form.productionUnits.length > 0 && (
        <>
          <SectionTitle
            label={t('createFarmProductionUnitAllocationSectionTitle')}
            icon="layers-outline"
          />
          <AppText variant="helper" color="muted" style={styles.sectionDescription}>
            {t('createFarmProductionUnitAllocationSectionDescription')}
          </AppText>

          {allocationValidation?.global_error && (
            <View style={styles.allocationNoticeBadge}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.status.error} />
              <AppText variant="helper" color="error" style={styles.allocationNoticeText}>
                {t(allocationValidation.global_error)}
              </AppText>
            </View>
          )}

          {recommendedAllocations !== null && (
            <Button label={t('createFarmProductionUnitAllocationResetBtn')} variant="outline" onPress={resetRecommendedAllocations} />
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
                      <AppText variant="cardTitle" style={styles.unitCardTitle}>{unit.name}</AppText>
                      <AppText variant="helper" color="muted" style={styles.unitCardMeta}>
                        {t(getUnitTypeLabelKey(unit.unit_type))}{" "}
                        {getProductionUnitDisplayDimension(unit)
                          ? `• ${getProductionUnitDisplayDimension(unit)}`
                          : ''}
                      </AppText>
                      <AppText variant="helper" color="muted" style={styles.unitCardMeta}>
                        {t('createFarmProductionUnitRecommendedCapacityLabel')} :{' '}
                        {status.recommended_capacity !== null
                          ? `${formatNumber(Math.round(status.recommended_capacity))} ${t('productionUnitFingerlingsUnit')}`
                          : '—'}
                      </AppText>
                    </View>
                  </View>

                  <FieldLabel
                    label={t('createFarmProductionUnitAssignedFishLabel')}
                    required
                  />
                  <TextField
                    error={allocationError ? t(allocationError) : undefined}
                    keyboardType="numeric"
                    placeholder={t('createFarmProductionUnitAssignedFishPlaceholder')}
                    value={allocationValue}
                    onChangeText={(value) =>
                      handleAllocationChange(unit.local_id, sanitizePositiveIntegerInput(value))
                    }
                  />
                  {allocationError && (
                    <AppText variant="helper" color="error" style={styles.inlineError}>{t(allocationError)}</AppText>
                  )}

                  <View style={styles.allocationMetrics}>
                    <AppText variant="helper" color="muted" style={styles.allocationMetric}>
                      {t('createFarmProductionUnitDensityLabel')} :{' '}
                      {status.density !== null && allocationDensityLabel
                        ? `${formatNumber(status.density)} ${allocationDensityLabel}`
                        : '—'}
                    </AppText>
                    <AppText variant="helper" color="muted" style={styles.allocationMetric}>
                      {t('createFarmProductionUnitEstimatedProductionLabel')} :{' '}
                      {status.estimated_production_kg !== null
                        ? `${formatKgEstimate(status.estimated_production_kg)} kg`
                        : '—'}
                    </AppText>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}

      <FieldLabel label={t('createFarmCycleProductionLabel')} />
      <TextField
        testID="createFarmCycleProductionPreview"
        editable={false}
        selectTextOnFocus={false}
        value={
          cycleProductionEstimate !== null
            ? `${Math.round(cycleProductionEstimate)} kg / cycle`
            : t('createFarmCycleProductionPending')
        }
        numberOfLines={1}
      />
      <AppText variant="helper" color="muted" style={styles.readonlyHelper}>{t('createFarmCycleProductionHelper')}</AppText>

      <FieldLabel label={t('createFarmStartDateLabel')} />
      <TextField
        placeholder={t('createFarmStartDatePlaceholder')}
        value={form.startDate}
        onChangeText={v => setField('startDate', v)}
      />

      <FieldLabel label={t('createFarmCycleDurationLabel')} required />
      <TextField
        testID="createFarmCycleDurationInput"
        error={cycleDurationErrorKey ? t(cycleDurationErrorKey === 'required' ? 'required' : cycleDurationErrorKey) : undefined}
        keyboardType="number-pad"
        placeholder={t(form.species === 'clarias' ? 'createFarmCycleDurationClariasPlaceholder' : 'createFarmCycleDurationTilapiaPlaceholder')}
        value={form.cycleDuration}
        onChangeText={v => setField('cycleDuration', sanitizePositiveIntegerInput(v))}
        accessibilityLabel={t('createFarmCycleDurationLabel')}
        accessibilityHint={t('createFarmCycleDurationHint')}
        accessibilityValue={{
          text: cycleDurationAccessibilityText,
        }}
        accessibilityState={
          { invalid: Boolean(cycleDurationErrorKey) } as AccessibilityState
        }
        accessibilityLiveRegion="polite"
      />
      <AppText variant="helper" color="muted" style={styles.readonlyHelper}>{t('createFarmCycleDurationHint')}</AppText>
      {cycleDurationErrorKey && (
        <AppText variant="helper" color="error" style={styles.inlineError} accessibilityLiveRegion="polite">
          {t(cycleDurationErrorKey === 'required' ? 'required' : cycleDurationErrorKey)}
        </AppText>
      )}

      <FieldLabel label={t('createFarmSellingPriceLabel')} />
      <TextField
        keyboardType="numeric"
        placeholder={t('createFarmSellingPricePlaceholder')}
        value={form.sellingPrice}
        onChangeText={v => setField('sellingPrice', v)}
      />

      <FieldLabel label={t('createFarmHarvestWeightLabel')} />
      <TextField
        keyboardType="numeric"
        placeholder={t('createFarmHarvestWeightPlaceholder')}
        value={form.harvestWeight}
        onChangeText={v => setField('harvestWeight', v)}
      />

      <FieldLabel label={t('createFarmSurvivalRateLabel')} />
      <TextField
        keyboardType="numeric"
        placeholder={t('createFarmSurvivalRatePlaceholder')}
        value={form.survivalRate}
        onChangeText={v => setField('survivalRate', v)}
      />

      <Card variant="outlined" style={styles.calibrationPreparationCard}>
        <AppText variant="cardTitle">{t('prepareCalibrationTanks')}</AppText>
        <AppText color="muted">{t('prepareCalibrationTanksDescription')}</AppText>
        <TextField
          testID="createFarmCalibrationName"
          label={t('calibrationTankName')}
          value={calibrationName}
          onChangeText={setCalibrationName}
        />
        <TextField
          testID="createFarmCalibrationVolume"
          label={t('calibrationTankVolume')}
          value={calibrationVolume}
          onChangeText={setCalibrationVolume}
          keyboardType="decimal-pad"
        />
        <Button
          testID="createFarmAddCalibrationUnit"
          label={t('addCalibrationTankToCycleLaunch')}
          variant="outline"
          iconLeft="cube-outline"
          onPress={addCalibrationUnit}
          disabled={!calibrationName.trim() || !calibrationVolume}
        />
        {(form.calibrationUnits ?? []).map((unit) => (
          <Card key={unit.client_uuid} variant="outlined">
            <AppText variant="bodyStrong">{unit.name}</AppText>
            <AppText>{t('calibrationTankVolumeValue', { volume: unit.volume_m3 })}</AppText>
            <Button
              label={t('remove')}
              variant="outline"
              onPress={() => setForm((current) => ({
                ...current,
                calibrationUnits: (current.calibrationUnits ?? []).filter(
                  (item) => item.client_uuid !== unit.client_uuid
                ),
              }))}
            />
          </Card>
        ))}
      </Card>

      {/* CTA */}
      <Button
        testID="createFarmSimulateButton"
        label={t('createFarmSimulateBtn')}
        onPress={handleSimulate}
        loading={simLoading}
        style={styles.simulateButton}
      />

      <View style={{ height: 40 }} />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ label, icon }: { label: string; icon: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={18} color={colors.brand.primary} />
      <AppText variant="sectionTitle">{label}</AppText>
    </View>
  );
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <AppText variant="label" style={styles.fieldLabel}>
      {label}
      {required && <AppText variant="label" color="error"> *</AppText>}
    </AppText>
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
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.choiceChipPressable}
    >
      {({ pressed }) => (
        <View style={[
          styles.choiceChip,
          selected && styles.choiceChipSelected,
          pressed && styles.choiceChipPressed,
        ]}>
          <AppText variant="label" color={selected ? 'inverse' : 'link'}>
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.page,
  },
  content: {
    padding: 16,
  },
  productionUnitsHeading: {
    marginTop: spacing[5],
    marginBottom: spacing[3],
  },
  choiceChip: {
    minHeight: sizing.touchTargetMinimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.brand.primary,
    borderRadius: radii.lg,
    backgroundColor: colors.surface.card,
    paddingHorizontal: spacing[3],
  },
  choiceChipPressable: {
    alignSelf: 'flex-start',
  },
  choiceChipSelected: {
    backgroundColor: colors.brand.primary,
  },
  choiceChipPressed: {
    opacity: 0.8,
  },
  simulateButton: {
    marginTop: spacing[3],
    backgroundColor: colors.brand.primary,
  },
  calibrationPreparationCard: {
    marginTop: spacing[5],
    gap: spacing[3],
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    paddingBottom: 8,
  },
  sectionDescription: {
    marginBottom: 12,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text.muted,
  },
  noticeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.status.warningSurface,
    borderLeftWidth: 3,
    borderLeftColor: colors.status.warning,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text.secondary,
  },
  formCard: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.surface.card,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  formCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
  formCardDescription: {
    marginTop: 4,
    marginBottom: 8,
    fontSize: 12,
    lineHeight: 17,
    color: colors.text.muted,
  },
  inlineError: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 16,
    color: colors.status.error,
  },
  unitsList: {
    gap: 12,
    marginBottom: 16,
  },
  unitCard: {
    borderRadius: 16,
    backgroundColor: colors.surface.card,
    borderWidth: 1,
    borderColor: colors.border.subtle,
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
    color: colors.text.primary,
  },
  unitCardMeta: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.text.muted,
  },
  unitTypeHint: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 16,
    color: colors.text.muted,
  },
  unitCardActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.primary,
    marginBottom: 6,
    marginTop: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  formActions: {
    gap: spacing[2],
    marginTop: spacing[3],
  },
  coherenceBadge: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderLeftWidth: 3,
  },
  coherenceBadgeOk: {
    backgroundColor: colors.status.successSurface,
    borderLeftColor: colors.brand.primary,
  },
  coherenceBadgeWarn: {
    backgroundColor: colors.status.warningSurface,
    borderLeftColor: colors.status.warning,
  },
  coherenceBadgeError: {
    backgroundColor: colors.status.errorSurface,
    borderLeftColor: colors.status.error,
  },
  coherenceText: {
    fontSize: 12,
    lineHeight: 17,
  },
  capacityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    backgroundColor: colors.status.successSurface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  capacityText: {
    fontSize: 13,
    color: colors.text.primary,
  },
  capacityValue: {
    fontWeight: '700',
    color: colors.brand.primary,
  },
  allocationNoticeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.status.errorSurface,
    borderLeftWidth: 3,
    borderLeftColor: colors.status.error,
  },
  allocationNoticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.status.error,
  },
  allocationUnitsList: {
    gap: 12,
    marginTop: 12,
  },
  allocationUnitCard: {
    borderRadius: 16,
    backgroundColor: colors.surface.card,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: 14,
  },
  allocationMetrics: {
    gap: 4,
    marginTop: 10,
  },
  allocationMetric: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.text.muted,
  },
  readonlyHelper: {
    marginTop: 6,
    marginBottom: 4,
    fontSize: 12,
    color: colors.text.muted,
    lineHeight: 17,
  },
});
