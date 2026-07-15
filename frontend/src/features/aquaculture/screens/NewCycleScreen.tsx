import React, { useState, useEffect } from "react";
import { Alert, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StackNavigationProp } from "@react-navigation/stack";
import { useDispatch } from "react-redux";

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
import {
  getProductionUnitCapacity,
  getProductionUnitDensityUnit,
  getProductionUnitDisplayDimension,
} from "@/features/aquaculture/utils/productionUnits";
import { createClientUuid } from "@/utils/clientUuid";
import type { CycleLaunchCalibrationUnitInput, ProductionUnit } from "@/types/aquaculture";

const SPECIES_OPTIONS = [
  { value: "clarias", labelKey: "clarias", durationDays: 120 },
  { value: "tilapia", labelKey: "tilapia", durationDays: 180 },
] as const;

const TRANSACTIONAL_LAUNCH_ERROR_KEYS: Record<string, string> = {
  cycle_launch_unit_already_allocated: "cycleLaunchUnitAlreadyAllocated",
  cycle_launch_unit_capacity_exceeded: "cycleLaunchUnitCapacityExceeded",
  cycle_launch_unit_capacity_unavailable: "cycleLaunchUnitCapacityUnavailable",
};

type NewCycleScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "NewCycle"
>;

interface NewCycleScreenProps {
  navigation: NewCycleScreenNavigationProp;
}

