import React, { useState, useEffect } from "react";
import { Alert, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StackNavigationProp } from "@react-navigation/stack";
import { RouteProp } from "@react-navigation/native";
import { useDispatch } from "react-redux";
import {
  getBusinessIsoDate,
  getOngoingCycleSchedule,
  inclusiveDaysBetween,
} from "@/utils/businessDate";

import { useAuth } from "@/hooks/useAuth";
import { AppDispatch } from "@/store/store";
import { fetchDashboardData } from "@/features/aquaculture/store/aquacultureSlice";
import { aquacultureService } from "@/features/aquaculture/services/aquacultureService";
import {
  AdditionalCycleLaunchError,
  buildAdditionalCycleLaunchRequest,
  validateAdditionalCycleLaunch,
} from "@/features/aquaculture/services/additionalCycleLaunchService";
import {
  AppHeader,
  AppText,
  Button,
  Card,
  EmptyState,
  ErrorState,
  InlineAlert,
  LoadingState,
  Screen,
  SegmentedControl,
  SelectableCard,
  TextField,
} from "@/components/ui";
import { spacing } from "@/theme";
import {
  estimateBiomass,
  estimateDensityWithUnit,
} from "@/domain/aquaculture/estimators";
import {
  parseApiError,
  logApiError,
  isNetworkError,
} from "@/utils/errorParser";
import { RootStackParamList } from "@/navigation/MainNavigator";
import {
  NewCycleData,
  ECONOMIC_DEFAULTS,
  parseFormNumber,
  buildCyclePayload,
  buildSimulatorPrefill,
} from "@/features/aquaculture/utils/newCycleForm";
import { runSilentOfflineSync } from "@/features/aquaculture/services/aquacultureWorkflowService";
import { offlineService } from "@/services/offlineService";
import {
  getProductionUnitCapacity,
  getProductionUnitDensityUnit,
  getProductionUnitDisplayDimension,
} from "@/features/aquaculture/utils/productionUnits";
import { createClientUuid } from "@/utils/clientUuid";
import { hydrateNewCycleFormFromLaunch } from "@/features/aquaculture/utils/launchHydration";
import { cycleLaunchReferenceCache } from "@/features/aquaculture/services/cycleLaunchReferenceCache";
import { buildPendingLaunchLocalContext } from "@/features/aquaculture/services/cycleLaunchLocalContext";
import { TRANSACTIONAL_LAUNCH_ERROR_KEYS } from "@/features/aquaculture/utils/aquacultureErrorPresenter";
import type {
  CycleLaunchCalibrationUnitInput,
  CycleLaunchOpeningStockInput,
  FarmFeedReference,
  ProductionUnit,
} from "@/types/aquaculture";

const SPECIES_OPTIONS = [
  { value: "clarias", labelKey: "clarias", durationDays: 120 },
  { value: "tilapia", labelKey: "tilapia", durationDays: 180 },
] as const;

type NewCycleScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "NewCycle"
>;
type NewCycleScreenRouteProp = RouteProp<RootStackParamList, "NewCycle">;

interface NewCycleScreenProps {
  navigation: NewCycleScreenNavigationProp;
  route?: NewCycleScreenRouteProp;
}

