import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
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
import { AQUACARE_COLORS } from "@/constants/colors";
import { sharedTextInputStyles } from "@/components/common/inputStyles";
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
import type { ProductionUnit } from "@/types/aquaculture";

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
          await aquacultureService.getProductionUnits({ status: "active" }),
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

  return (
    <ScrollView className="flex-1 bg-cream">
      <View className="bg-aquacare-primary flex-row items-center pt-14 pb-4 px-4">
        <TouchableOpacity
          testID="newCycleBackButton"
          className="mr-4"
          onPress={handleGoBack}
          accessibilityRole="button"
          accessibilityLabel={t("back")}
        >
          <Ionicons name="arrow-back" size={24} color={AQUACARE_COLORS.WHITE} />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-white">
          {t("newCycleTitle")}
        </Text>
      </View>

      <View className="p-4">
        <View className="bg-white p-4 rounded-lg flex-row items-center mb-6 gap-3 border border-gray-200">
          <Ionicons
            name="business"
            size={20}
            color={AQUACARE_COLORS.GREEN_PRIMARY}
          />
          <Text className="text-base font-semibold text-gray-dark">
            {farmProfile?.farm_name || t("farmNotDefined")}
          </Text>
        </View>

        <View className="mb-6">
          <Text className="text-base font-bold text-gray-dark mb-3">
            {t("speciesSelection")} {t("requiredField")}
          </Text>
          <View className="gap-2">
            {SPECIES_OPTIONS.map((species) => (
              <TouchableOpacity
                key={species.value}
                className={`p-4 rounded-lg border flex-row items-center justify-between ${
                  formData.species === species.value
                    ? "bg-aquacare-primary border-aquacare-primary"
                    : "bg-white border-gray-200"
                }`}
                onPress={() => applyEconomicDefaults(species.value)}
              >
                <View className="flex-1 mr-2">
                  <Text
                    className={`text-base font-semibold ${
                      formData.species === species.value
                        ? "text-white"
                        : "text-gray-dark"
                    }`}
                  >
                    {t(species.labelKey)}
                  </Text>
                  <Text
                    className={`text-sm ${
                      formData.species === species.value
                        ? "text-white"
                        : "text-gray-light"
                    }`}
                  >
                    {species.durationDays} {t("days")}
                  </Text>
                </View>
                {formData.species === species.value && (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={AQUACARE_COLORS.WHITE}
                  />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View className="mb-6">
          <Text className="text-base font-bold text-gray-dark mb-3">
            {t("newCycleSelectUnitsTitle")}
          </Text>
          <Text className="text-sm text-gray-light mb-3">
            {t("newCycleSelectUnitsDescription")}
          </Text>

          {loadingUnits ? (
            <View className="bg-white p-4 rounded-lg items-center">
              <ActivityIndicator color={AQUACARE_COLORS.GREEN_PRIMARY} />
              <Text className="text-sm text-gray-light mt-2">
                {t("productionUnitsLoading")}
              </Text>
            </View>
          ) : unitsLoadError ? (
            <View className="bg-white p-4 rounded-lg border border-red-200">
              <Text className="text-sm text-red-600">
                {t("productionUnitsLoadError")}
              </Text>
              <Text className="text-sm text-gray-light mt-1">
                {t("cycleLaunchNetworkRetry")}
              </Text>
            </View>
          ) : availableUnits.length === 0 ? (
            <View className="bg-white p-4 rounded-lg border border-gray-200">
              <Text className="text-sm text-gray-light">
                {t("newCycleNoExistingUnits")}
              </Text>
            </View>
          ) : (
            availableUnits.map((unit) => {
              const selected = selectedUnitIds.includes(unit.id);
              const unitTypeKey =
                unit.unit_type === "pond"
                  ? "productionUnitTypePond"
                  : unit.unit_type === "cage"
                    ? "productionUnitTypeCage"
                    : "productionUnitTypeTank";
              const dimension =
                unit.display_dimension ||
                getProductionUnitDisplayDimension(unit);
              const capacity =
                unit.recommended_capacity ?? getProductionUnitCapacity(unit);
              const allocation = allocationsByUnitId[unit.id] ?? "";
              const numericAllocation = parseFormNumber(allocation);
              const densityUnit = getProductionUnitDensityUnit(unit);
              const dimensionValue =
                unit.unit_type === "pond" ? unit.surface_m2 : unit.volume_m3;
              const density =
                dimensionValue && numericAllocation > 0
                  ? (numericAllocation / dimensionValue).toFixed(2)
                  : null;

              return (
                <View
                  key={unit.id}
                  className="bg-white rounded-lg border border-gray-200 p-3 mb-3"
                >
                  <TouchableOpacity
                    testID={`newCycleUnit-${unit.id}`}
                    className="flex-row items-center"
                    onPress={() => toggleUnit(unit)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                  >
                    <Ionicons
                      name={selected ? "checkbox" : "square-outline"}
                      size={22}
                      color={
                        selected
                          ? AQUACARE_COLORS.GREEN_PRIMARY
                          : AQUACARE_COLORS.GRAY_LIGHT
                      }
                    />
                    <View className="ml-3 flex-1">
                      <Text className="text-base font-semibold text-gray-dark">
                        {unit.name}
                      </Text>
                      <Text className="text-sm text-gray-light">
                        {t(unitTypeKey)}
                        {dimension ? ` · ${dimension}` : ""}
                      </Text>
                      <Text className="text-xs text-gray-light">
                        {t("createFarmUnitCapacityLabel", {
                          count: capacity ?? 0,
                        })}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {selected ? (
                    <View className="mt-3">
                      <Text className="text-sm font-medium text-gray-dark mb-1">
                        {t("createFarmProductionUnitAssignedFishLabel")}
                      </Text>
                      <TextInput
                        testID={`newCycleAllocation-${unit.id}`}
                        className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-base text-gray-dark"
                        style={sharedTextInputStyles.base}
                        value={allocation}
                        onChangeText={(value) =>
                          setAllocationsByUnitId((current) => ({
                            ...current,
                            [unit.id]: value,
                          }))
                        }
                        placeholder={t(
                          "createFarmProductionUnitAssignedFishPlaceholder",
                        )}
                        keyboardType="numeric"
                      />
                      {density && densityUnit ? (
                        <Text className="text-xs text-gray-light mt-1">
                          {t("createFarmProductionUnitDensityLabel")}: {density}{" "}
                          {densityUnit}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </View>

        <View className="mb-6">
          <Text className="text-base font-bold text-gray-dark mb-3">
            {t("initialStocking")}
          </Text>

          <View className="flex-row gap-3">
            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">
                {t("initialCount")} {t("requiredField")}
              </Text>
              <TextInput
                testID="newCycleInitialCount"
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                style={sharedTextInputStyles.base}
                value={formData.initial_count}
                onChangeText={(value) =>
                  setFormData((prev) => ({ ...prev, initial_count: value }))
                }
                placeholder={t("exampleValuePlaceholder", { value: 1000 })}
                keyboardType="numeric"
              />
            </View>

            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">
                {t("initialWeight")} {t("requiredField")}
              </Text>
              <TextInput
                testID="newCycleInitialWeight"
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                style={sharedTextInputStyles.base}
                value={formData.initial_average_weight}
                onChangeText={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    initial_average_weight: value,
                  }))
                }
                placeholder={t("exampleValuePlaceholder", { value: 10 })}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View className="mb-4">
            <Text className="text-sm font-medium text-gray-dark mb-2">
              {t("startDate")} {t("requiredField")}
            </Text>
            <TextInput
              className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
              style={sharedTextInputStyles.base}
              value={formData.start_date}
              onChangeText={(value) =>
                setFormData((prev) => ({ ...prev, start_date: value }))
              }
              placeholder={t("dateFormatPlaceholder")}
            />
          </View>

          <View className="mb-4">
            <Text className="text-sm font-medium text-gray-dark mb-2">
              {t("cycleName")}
            </Text>
            <TextInput
              className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
              style={sharedTextInputStyles.base}
              testID="newCycleName"
              value={formData.cycle_name}
              onChangeText={(value) =>
                setFormData((prev) => ({ ...prev, cycle_name: value }))
              }
              placeholder={t("cycleNamePlaceholder")}
            />
          </View>
        </View>

        <View className="mb-6">
          <Text className="text-base font-bold text-gray-dark mb-3">
            {t("economicProjectionTitle")}
          </Text>

          <View className="flex-row gap-3">
            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">
                {t("targetWeight")} (g) {t("requiredField")}
              </Text>
              <TextInput
                testID="newCycleTargetWeight"
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                style={sharedTextInputStyles.base}
                value={formData.target_harvest_weight_g}
                onChangeText={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    target_harvest_weight_g: value,
                  }))
                }
                placeholder={t("exampleValuePlaceholder", {
                  value: formData.species === "clarias" ? 400 : 300,
                })}
                keyboardType="numeric"
              />
            </View>

            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">
                {t("cycleDuration")} ({t("days")}) {t("requiredField")}
              </Text>
              <TextInput
                testID="newCycleDuration"
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                style={sharedTextInputStyles.base}
                value={formData.planned_cycle_duration_days}
                onChangeText={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    planned_cycle_duration_days: value,
                  }))
                }
                placeholder={t("exampleValuePlaceholder", {
                  value: formData.species === "clarias" ? 150 : 120,
                })}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">
                {t("survivalRate")} (%) {t("requiredField")}
              </Text>
              <TextInput
                testID="newCycleSurvival"
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                style={sharedTextInputStyles.base}
                value={formData.expected_survival_rate_pct}
                onChangeText={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    expected_survival_rate_pct: value,
                  }))
                }
                placeholder={t("exampleValuePlaceholder", { value: 85 })}
                keyboardType="numeric"
              />
            </View>

            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">
                {t("preEstimatedSellingPrice")}
              </Text>
              <TextInput
                testID="newCycleSellingPrice"
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                style={sharedTextInputStyles.base}
                value={formData.planned_selling_price_per_kg_fcfa}
                onChangeText={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    planned_selling_price_per_kg_fcfa: value,
                  }))
                }
                placeholder={t("exampleValuePlaceholder", {
                  value:
                    formData.species === "clarias"
                      ? ECONOMIC_DEFAULTS.clarias
                          .planned_selling_price_per_kg_fcfa
                      : ECONOMIC_DEFAULTS.tilapia
                          .planned_selling_price_per_kg_fcfa,
                })}
                keyboardType="numeric"
              />
              <Text
                style={{
                  fontSize: 11,
                  color: AQUACARE_COLORS.GREEN_PRIMARY,
                  marginTop: 4,
                }}
              >
                {t("buyerNetworkSellingPriceHint")}
              </Text>
            </View>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">
                {t("fingerlingsCostFcfa")}
              </Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                style={sharedTextInputStyles.base}
                value={formData.fingerlings_cost_fcfa}
                onChangeText={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    fingerlings_cost_fcfa: value,
                  }))
                }
                placeholder={t("zeroValuePlaceholder")}
                keyboardType="numeric"
              />
            </View>

            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">
                {t("otherOperationalCosts")}
              </Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                style={sharedTextInputStyles.base}
                value={formData.other_operational_costs_fcfa}
                onChangeText={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    other_operational_costs_fcfa: value,
                  }))
                }
                placeholder={t("zeroValuePlaceholder")}
                keyboardType="numeric"
              />
            </View>
          </View>
        </View>

        {formData.initial_count && formData.initial_average_weight
          ? (() => {
              const density = estimateDensityValue();
              const selectedSpecies = getSelectedSpecies();
              const expectedDuration =
                formData.planned_cycle_duration_days ||
                selectedSpecies?.durationDays;

              return (
                <View className="mb-6">
                  <Text className="text-base font-bold text-gray-dark mb-3">
                    {t("autoCalculations")}
                  </Text>
                  <View className="bg-white p-4 rounded-lg border border-green-200">
                    <View className="flex-row justify-between mb-2">
                      <Text className="text-sm text-gray-light">
                        {t("initialBiomass")} :
                      </Text>
                      <Text className="text-sm font-semibold text-aquacare-primary">
                        {estimateInitialBiomass()} kg
                      </Text>
                    </View>

                    {(formData.pond_surface_m2 || formData.pond_volume_m3) && (
                      <View className="flex-row justify-between mb-2">
                        <Text className="text-sm text-gray-light">
                          {t("initialDensity")} :
                        </Text>
                        <Text className="text-sm font-semibold text-aquacare-primary">
                          {density.value} {density.unit}
                        </Text>
                      </View>
                    )}

                    {expectedDuration && (
                      <View className="flex-row justify-between">
                        <Text className="text-sm text-gray-light">
                          {t("expectedDuration")} :
                        </Text>
                        <Text className="text-sm font-semibold text-aquacare-primary">
                          {expectedDuration} {t("days")}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })()
          : null}

        <TouchableOpacity
          className={`bg-aquacare-primary flex-row items-center justify-center py-4 rounded-lg mt-4 gap-2 ${
            !isFormValid || saving ? "opacity-60" : ""
          }`}
          onPress={handleSave}
          disabled={!isFormValid || saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={AQUACARE_COLORS.WHITE} />
          ) : (
            <>
              <Ionicons
                name="checkmark"
                size={20}
                color={AQUACARE_COLORS.WHITE}
              />
              <Text className="text-white text-base font-semibold">
                {t("createCycle")}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