export default function NewCycleScreen({ navigation }: NewCycleScreenProps) {
  const { t } = useTranslation();
  const { farmProfile } = useAuth();
  const dispatch = useDispatch<AppDispatch>();

  const [formData, setFormData] = useState<NewCycleData>({
    cycle_name: "",
    species: "",
    pond_identifier: "",
    pond_surface_m2: "",
    pond_volume_m3: "",
    infrastructure_type: [],
    initial_count: "",
    initial_average_weight: "",
    start_date: new Date().toISOString().split("T")[0],
    target_harvest_weight_g: "",
    planned_cycle_duration_days: "",
    expected_survival_rate_pct: "",
    planned_selling_price_per_kg_fcfa: "",
    fingerlings_cost_fcfa: "0",
    other_operational_costs_fcfa: "0",
  });
  const [saving, setSaving] = useState(false);
  const [availableUnits, setAvailableUnits] = useState<ProductionUnit[]>([]);
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [allocationsByUnitId, setAllocationsByUnitId] = useState<
    Record<string, string>
  >({});
  const [loadingUnits, setLoadingUnits] = useState(true);
  const [unitsLoadError, setUnitsLoadError] = useState(false);
  const [launchRequestId] = useState(() => createClientUuid());
  const [calibrationUnits, setCalibrationUnits] = useState<CycleLaunchCalibrationUnitInput[]>([]);
  const [calibrationName, setCalibrationName] = useState("");
  const [calibrationVolume, setCalibrationVolume] = useState("");

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
      await runSilentOfflineSync();
      dispatch(fetchDashboardData({ lightweight: true }));
      try {
        setLoadingUnits(true);
        setAvailableUnits(
          await aquacultureService.getProductionUnits({ status: "active", purpose: "production" }),
        );
        setUnitsLoadError(false);
      } catch {
        setUnitsLoadError(true);
      } finally {
        setLoadingUnits(false);
      }
    };
    void bootstrap();
  }, [dispatch]);

  const selectedUnits = availableUnits.filter((unit) =>
    selectedUnitIds.includes(unit.id),
  );
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
    try {
      const launchResult = await aquacultureService.launchProductionCycle(
        buildAdditionalCycleLaunchRequest({
          formData,
          selectedUnits,
          allocationsByUnitId,
          launchUuid: launchRequestId,
          calibrationUnits,
        }),
      );
      dispatch(fetchDashboardData({ lightweight: true }));

      const backendSellingPrice =
        launchResult.productionCycle.planned_selling_price_per_kg_fcfa;
      const prefill = buildSimulatorPrefill({
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
        Alert.alert(t("error"), t("cycleLaunchNetworkRetry"));
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
            {!loadingUnits && !unitsLoadError && availableUnits.length === 0 ? <EmptyState compact message={t("newCycleNoExistingUnits")} /> : null}
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
                  <SelectableCard testID={`newCycleUnit-${unit.id}`} selected={selected} onPress={() => toggleUnit(unit)} accessibilityLabel={unit.name} primaryBorder>
                    <AppText variant="cardTitle">{unit.name}</AppText>
                    <AppText color="muted">{t(unitTypeKey)}{dimension ? ` · ${dimension}` : ""}</AppText>
                    <AppText variant="helper" color="muted">{t("createFarmUnitCapacityLabel", { count: capacity ?? 0 })}</AppText>
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
            <AppText variant="sectionTitle">{t("initialStocking")}</AppText>
            <TextField testID="newCycleInitialCount" label={t("initialCount")} required value={formData.initial_count} onChangeText={(value) => setFormData((prev) => ({ ...prev, initial_count: value }))} placeholder={t("exampleValuePlaceholder", { value: 1000 })} keyboardType="numeric" />
            <TextField testID="newCycleInitialWeight" label={t("initialWeight")} required value={formData.initial_average_weight} onChangeText={(value) => setFormData((prev) => ({ ...prev, initial_average_weight: value }))} placeholder={t("exampleValuePlaceholder", { value: 10 })} keyboardType="numeric" suffix={numberSuffix("g")} />
            <TextField label={t("startDate")} required value={formData.start_date} onChangeText={(value) => setFormData((prev) => ({ ...prev, start_date: value }))} placeholder={t("dateFormatPlaceholder")} />
            <TextField testID="newCycleName" label={t("cycleName")} value={formData.cycle_name} onChangeText={(value) => setFormData((prev) => ({ ...prev, cycle_name: value }))} placeholder={t("cycleNamePlaceholder")} />
          </View>
          <View style={{ gap: spacing[3] }}>
            <AppText variant="sectionTitle">{t("economicProjectionTitle")}</AppText>
            <TextField testID="newCycleTargetWeight" label={t("targetWeight")} required value={formData.target_harvest_weight_g} onChangeText={(value) => setFormData((prev) => ({ ...prev, target_harvest_weight_g: value }))} placeholder={t("exampleValuePlaceholder", { value: formData.species === "clarias" ? 400 : 300 })} keyboardType="numeric" suffix={numberSuffix("g")} />
            <TextField testID="newCycleDuration" label={t("cycleDuration")} required value={formData.planned_cycle_duration_days} onChangeText={(value) => setFormData((prev) => ({ ...prev, planned_cycle_duration_days: value }))} placeholder={t("exampleValuePlaceholder", { value: formData.species === "clarias" ? 150 : 120 })} keyboardType="numeric" suffix={numberSuffix(t("days"))} />
            <TextField testID="newCycleSurvival" label={t("survivalRate")} required value={formData.expected_survival_rate_pct} onChangeText={(value) => setFormData((prev) => ({ ...prev, expected_survival_rate_pct: value }))} placeholder={t("exampleValuePlaceholder", { value: 85 })} keyboardType="numeric" suffix={numberSuffix("%")} />
            <TextField testID="newCycleSellingPrice" label={t("preEstimatedSellingPrice")} hint={t("buyerNetworkSellingPriceHint")} value={formData.planned_selling_price_per_kg_fcfa} onChangeText={(value) => setFormData((prev) => ({ ...prev, planned_selling_price_per_kg_fcfa: value }))} placeholder={t("exampleValuePlaceholder", { value: formData.species === "clarias" ? ECONOMIC_DEFAULTS.clarias.planned_selling_price_per_kg_fcfa : ECONOMIC_DEFAULTS.tilapia.planned_selling_price_per_kg_fcfa })} keyboardType="numeric" suffix={numberSuffix("FCFA")} />
            <TextField label={t("fingerlingsCostFcfa")} value={formData.fingerlings_cost_fcfa} onChangeText={(value) => setFormData((prev) => ({ ...prev, fingerlings_cost_fcfa: value }))} placeholder={t("zeroValuePlaceholder")} keyboardType="numeric" suffix={numberSuffix("FCFA")} />
            <TextField label={t("otherOperationalCosts")} value={formData.other_operational_costs_fcfa} onChangeText={(value) => setFormData((prev) => ({ ...prev, other_operational_costs_fcfa: value }))} placeholder={t("zeroValuePlaceholder")} keyboardType="numeric" suffix={numberSuffix("FCFA")} />
          </View>
          {formData.initial_count && formData.initial_average_weight ? (() => {
            const density = estimateDensityValue();
            const expectedDuration = formData.planned_cycle_duration_days || getSelectedSpecies()?.durationDays;
            return <Card variant="outlined" style={{ gap: spacing[2] }}>
              <AppText variant="sectionTitle">{t("autoCalculations")}</AppText>
              <AppText color="muted">{t("initialBiomass")}: <AppText color="link">{estimateInitialBiomass()} kg</AppText></AppText>
              {formData.pond_surface_m2 || formData.pond_volume_m3 ? <AppText color="muted">{t("initialDensity")}: <AppText color="link">{density.value} {density.unit}</AppText></AppText> : null}
              {expectedDuration ? <AppText color="muted">{t("expectedDuration")}: <AppText color="link">{expectedDuration} {t("days")}</AppText></AppText> : null}
            </Card>;
          })() : null}
          {!isFormValid ? <InlineAlert tone="info" message={validationErrorKey ? t(validationErrorKey) : undefined} /> : null}
          <Button testID="newCycleSubmit" label={t("createCycle")} onPress={handleSave} disabled={!isFormValid} loading={saving} iconLeft="checkmark" />
        </View>
      </Screen>
    </View>
  );
}
