import React, { useEffect, useState } from "react";
import { Alert, Linking, ScrollView, Text, TouchableOpacity, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { RootStackParamList } from "@/navigation/MainNavigator";
import type { StackNavigationProp } from "@react-navigation/stack";
import { MAVECAM_COLORS } from "@/constants/colors";
import { useAuth } from "@/hooks/useAuth";
import { useFarmLocation } from "@/hooks/useFarmLocation";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "@/store/store";
import { fetchDashboardData } from "@/features/aquaculture/store/aquacultureSlice";
import { FarmProfile } from "@/types/auth";

type NavigationProp = StackNavigationProp<RootStackParamList>;

export default function FarmProfileScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const dispatch = useDispatch<AppDispatch>();
  const { farmProfile, isLoading, error, updateFarm, loadProfile } = useAuth();
  const { dashboardData } = useSelector((state: RootState) => state.aquaculture);
  const activeCycles = dashboardData?.active_cycles || [];

  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<FarmProfile>>({});
  const { status: locationStatus, requestLocation } = useFarmLocation();

  useEffect(() => {
    dispatch(fetchDashboardData(undefined));
  }, [dispatch]);

  useEffect(() => {
    if (farmProfile) {
      setEditData({
        farm_name: farmProfile.farm_name || "",
        total_ponds: farmProfile.total_ponds || 0,
        total_area_m2: farmProfile.total_area_m2 || 0,
        water_source: farmProfile.water_source || "",
        main_species: farmProfile.main_species || "",
        annual_production_kg: farmProfile.annual_production_kg || 0,
        latitude: farmProfile.latitude ?? null,
        longitude: farmProfile.longitude ?? null,
        location_address: farmProfile.location_address || "",
      });
    }
  }, [farmProfile]);

  const handleLocateFarm = async () => {
    const coords = await requestLocation();
    if (!coords) {
      if (locationStatus === 'denied') {
        Alert.alert(t('farmLocation'), t('locationPermissionDenied'));
      } else if (locationStatus === 'unavailable') {
        Alert.alert(t('farmLocation'), t('locationServicesDisabled'));
      } else {
        Alert.alert(t('farmLocation'), t('locationCaptureError'));
      }
      return;
    }
    setEditData((prev) => ({
      ...prev,
      latitude: coords.latitude,
      longitude: coords.longitude,
      location_address: coords.address || "",
    }));
    // Sauvegarde immédiate sans attendre le bouton "Enregistrer"
    try {
      await updateFarm({
        latitude: coords.latitude,
        longitude: coords.longitude,
        location_address: coords.address || "",
      });
      Alert.alert(t('farmLocation'), t('locationCaptureSuccess'));
    } catch {
      Alert.alert(t('farmLocation'), t('locationCaptureError'));
    }
  };

  const handleOpenMap = () => {
    navigation.navigate('FarmMap');
  };

  const handleGoogleMaps = () => {
    const lat = farmProfile?.latitude;
    const lng = farmProfile?.longitude;
    if (!lat || !lng) return;
    Linking.openURL(`https://maps.google.com/?saddr=current&daddr=${lat},${lng}`);
  };

  const formatFarmName = (farmName: string | undefined) => {
    if (!farmName) return "";
    if (farmName.startsWith("Ferme de ") && farmName.includes(" ")) {
      const parts = farmName.replace("Ferme de ", "").split(" ");
      if (parts.length > 1) return `Ferme de ${parts[parts.length - 1]}`;
    }
    return farmName;
  };

  const handleSave = async () => {
    try {
      await updateFarm(editData);
      setIsEditing(false);
      Alert.alert(t("success"), t("profileUpdatedSuccess"));
    } catch (err) {
      Alert.alert(t("error"), t("profileUpdateError"));
    }
  };

  const getCertificationColor = () => {
    switch (farmProfile?.certification_status) {
      case "certified":
        return MAVECAM_COLORS.GREEN_PRIMARY;
      case "pending":
        return MAVECAM_COLORS.WARNING;
      case "suspended":
        return MAVECAM_COLORS.ERROR;
      case "rejected":
        return MAVECAM_COLORS.GRAY_LIGHT;
      default:
        return MAVECAM_COLORS.GRAY_LIGHT;
    }
  };

  const getCertificationText = () => {
    switch (farmProfile?.certification_status) {
      case "certified":
        return t("farmCertified");
      case "pending":
        return t("certificationPending");
      case "suspended":
        return t("certificationSuspended");
      case "rejected":
        return t("certificationRejected");
      default:
        return t("statusUnknown");
    }
  };

  const getCertificationIcon = () => {
    switch (farmProfile?.certification_status) {
      case "certified":
        return "checkmark-circle";
      case "pending":
        return "time";
      case "suspended":
        return "pause-circle";
      case "rejected":
        return "close-circle";
      default:
        return "help-circle";
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-cream p-10">
        <Text>{t("loading")}...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-cream p-10">
        <Text className="text-error text-center">{t("error")}: {error}</Text>
        <Text className="text-sm text-gray-light mt-2 text-center">{t("unableToLoadFarmProfile")}</Text>
      </View>
    );
  }

  if (!farmProfile) {
    return (
      <View className="flex-1 items-center justify-center bg-cream p-8">
        <Ionicons name="business-outline" size={64} color={MAVECAM_COLORS.GRAY_LIGHT} />
        <Text className="text-lg font-bold text-gray-dark mt-4 text-center">{t("noFarmProfile")}</Text>
        <Text className="text-sm text-gray-light mt-2 text-center">{t("loadingFarmProfile")}</Text>
        <TouchableOpacity
          className="bg-mavecam-primary px-6 py-3 rounded-lg mt-5"
          onPress={() => loadProfile()}
          disabled={isLoading}
        >
          <Text className="text-white text-base font-semibold">{isLoading ? t("loading") : t("reloadProfile")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const totalSurface = activeCycles.reduce((total, cycle) => total + (Number(cycle.pond_surface_m2) || 0), 0);

  return (
    <ScrollView className="flex-1 bg-cream">
      <View className="bg-mavecam-primary items-center pt-14 pb-6 px-5">
        <View className="w-16 h-16 rounded-full bg-green-dark items-center justify-center mb-3">
          <Ionicons name="business" size={32} color={MAVECAM_COLORS.WHITE} />
        </View>
        <Text className="text-2xl font-bold text-white mb-2 text-center">
          {formatFarmName(farmProfile.farm_name) || t("myFarm")}
        </Text>
        <View className="flex-row items-center px-3 py-2 rounded-full" style={{ backgroundColor: getCertificationColor() }}>
          <Ionicons name={getCertificationIcon()} size={16} color={MAVECAM_COLORS.WHITE} />
          <Text className="text-sm font-semibold text-white ml-2">{getCertificationText()}</Text>
        </View>
      </View>

      <View className="px-5 py-5">
        <View className="flex-row justify-between items-center mb-3">
          <Text className="text-lg font-bold text-gray-dark">{t("farmInfo")}</Text>
          <TouchableOpacity onPress={() => setIsEditing(!isEditing)} className="p-2">
            <Ionicons name={isEditing ? "close" : "pencil"} size={20} color={MAVECAM_COLORS.GREEN_PRIMARY} />
          </TouchableOpacity>
        </View>
        <View className="bg-white rounded-xl p-4">
          <FarmInfoRow
            label={t("farmName") || ""}
            value={isEditing ? undefined : formatFarmName(farmProfile.farm_name) || t("notProvided")}
            editable={isEditing}
            onChangeText={(value) => setEditData((prev) => ({ ...prev, farm_name: value }))}
            inputValue={editData.farm_name?.toString()}
            placeholder={t("farmNamePlaceholder") || ""}
          />
          <FarmInfoRow
            label={t("totalPonds") || ""}
            value={isEditing ? undefined : (farmProfile.total_ponds ?? 0).toString()}
            editable={isEditing}
            onChangeText={(value) => setEditData((prev) => ({ ...prev, total_ponds: parseInt(value, 10) || 0 }))}
            inputValue={editData.total_ponds?.toString()}
            placeholder={t("totalPonds") || ""}
            keyboardType="numeric"
          />
          <FarmInfoRow
            label={t("totalArea") || ""}
            value={isEditing ? undefined : `${totalSurface} m²`}
            editable={false}
            onChangeText={(value) => setEditData((prev) => ({ ...prev, total_area_m2: parseFloat(value) || 0 }))}
            inputValue={editData.total_area_m2?.toString()}
            placeholder={t("areaPlaceholder") || ""}
            keyboardType="numeric"
          />
          <FarmInfoRow
            label={t("waterSource") || ""}
            value={isEditing ? undefined : farmProfile.water_source || t("notProvided")}
            editable={isEditing}
            onChangeText={(value) => setEditData((prev) => ({ ...prev, water_source: value }))}
            inputValue={editData.water_source}
            placeholder={t("waterSourcePlaceholder") || ""}
          />
          <FarmInfoRow
            label={t("mainSpecies") || ""}
            value={isEditing ? undefined : farmProfile.main_species || t("notProvided")}
            editable={isEditing}
            onChangeText={(value) => setEditData((prev) => ({ ...prev, main_species: value }))}
            inputValue={editData.main_species}
            placeholder={t("speciesPlaceholder") || ""}
          />
          <FarmInfoRow
            label={t("annualProduction") || ""}
            value={isEditing ? undefined : farmProfile.annual_production_kg?.toString() || "0"}
            editable={isEditing}
            onChangeText={(value) => setEditData((prev) => ({ ...prev, annual_production_kg: parseFloat(value) || 0 }))}
            inputValue={editData.annual_production_kg?.toString()}
            placeholder={t("productionPlaceholder") || ""}
            keyboardType="numeric"
          />
        </View>
      </View>

      {/* Section GPS */}
      <View className="px-5 py-4">
        <Text className="text-lg font-bold text-gray-dark mb-3">{t('farmLocation')}</Text>
        <View className="bg-white rounded-xl p-4">
          {farmProfile.latitude && farmProfile.longitude ? (
            <>
              <View className="flex-row items-start gap-3 mb-4">
                <Ionicons name="location" size={20} color={MAVECAM_COLORS.GREEN_PRIMARY} />
                <View className="flex-1">
                  {farmProfile.location_address ? (
                    <Text className="text-sm font-medium text-gray-dark mb-1">
                      {farmProfile.location_address}
                    </Text>
                  ) : null}
                  <Text className="text-xs text-gray-light" style={{ fontVariant: ['tabular-nums'] }}>
                    {Number(farmProfile.latitude).toFixed(6)}, {Number(farmProfile.longitude).toFixed(6)}
                  </Text>
                </View>
              </View>
              <View className="flex-row gap-3">
                <TouchableOpacity
                  className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-lg border border-mavecam-primary"
                  onPress={handleOpenMap}
                >
                  <Ionicons name="map-outline" size={16} color={MAVECAM_COLORS.GREEN_PRIMARY} />
                  <Text className="text-sm font-semibold text-mavecam-primary">{t('viewOnMap')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-lg bg-mavecam-primary"
                  onPress={handleGoogleMaps}
                >
                  <Ionicons name="navigate" size={16} color="white" />
                  <Text className="text-sm font-semibold text-white">{t('navigateToFarm')}</Text>
                </TouchableOpacity>
              </View>
              {isEditing && (
                <TouchableOpacity
                  className="mt-3 flex-row items-center justify-center gap-2 py-3 rounded-lg border border-gray-200"
                  onPress={handleLocateFarm}
                  disabled={locationStatus === 'requesting'}
                >
                  <Ionicons name="locate" size={16} color={MAVECAM_COLORS.GRAY_LIGHT} />
                  <Text className="text-sm text-gray-light">
                    {locationStatus === 'requesting' ? t('locatingFarm') : 'Mettre à jour la localisation'}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              <View className="items-center py-2 mb-3">
                <Ionicons name="location-outline" size={32} color={MAVECAM_COLORS.GRAY_LIGHT} />
                <Text className="text-sm text-gray-light mt-2 text-center">{t('farmNoLocation')}</Text>
              </View>
              <TouchableOpacity
                className="flex-row items-center justify-center gap-2 py-3 rounded-lg bg-mavecam-primary"
                onPress={handleLocateFarm}
                disabled={locationStatus === 'requesting'}
              >
                <Ionicons name="locate" size={18} color="white" />
                <Text className="text-sm font-semibold text-white">
                  {locationStatus === 'requesting' ? t('locatingFarm') : t('locateFarm')}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      <View className="px-5 py-3">
        <Text className="text-lg font-bold text-gray-dark mb-3">{t("currentCycles")}</Text>
        {activeCycles.length === 0 ? (
          <View className="items-center p-6">
            <Text className="text-base text-gray-dark mb-2">{t("noActiveCycles")}</Text>
            <Text className="text-sm text-gray-light text-center">{t("startCycle")}</Text>
          </View>
        ) : (
          <View className="gap-3">
            {activeCycles.map((cycle) => {
              const startDate = new Date(cycle.start_date);
              const currentDate = new Date();
              const daysSinceStart = Math.floor((currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
              const cycleDuration = cycle.species === "clarias" ? 120 : 180;

              return (
                <View key={cycle.id} className="bg-white rounded-xl p-4 border-l-4 border-l-mavecam-primary">
                  <View className="flex-row items-center justify-between mb-3">
                    <Text className="text-base font-bold text-gray-dark flex-1" numberOfLines={1}>
                      {cycle.cycle_name}
                    </Text>
                    <View className="bg-green-light px-2 py-1 rounded-lg">
                      <Text className="text-xs font-semibold text-white">
                        {t("dayProgress", { day: daysSinceStart, duration: cycleDuration })}
                      </Text>
                    </View>
                  </View>
                  <View className="gap-2">
                    <CycleRow label={t("pond") || ""} value={cycle.pond_identifier} />
                    <CycleRow label={t("area") || ""} value={`${cycle.pond_surface_m2} m²`} />
                    <CycleRow label={t("species") || ""} value={cycle.species === "clarias" ? "Clarias" : "Tilapia"} />
                    <CycleRow label={t("currentFish") || ""} value={`${cycle.current_count}`} />
                    <CycleRow label={t("currentBiomass") || ""} value={`${cycle.current_biomass} kg`} />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <TouchableOpacity
          onPress={() => navigation.navigate("DailyLogHistory")}
          className="bg-mavecam-primary mt-4 py-3 px-4 rounded-lg items-center"
        >
          <Text className="text-white text-base font-semibold">{t("viewDailyLogHistory")}</Text>
        </TouchableOpacity>
      </View>

      {isEditing && (
        <View className="px-5 pb-5">
          <TouchableOpacity
            className={`py-4 rounded-lg items-center ${isLoading ? "bg-mavecam-primary/70" : "bg-mavecam-primary"}`}
            onPress={handleSave}
            disabled={isLoading}
          >
            <Text className="text-white text-base font-semibold">{isLoading ? t("saving") : t("saveChanges")}</Text>
          </TouchableOpacity>
        </View>
      )}

      {error && (
        <View className="mx-5 mb-5 p-4 bg-[#fef2f2] rounded-lg border-l-4 border-l-error">
          <Text className="text-error text-sm">{error}</Text>
        </View>
      )}
    </ScrollView>
  );
}

interface FarmInfoRowProps {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  editable: boolean;
  onChangeText?: (text: string) => void;
  inputValue?: string;
  placeholder?: string;
  keyboardType?: "default" | "numeric";
}

function FarmInfoRow({
  icon,
  label,
  value,
  editable,
  onChangeText,
  inputValue,
  placeholder,
  keyboardType = "default",
}: FarmInfoRowProps) {
  return (
    <View className="flex-row justify-between items-center py-3 border-b border-slate-100">
      <View className="flex-row items-center flex-1 mr-3">
        {icon && <Ionicons name={icon} size={20} color={MAVECAM_COLORS.GRAY_LIGHT} />}
        <Text className={`text-sm text-gray-light ${icon ? "ml-3" : ""} flex-1`}>{label}</Text>
      </View>
      {editable ? (
        <TextInput
          className="border border-gray-300 rounded-md px-2 h-10 text-sm text-right text-gray-dark flex-1"
          value={inputValue}
          onChangeText={onChangeText}
          placeholder={placeholder}
          keyboardType={keyboardType}
          autoCapitalize="words"
          textAlignVertical="center"
        />
      ) : (
        <Text className="text-sm text-gray-dark font-medium flex-1 text-right">{value}</Text>
      )}
    </View>
  );
}

function CycleRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between items-center">
      <Text className="text-sm text-gray-light flex-1">{label} :</Text>
      <Text className="text-sm text-gray-dark font-semibold text-right flex-1">{value}</Text>
    </View>
  );
}