export default function NewCycleScreen({ navigation, route }: NewCycleScreenProps) {
  const { t } = useTranslation();
  const { farmProfile } = useAuth();
  const dispatch = useDispatch<AppDispatch>();

  const offlineLaunch = route?.params?.offlineLaunch;
  const offlineLaunchContext = route?.params?.offlineLaunchContext;
  const editingOfflineLaunchId = route?.params?.editingOfflineLaunchId;
  const [formData, setFormData] = useState<NewCycleData>(() =>
    offlineLaunch
      ? hydrateNewCycleFormFromLaunch(offlineLaunch)
      : ({
    onboarding_mode: "new",
    cycle_name: "",
    species: "",
    pond_identifier: "",
    pond_surface_m2: "",
    pond_volume_m3: "",
    infrastructure_type: [],
    initial_count: "",
    initial_average_weight: "",
    start_date: getBusinessIsoDate(),
    target_harvest_weight_g: "",
    planned_cycle_duration_days: "",
    expected_survival_rate_pct: "",
    planned_selling_price_per_kg_fcfa: "",
    fingerlings_cost_fcfa: "0",
    other_operational_costs_fcfa: "0",
    tracking_start_date: getBusinessIsoDate(),
    tracking_start_count: "",
    tracking_start_average_weight: "",
    tracking_start_biomass: "",
    initial_feed_stocks: [],
        } satisfies NewCycleData)
  );
  const [saving, setSaving] = useState(false);
  const [availableUnits, setAvailableUnits] = useState<ProductionUnit[]>(
    () => offlineLaunchContext?.productionUnits ?? [],
  );
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>(() =>
    (offlineLaunch?.production_units ?? [])
      .map((unit) => unit.production_unit_id)
      .filter((id): id is string => Boolean(id)),
  );
  const [allocationsByUnitId, setAllocationsByUnitId] = useState<
    Record<string, string>
  >(() => {
    if (!offlineLaunch) return {};
    const unitIdByLocalId = new Map(
      offlineLaunch.production_units
        .filter((unit) => unit.production_unit_id)
        .map((unit) => [unit.local_id, unit.production_unit_id as string]),
    );
    return Object.fromEntries(
      offlineLaunch.allocations.flatMap((allocation) => {
        const unitId = unitIdByLocalId.get(allocation.production_unit_local_id);
        return unitId ? [[unitId, String(allocation.fish_count)]] : [];
      }),
    );
  });
  const [loadingUnits, setLoadingUnits] = useState(true);
  const [unitsLoadError, setUnitsLoadError] = useState(false);
  const [offlineReferencesEmpty, setOfflineReferencesEmpty] = useState(false);
  const [unavailablePendingUnitIds, setUnavailablePendingUnitIds] = useState<
    string[]
  >([]);
  const [
    unavailablePendingFeedReferenceIds,
    setUnavailablePendingFeedReferenceIds,
  ] = useState<string[]>([]);
  const [launchRequestId] = useState(
    () => offlineLaunch?.launch_uuid ?? createClientUuid(),
  );
  const [calibrationUnits, setCalibrationUnits] = useState<CycleLaunchCalibrationUnitInput[]>(
    () => offlineLaunch?.calibration_units ?? [],
  );
  const [calibrationName, setCalibrationName] = useState("");
  const [calibrationVolume, setCalibrationVolume] = useState("");
  const [feedReferences, setFeedReferences] = useState<FarmFeedReference[]>(
    () => offlineLaunchContext?.feedReferences ?? [],
  );
  const [stockReferenceMode, setStockReferenceMode] = useState<"existing" | "external">("external");
  const [stockReferenceId, setStockReferenceId] = useState("");
  const [stockName, setStockName] = useState("");
  const [stockPelletSize, setStockPelletSize] = useState("");
  const [stockQuantity, setStockQuantity] = useState("");
  const [stockCostStatus, setStockCostStatus] = useState<"known" | "unknown">("unknown");
  const [stockCost, setStockCost] = useState("");
  const [stockNote, setStockNote] = useState("");

  const handleGoBack = () => {
    if (navigation.canGoBack?.()) {
      navigation.goBack();
      return;
    }

    navigation.reset({
      index: 0,
      routes: [{ name: "MainTabs" }],
    });
  };

  const getSelectedSpecies = () =>
    SPECIES_OPTIONS.find((option) => option.value === formData.species);

  const estimateInitialBiomass = () => {
    const count = parseFormNumber(formData.initial_count);
    const weight = parseFormNumber(formData.initial_average_weight);
    return estimateBiomass(count, weight).toFixed(2);
  };

  const estimateDensityValue = () => {
    const biomass = parseFormNumber(estimateInitialBiomass());
    const volume = parseFormNumber(formData.pond_volume_m3) || undefined;
    const surface = parseFormNumber(formData.pond_surface_m2) || undefined;
    const { value, unit } = estimateDensityWithUnit(biomass, volume, surface);
    return { value: value.toFixed(2), unit };
  };

  const applyEconomicDefaults = (species: "clarias" | "tilapia") => {
    const defaults = ECONOMIC_DEFAULTS[species];
    setFormData((prev) => ({
      ...prev,
      species,
      target_harvest_weight_g: String(defaults.target_harvest_weight_g),
      planned_cycle_duration_days: String(defaults.planned_cycle_duration_days),
      expected_survival_rate_pct: String(defaults.expected_survival_rate_pct),
      planned_selling_price_per_kg_fcfa: String(
        defaults.planned_selling_price_per_kg_fcfa,
      ),
      fingerlings_cost_fcfa: prev.fingerlings_cost_fcfa || "0",
      other_operational_costs_fcfa: prev.other_operational_costs_fcfa || "0",
    }));
  };

  const generateCycleName = () => {
    const species = getSelectedSpecies();
    const now = new Date();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    const year = now.getFullYear();

    if (species && formData.pond_identifier) {
      const name = `${t(species.labelKey)} ${formData.pond_identifier} Q${quarter} ${year}`;
      setFormData((prev) => ({ ...prev, cycle_name: name }));
    }
  };

  useEffect(() => {
    if (formData.species && formData.pond_identifier) {
      generateCycleName();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.species, formData.pond_identifier]);

  useEffect(() => {
    const bootstrap = async () => {
      if (!editingOfflineLaunchId) {
        await runSilentOfflineSync();
      }
      dispatch(fetchDashboardData({ lightweight: true }));
      const farmProfileId = farmProfile?.id;
      const cached = farmProfileId
        ? await cycleLaunchReferenceCache.load(farmProfileId)
        : null;
      const pendingUnitSnapshots = (
        offlineLaunchContext?.productionUnits ?? []
      ).filter(
        (unit) => !farmProfileId || unit.farm_profile === farmProfileId,
      );
      const pendingFeedSnapshots = (
        offlineLaunchContext?.feedReferences ?? []
      ).filter(
        (reference) =>
          !farmProfileId || reference.farm_profile === farmProfileId,
      );
      if (cached) {
        setAvailableUnits([
          ...cached.productionUnits,
          ...pendingUnitSnapshots.filter(
            (unit) =>
              !cached.productionUnits.some((cachedUnit) => cachedUnit.id === unit.id),
          ),
        ]);
        setFeedReferences(cached.feedReferences);
      } else {
        setAvailableUnits(pendingUnitSnapshots);
        setFeedReferences([]);
      }
      const cachedFeedIds = new Set(
        (cached?.feedReferences ?? []).map((reference) => reference.id),
      );
      const usedPendingFeedIds = new Set(
        (offlineLaunch?.initial_feed_stocks ?? [])
          .map((stock) => stock.feed_reference_id)
          .filter((id): id is string => Boolean(id)),
      );
      setUnavailablePendingFeedReferenceIds(
        pendingFeedSnapshots
          .filter(
            (reference) =>
              usedPendingFeedIds.has(reference.id)
              && !cachedFeedIds.has(reference.id),
          )
          .map((reference) => reference.id),
      );
      setLoadingUnits(false);
      if (!(await offlineService.isOnline())) {
        const hasOfflineUnits =
          (cached?.productionUnits.length ?? 0) > 0
          || (offlineLaunchContext?.productionUnits?.length ?? 0) > 0;
        setUnitsLoadError(false);
        setOfflineReferencesEmpty(
          !hasOfflineUnits && (cached?.feedReferences.length ?? 0) === 0,
        );
        return;
      }
      setOfflineReferencesEmpty(false);
      try {
        const serverUnits = await aquacultureService.getProductionUnits({
          status: "active",
          purpose: "production",
        });
        const pendingSnapshots = editingOfflineLaunchId
          ? (offlineLaunchContext?.productionUnits ?? []).filter(
              (snapshot) =>
                (!farmProfileId || snapshot.farm_profile === farmProfileId)
                && selectedUnitIds.includes(snapshot.id)
                && !serverUnits.some((unit) => unit.id === snapshot.id),
            )
          : [];
        setAvailableUnits([...serverUnits, ...pendingSnapshots]);
        setUnavailablePendingUnitIds(
          pendingSnapshots.map((snapshot) => snapshot.id),
        );
        if (farmProfileId) {
          await cycleLaunchReferenceCache.cacheProductionUnits(
            farmProfileId,
            serverUnits,
          );
        }
        setUnitsLoadError(false);
      } catch {
        setUnitsLoadError(
          (cached?.productionUnits.length ?? 0) === 0
          && (offlineLaunchContext?.productionUnits?.length ?? 0) === 0,
        );
      }
      if (farmProfileId) {
        try {
          const serverReferences =
            await aquacultureService.getFarmFeedReferences(farmProfileId);
          setFeedReferences(serverReferences);
          const pendingReferenceIds = editingOfflineLaunchId
            ? (offlineLaunch?.initial_feed_stocks ?? [])
                .map((stock) => stock.feed_reference_id)
                .filter((id): id is string => Boolean(id))
                .filter(
                  (id) =>
                    !serverReferences.some((reference) => reference.id === id),
                )
            : [];
          setUnavailablePendingFeedReferenceIds(pendingReferenceIds);
          await cycleLaunchReferenceCache.cacheFeedReferences(
            farmProfileId,
            serverReferences,
          );
        } catch {
          // Cached references remain available when their refresh fails.
        }
      }
    };
    void bootstrap();
  }, [
    dispatch,
    editingOfflineLaunchId,
    farmProfile?.id,
    offlineLaunchContext?.productionUnits?.length,
  ]);

  const selectedUnits = availableUnits.filter((unit) =>
    selectedUnitIds.includes(unit.id),
  );
  const pendingFeedReferenceSnapshots =
    offlineLaunchContext?.feedReferences ?? [];
  const validationErrorKey = validateAdditionalCycleLaunch({
    formData,
    selectedUnits,
    allocationsByUnitId,
    calibrationUnits,
  });
  const isFormValid = validationErrorKey === null;

  const toggleUnit = (unit: ProductionUnit) => {
    setSelectedUnitIds((current) => {
      if (current.includes(unit.id)) {
        setAllocationsByUnitId((allocations) => {
          const next = { ...allocations };
          delete next[unit.id];
          return next;
        });
        return current.filter((id) => id !== unit.id);
      }
      return [...current, unit.id];
    });
  };

  const handleSave = async () => {
    const currentValidationError = validateAdditionalCycleLaunch({
      formData,
      selectedUnits,
      allocationsByUnitId,
      calibrationUnits,
    });
    if (currentValidationError) {
      Alert.alert(t("error"), t(currentValidationError));
      return;
    }

    setSaving(true);
    const payload = buildAdditionalCycleLaunchRequest({
      formData,
      selectedUnits,
      allocationsByUnitId,
      launchUuid: launchRequestId,
      calibrationUnits,
    });
    const localContext = buildPendingLaunchLocalContext({
      selectedUnits,
      currentFeedReferences: feedReferences,
      previousFeedReferenceSnapshots: pendingFeedReferenceSnapshots,
      initialFeedStocks: payload.initial_feed_stocks ?? [],
      farmProfileId: farmProfile?.id,
    });
    try {
      if (editingOfflineLaunchId) {
        await offlineService.updatePendingCycleLaunch(
          editingOfflineLaunchId,
          {
            ...payload,
            cycle: { ...payload.cycle, created_offline: true },
          },
          {
            localContext,
          },
        );
        Alert.alert(t("saved"), t("cycleLaunchPendingSync"));
        handleGoBack();
        return;
      }
      if (!(await offlineService.isOnline())) {
        await offlineService.saveCycleLaunchOffline({
          ...payload,
          cycle: { ...payload.cycle, created_offline: true },
        }, {
          localContext,
        });
        Alert.alert(t("saved"), t("cycleLaunchPendingSync"));
        handleGoBack();
        return;
      }
      const launchResult = await aquacultureService.launchProductionCycle(payload);
      dispatch(fetchDashboardData({ lightweight: true }));

      const backendSellingPrice =
        launchResult.productionCycle.planned_selling_price_per_kg_fcfa;
      const prefill = formData.onboarding_mode === "ongoing"
        ? {
            species: launchResult.productionCycle.species === "clarias"
              ? ("catfish" as const)
              : ("tilapia" as const),
            initial_fish_count:
              launchResult.productionCycle.tracking_start_count
              ?? launchResult.productionCycle.current_count,
            initial_weight_g: Number(
              launchResult.productionCycle.tracking_start_average_weight,
            ),
            target_weight_g: Number(
              launchResult.productionCycle.target_harvest_weight_g ?? 0,
            ),
            cycle_duration_days: inclusiveDaysBetween(
              launchResult.productionCycle.tracking_start_date
                ?? launchResult.productionCycle.start_date,
              launchResult.productionCycle.planned_harvest_date ?? "",
            ),
            survival_rate: Number(
              launchResult.productionCycle.expected_survival_rate_pct ?? 95,
            ) / 100,
            selling_price_per_kg_fcfa: Number(backendSellingPrice ?? 0),
            fingerlings_cost_fcfa: Number(
              launchResult.productionCycle.fingerlings_cost_fcfa ?? 0,
            ),
            other_costs_fcfa: Number(
              launchResult.productionCycle.other_operational_costs_fcfa ?? 0,
            ),
          }
        : buildSimulatorPrefill({
            ...buildCyclePayload(formData),
            planned_selling_price_per_kg_fcfa:
              backendSellingPrice === undefined
                ? undefined
                : Number(backendSellingPrice),
          });
      Alert.alert(t("success"), t("cycleCreatedSuccess"), [
        {
          text: t("ok"),
          onPress: () =>
            navigation.replace("CycleSimulator", {
              cycleId: launchResult.productionCycle.id,
              prefill,
            }),
        },
      ]);
    } catch (error: unknown) {
      if (error instanceof AdditionalCycleLaunchError) {
        Alert.alert(t("error"), t(error.translationKey));
        return;
      }
      if (isNetworkError(error)) {
        await offlineService.saveCycleLaunchOffline(payload, {
          attempted: true,
          localContext,
        });
        Alert.alert(t("saved"), t("cycleLaunchPendingAfterAttempt"));
        return;
      }
      const parsedError = parseApiError(error);
      logApiError(error, "Creation cycle de production");
      const translatedError = parsedError.code
        ? TRANSACTIONAL_LAUNCH_ERROR_KEYS[parsedError.code]
        : undefined;
      Alert.alert(
        t("error"),
        translatedError ? t(translatedError) : parsedError.message,
        [{ text: t("ok"), style: "cancel" }],
      );
    } finally {
      setSaving(false);
    }
  };

  const addOpeningStock = () => {
    const localId = createClientUuid();
    const common = {
      local_id: localId,
      quantity_kg: stockQuantity.replace(",", "."),
      cost_status: stockCostStatus,
      total_cost_fcfa:
        stockCostStatus === "known" ? stockCost.replace(",", ".") : null,
      note: stockNote.trim(),
    } satisfies Omit<
      CycleLaunchOpeningStockInput,
      "feed_reference_id" | "external_feed"
    >;
    const stock: CycleLaunchOpeningStockInput =
      stockReferenceMode === "existing"
        ? { ...common, feed_reference_id: stockReferenceId }
        : {
            ...common,
            external_feed: {
              client_uuid: createClientUuid(),
              name: stockName.trim(),
              pellet_size_mm: stockPelletSize.replace(",", "."),
              brand: "",
            },
          };
    if (
      !(Number(stock.quantity_kg) > 0) ||
      (stockCostStatus === "known" && !(Number(stock.total_cost_fcfa) >= 0)) ||
      (stockReferenceMode === "existing" ? !stockReferenceId : !stockName.trim() || !(Number(stockPelletSize) > 0))
    ) {
      Alert.alert(t("error"), t("openingStockInvalid"));
      return;
    }
    setFormData((current) => ({
      ...current,
      initial_feed_stocks: [...current.initial_feed_stocks, stock],
    }));
    setStockQuantity("");
    setStockCost("");
    setStockNote("");
  };

  const numberSuffix = (label: string) => (
    <AppText variant="caption" color="link">{label}</AppText>
  );

  const addCalibrationUnit = () => {
    const volume = Number(calibrationVolume.replace(",", "."));
    const normalizedName = calibrationName.trim().toLocaleLowerCase();
    if (
      !normalizedName ||
      !Number.isFinite(volume) ||
      volume <= 0 ||
      calibrationUnits.some((unit) => unit.name.toLocaleLowerCase() === normalizedName)
    ) {
      Alert.alert(t("error"), t("calibrationLaunchUnitsInvalid"));
      return;
    }
    setCalibrationUnits((current) => [...current, {
      client_uuid: createClientUuid(),
      name: calibrationName.trim(),
      volume_m3: volume,
    }]);
    setCalibrationName("");
    setCalibrationVolume("");
  };

  return (
    <View style={{ flex: 1 }}>
      <AppHeader title={t("newCycleTitle")} onBack={handleGoBack} backLabel={t("back")} />
      <Screen scroll scrollProps={{ contentContainerStyle: { padding: spacing[4] } }}>
        <View style={{ gap: spacing[5] }}>
          <Card variant="outlined"><AppText variant="cardTitle">{farmProfile?.farm_name || t("farmNotDefined")}</AppText></Card>
          <View style={{ gap: spacing[3] }}>
            <AppText variant="sectionTitle">{t("cycleOnboardingMode")}</AppText>
            <SegmentedControl
              value={formData.onboarding_mode}
              options={[
                { value: "new", label: t("newCycleMode") },
                { value: "ongoing", label: t("ongoingCycleMode") },
              ]}
              onChange={(onboarding_mode) =>
                setFormData((current) => ({ ...current, onboarding_mode }))
              }
            />
          </View>
          <View style={{ gap: spacing[3] }}>
            <AppText variant="sectionTitle">{t("speciesSelection")}</AppText>
            <SegmentedControl
              value={formData.species as "clarias" | "tilapia"}
              options={SPECIES_OPTIONS.map(({ value, labelKey }) => ({ value, label: t(labelKey) }))}
              onChange={applyEconomicDefaults}
            />
          </View>
          <View style={{ gap: spacing[3] }}>
            <AppText variant="sectionTitle">{t("prepareCalibrationTanks")}</AppText>
            <AppText color="muted">{t("prepareCalibrationTanksDescription")}</AppText>
            <TextField testID="newCycleCalibrationName" label={t("calibrationTankName")} value={calibrationName} onChangeText={setCalibrationName} />
            <TextField testID="newCycleCalibrationVolume" label={t("calibrationTankVolume")} value={calibrationVolume} onChangeText={setCalibrationVolume} keyboardType="decimal-pad" />
            <Button testID="newCycleAddCalibrationUnit" label={t("addCalibrationTankToCycleLaunch")} variant="outline" onPress={addCalibrationUnit} disabled={!calibrationName.trim() || !calibrationVolume} />
            {calibrationUnits.map((unit) => (
              <Card key={unit.client_uuid} variant="outlined">
                <AppText variant="cardTitle">{unit.name}</AppText>
                <AppText>{t("calibrationTankVolumeValue", { volume: unit.volume_m3 })}</AppText>
                <Button label={t("remove")} variant="outline" onPress={() => setCalibrationUnits((current) => current.filter((item) => item.client_uuid !== unit.client_uuid))} />
              </Card>
            ))}
          </View>
          <View style={{ gap: spacing[3] }}>
            <AppText variant="sectionTitle">{t("newCycleSelectUnitsTitle")}</AppText>
            <AppText color="muted">{t("newCycleSelectUnitsDescription")}</AppText>
            {loadingUnits ? <LoadingState compact message={t("productionUnitsLoading")} /> : null}
            {unitsLoadError ? <ErrorState compact message={t("productionUnitsLoadError")} /> : null}
            {offlineReferencesEmpty ? <EmptyState compact message={t("cycleLaunchOfflineReferencesEmpty")} /> : null}
            {unavailablePendingUnitIds.length > 0 ? (
              <InlineAlert
                tone="warning"
                message={t("cycleLaunchPendingUnitUnavailable")}
              />
            ) : null}
            {!loadingUnits && !unitsLoadError && !offlineReferencesEmpty && availableUnits.length === 0 ? <EmptyState compact message={t("newCycleNoExistingUnits")} /> : null}
            {!loadingUnits && !unitsLoadError ? availableUnits.map((unit) => {
              const selected = selectedUnitIds.includes(unit.id);
              const unitTypeKey = unit.unit_type === "pond" ? "productionUnitTypePond" : unit.unit_type === "cage" ? "productionUnitTypeCage" : "productionUnitTypeTank";
              const dimension = unit.display_dimension || getProductionUnitDisplayDimension(unit);
              const capacity = unit.recommended_capacity ?? getProductionUnitCapacity(unit);
              const allocation = allocationsByUnitId[unit.id] ?? "";
              const densityUnit = getProductionUnitDensityUnit(unit);
              const dimensionValue = unit.unit_type === "pond" ? unit.surface_m2 : unit.volume_m3;
              const numericAllocation = parseFormNumber(allocation);
              const density = dimensionValue && numericAllocation > 0 ? (numericAllocation / dimensionValue).toFixed(2) : null;
              return (
                <View key={unit.id} style={{ gap: spacing[2] }}>
                  <SelectableCard
                    testID={`newCycleUnit-${unit.id}`}
                    selected={selected}
                    disabled={unavailablePendingUnitIds.includes(unit.id)}
                    onPress={() => toggleUnit(unit)}
                    accessibilityLabel={unit.name}
                    primaryBorder
                  >
                    <AppText variant="cardTitle">{unit.name}</AppText>
                    <AppText color="muted">{t(unitTypeKey)}{dimension ? ` · ${dimension}` : ""}</AppText>
                    <AppText variant="helper" color="muted">{t("createFarmUnitCapacityLabel", { count: capacity ?? 0 })}</AppText>
                    {unavailablePendingUnitIds.includes(unit.id) ? (
                      <AppText variant="helper" color="error">
                        {t("cycleLaunchReferenceUnavailable")}
                      </AppText>
                    ) : null}
                  </SelectableCard>
                  {selected ? <Card variant="outlined">
                    <TextField testID={`newCycleAllocation-${unit.id}`} label={t("createFarmProductionUnitAssignedFishLabel")} value={allocation} onChangeText={(value) => setAllocationsByUnitId((current) => ({ ...current, [unit.id]: value }))} placeholder={t("createFarmProductionUnitAssignedFishPlaceholder")} keyboardType="numeric" />
                    {density && densityUnit ? <AppText variant="helper" color="muted">{t("createFarmProductionUnitDensityLabel")}: {density} {densityUnit}</AppText> : null}
                  </Card> : null}
                </View>
              );
            }) : null}
          </View>
          <View style={{ gap: spacing[3] }}>
            <AppText variant="sectionTitle">
              {t(formData.onboarding_mode === "ongoing" ? "declaredHistory" : "initialStocking")}
            </AppText>
            <TextField testID="newCycleInitialCount" label={t("initialCount")} required value={formData.initial_count} onChangeText={(value) => setFormData((prev) => ({ ...prev, initial_count: value }))} placeholder={t("exampleValuePlaceholder", { value: 1000 })} keyboardType="numeric" />
            <TextField testID="newCycleInitialWeight" label={t(formData.onboarding_mode === "ongoing" ? "historicalInitialWeightOptional" : "initialWeight")} required={formData.onboarding_mode === "new"} value={formData.initial_average_weight} onChangeText={(value) => setFormData((prev) => ({ ...prev, initial_average_weight: value }))} placeholder={t("exampleValuePlaceholder", { value: 10 })} keyboardType="numeric" suffix={numberSuffix("g")} />
            <TextField testID="newCycleStartDate" label={t("startDate")} required value={formData.start_date} onChangeText={(value) => setFormData((prev) => ({ ...prev, start_date: value }))} placeholder={t("dateFormatPlaceholder")} />
            <TextField testID="newCycleName" label={t("cycleName")} value={formData.cycle_name} onChangeText={(value) => setFormData((prev) => ({ ...prev, cycle_name: value }))} placeholder={t("cycleNamePlaceholder")} />
          </View>
          {formData.onboarding_mode === "ongoing" ? (
            <View style={{ gap: spacing[3] }}>
              <AppText variant="sectionTitle">{t("trackingStartSituation")}</AppText>
              <TextField
                testID="newCycleTrackingDate"
                label={t("trackingStartDate")}
                required
                value={formData.tracking_start_date}
                onChangeText={(value) => setFormData((current) => ({ ...current, tracking_start_date: value }))}
                placeholder={t("dateFormatPlaceholder")}
              />
              <TextField
                testID="newCycleTrackingCount"
                label={t("fishPresentAtTrackingStart")}
                required
                value={formData.tracking_start_count}
                onChangeText={(value) => setFormData((current) => ({ ...current, tracking_start_count: value }))}
                keyboardType="numeric"
              />
              <TextField
                testID="newCycleTrackingWeight"
                label={t("observedAverageWeight")}
                required
                value={formData.tracking_start_average_weight}
                onChangeText={(value) => setFormData((current) => ({ ...current, tracking_start_average_weight: value }))}
                keyboardType="decimal-pad"
                suffix={numberSuffix("g")}
              />
              <TextField
                testID="newCycleTrackingBiomass"
                label={t("measuredBiomassOptional")}
                value={formData.tracking_start_biomass}
                onChangeText={(value) => setFormData((current) => ({ ...current, tracking_start_biomass: value }))}
                keyboardType="decimal-pad"
                suffix={numberSuffix("kg")}
              />
              {formData.tracking_start_count && formData.tracking_start_average_weight ? (
                <AppText color="muted">
                  {t("calculatedBiomass")}:{" "}
                  {(
                    Number(formData.tracking_start_count)
                    * Number(formData.tracking_start_average_weight)
                    / 1000
                  ).toFixed(2)} kg
                </AppText>
              ) : null}
              <InlineAlert tone="info" message={t("preTrackingEventsNotReconstructed")} />
            </View>
          ) : null}
          {formData.onboarding_mode === "ongoing" ? (
            <View style={{ gap: spacing[3] }}>
              <AppText variant="sectionTitle">{t("openingFeedStock")}</AppText>
              <AppText color="muted">{t("openingFeedStockDescription")}</AppText>
              {unavailablePendingFeedReferenceIds.length > 0 ? (
                <InlineAlert
                  tone="warning"
                  message={t("cycleLaunchPendingFeedReferenceUnavailable")}
                />
              ) : null}
              <SegmentedControl
                value={stockReferenceMode}
                options={[
                  { value: "existing", label: t("existingFeedReference") },
                  { value: "external", label: t("externalFeed") },
                ]}
                onChange={setStockReferenceMode}
              />
              {stockReferenceMode === "existing" ? (
                <View style={{ gap: spacing[2] }}>
                  {feedReferences
                    .filter(
                      (reference) =>
                        !unavailablePendingFeedReferenceIds.includes(reference.id),
                    )
                    .filter((reference) => reference.species === formData.species)
                    .map((reference) => (
                      <SelectableCard
                        key={reference.id}
                        selected={stockReferenceId === reference.id}
                        onPress={() => setStockReferenceId(reference.id)}
                        accessibilityLabel={reference.name}
                      >
                        <AppText variant="bodyStrong">{reference.name}</AppText>
                        <AppText color="muted">{reference.pellet_size_mm} mm</AppText>
                      </SelectableCard>
                    ))}
                </View>
              ) : (
                <>
                  <TextField label={t("feedName")} value={stockName} onChangeText={setStockName} />
                  <TextField label={t("pelletSize")} value={stockPelletSize} onChangeText={setStockPelletSize} keyboardType="decimal-pad" suffix={numberSuffix("mm")} />
                </>
              )}
              <TextField label={t("quantityKg")} value={stockQuantity} onChangeText={setStockQuantity} keyboardType="decimal-pad" suffix={numberSuffix("kg")} />
              <SegmentedControl
                value={stockCostStatus}
                options={[
                  { value: "known", label: t("knownCost") },
                  { value: "unknown", label: t("unknownCost") },
                ]}
                onChange={setStockCostStatus}
              />
              {stockCostStatus === "known" ? (
                <TextField label={t("totalCostFcfa")} value={stockCost} onChangeText={setStockCost} keyboardType="decimal-pad" suffix={numberSuffix("FCFA")} />
              ) : null}
              <TextField label={t("notes")} value={stockNote} onChangeText={setStockNote} />
              <Button label={t("addOpeningStock")} variant="outline" onPress={addOpeningStock} />
              {formData.initial_feed_stocks.map((stock) => {
                const existingReference =
                  feedReferences.find(
                    (reference) => reference.id === stock.feed_reference_id,
                  )
                  ?? pendingFeedReferenceSnapshots.find(
                    (reference) => reference.id === stock.feed_reference_id,
                  );
                const referenceUnavailable = Boolean(
                  stock.feed_reference_id
                  && unavailablePendingFeedReferenceIds.includes(
                    stock.feed_reference_id,
                  ),
                );
                return (
                <Card key={stock.local_id} variant="outlined">
                  <AppText variant="bodyStrong">
                    {stock.external_feed?.name
                      ?? existingReference?.name
                      ?? t("feed")}
                  </AppText>
                  {existingReference?.pellet_size_mm ? (
                    <AppText color="muted">
                      {existingReference.pellet_size_mm} mm
                    </AppText>
                  ) : null}
                  {referenceUnavailable ? (
                    <AppText variant="helper" color="error">
                      {t("cycleLaunchReferenceUnavailable")}
                    </AppText>
                  ) : null}
                  <AppText>{stock.quantity_kg} kg · {t(stock.cost_status === "known" ? "knownCost" : "unknownCost")}</AppText>
                  <Button
                    label={t("remove")}
                    variant="outline"
                    onPress={() => setFormData((current) => ({
                      ...current,
                      initial_feed_stocks: current.initial_feed_stocks.filter((item) => item.local_id !== stock.local_id),
                    }))}
                  />
                </Card>
                );
              })}
            </View>
          ) : null}
          <View style={{ gap: spacing[3] }}>
            <AppText variant="sectionTitle">{t("economicProjectionTitle")}</AppText>
            <TextField testID="newCycleTargetWeight" label={t("targetWeight")} required value={formData.target_harvest_weight_g} onChangeText={(value) => setFormData((prev) => ({ ...prev, target_harvest_weight_g: value }))} placeholder={t("exampleValuePlaceholder", { value: formData.species === "clarias" ? 400 : 300 })} keyboardType="numeric" suffix={numberSuffix("g")} />
            <TextField testID="newCycleDuration" label={t("cycleDuration")} required value={formData.planned_cycle_duration_days} onChangeText={(value) => setFormData((prev) => ({ ...prev, planned_cycle_duration_days: value }))} placeholder={t("exampleValuePlaceholder", { value: formData.species === "clarias" ? 150 : 120 })} keyboardType="numeric" suffix={numberSuffix(t("days"))} />
            <TextField testID="newCycleSurvival" label={t("survivalRate")} required value={formData.expected_survival_rate_pct} onChangeText={(value) => setFormData((prev) => ({ ...prev, expected_survival_rate_pct: value }))} placeholder={t("exampleValuePlaceholder", { value: 85 })} keyboardType="numeric" suffix={numberSuffix("%")} />
            <TextField testID="newCycleSellingPrice" label={t("preEstimatedSellingPrice")} hint={t("buyerNetworkSellingPriceHint")} value={formData.planned_selling_price_per_kg_fcfa} onChangeText={(value) => setFormData((prev) => ({ ...prev, planned_selling_price_per_kg_fcfa: value }))} placeholder={t("exampleValuePlaceholder", { value: formData.species === "clarias" ? ECONOMIC_DEFAULTS.clarias.planned_selling_price_per_kg_fcfa : ECONOMIC_DEFAULTS.tilapia.planned_selling_price_per_kg_fcfa })} keyboardType="numeric" suffix={numberSuffix("FCFA")} />
            <TextField label={t("fingerlingsCostFcfa")} value={formData.fingerlings_cost_fcfa} onChangeText={(value) => setFormData((prev) => ({ ...prev, fingerlings_cost_fcfa: value }))} placeholder={t("zeroValuePlaceholder")} keyboardType="numeric" suffix={numberSuffix("FCFA")} />
            <TextField label={t("otherOperationalCosts")} value={formData.other_operational_costs_fcfa} onChangeText={(value) => setFormData((prev) => ({ ...prev, other_operational_costs_fcfa: value }))} placeholder={t("zeroValuePlaceholder")} keyboardType="numeric" suffix={numberSuffix("FCFA")} />
          </View>
          {formData.initial_count && (
            formData.initial_average_weight
            || formData.onboarding_mode === "ongoing"
          ) ? (() => {
            const density = estimateDensityValue();
            const expectedDuration = formData.planned_cycle_duration_days || getSelectedSpecies()?.durationDays;
            const ongoingSchedule =
              formData.onboarding_mode === "ongoing"
                ? getOngoingCycleSchedule(
                    formData.start_date,
                    formData.tracking_start_date,
                    Number(expectedDuration),
                  )
                : null;
            return <Card variant="outlined" style={{ gap: spacing[2] }}>
              <AppText variant="sectionTitle">{t("autoCalculations")}</AppText>
              <AppText color="muted">{t("initialBiomass")}: <AppText color="link">{estimateInitialBiomass()} kg</AppText></AppText>
              {formData.pond_surface_m2 || formData.pond_volume_m3 ? <AppText color="muted">{t("initialDensity")}: <AppText color="link">{density.value} {density.unit}</AppText></AppText> : null}
              {expectedDuration ? <AppText color="muted">{t("expectedDuration")}: <AppText color="link">{expectedDuration} {t("days")}</AppText></AppText> : null}
              {ongoingSchedule ? (
                <>
                  <AppText testID="ongoingTotalDuration" color="muted">{t("ongoingTotalDuration", { count: ongoingSchedule.totalDurationDays })}</AppText>
                  <AppText testID="ongoingPlannedHarvestDate" color="muted">{t("ongoingPlannedHarvestDate", { date: ongoingSchedule.plannedHarvestDate })}</AppText>
                  <AppText testID="ongoingRemainingDuration" color="muted">{t("ongoingRemainingDuration", { count: ongoingSchedule.remainingDurationDays })}</AppText>
                </>
              ) : null}
            </Card>;
          })() : null}
          {!isFormValid ? <InlineAlert tone="info" message={validationErrorKey ? t(validationErrorKey) : undefined} /> : null}
          <Button testID="newCycleSubmit" label={t(formData.onboarding_mode === "ongoing" ? "startTracking" : "createCycle")} onPress={handleSave} disabled={!isFormValid} loading={saving} iconLeft="checkmark" />
        </View>
      </Screen>
    </View>
  );
}
