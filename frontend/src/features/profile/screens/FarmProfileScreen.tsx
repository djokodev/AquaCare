import React, { useCallback, useMemo, useRef, useState } from "react";
import { Alert, Linking, RefreshControl, ScrollView, Text, TouchableOpacity, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { RootStackParamList } from "@/navigation/MainNavigator";
import type { StackNavigationProp } from "@react-navigation/stack";
import { AQUACARE_COLORS } from "@/constants/colors";
import { aquacultureService } from "@/features/aquaculture/services/aquacultureService";
import { useAuth } from "@/hooks/useAuth";
import { useFarmLocation } from "@/hooks/useFarmLocation";
import { getAccountErrorMessage } from "@/features/auth/utils/accountsErrorPresenter";
import { useFarmProfileEditor } from "@/features/profile/hooks/useFarmProfileEditor";
import { formatFarmName, getCertificationPresentation } from "@/features/profile/utils/accountProfilePresentation";
import { sharedTextInputStyles } from "@/components/common/inputStyles";
import type { ProductionUnit } from "@/types/aquaculture";

type NavigationProp = StackNavigationProp<RootStackParamList>;

export default function FarmProfileScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const { farmProfile, isLoading, error, updateFarm, loadFarmProfile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const refreshInProgressRef = useRef(false);
  const [productionUnits, setProductionUnits] = useState<ProductionUnit[]>([]);

  const { isEditing, setIsEditing, isSaving, editData, updateEditField, save, saveLocation } =
    useFarmProfileEditor({ farmProfile, updateFarm });
  const certification = useMemo(
    () => getCertificationPresentation(farmProfile, t),
    [farmProfile, t]
  );
  const { totalSurfaceM2, totalVolumeM3 } = useMemo(() => {
    const countableUnits = productionUnits.filter(
      (unit) => unit.status !== "inactive" && unit.status !== "archived"
    );

    const aggregateDimension = (selector: (unit: ProductionUnit) => number | string | null | undefined) =>
      countableUnits.reduce((total, unit) => {
        const value = Number(selector(unit));
        if (!Number.isFinite(value) || value <= 0) {
          return total;
        }
        return total + value;
      }, 0);

    return {
      totalSurfaceM2: aggregateDimension((unit) => unit.surface_m2),
      totalVolumeM3: aggregateDimension((unit) => unit.volume_m3),
    };
  }, [productionUnits]);
  const { status: locationStatus, requestLocation } = useFarmLocation();

  const refreshFarmProfile = useCallback(async () => {
    if (refreshInProgressRef.current) {
      return;
    }

    refreshInProgressRef.current = true;
    setRefreshing(true);

    try {
      await Promise.all([
        loadFarmProfile(),
        aquacultureService.getProductionUnits({ status: "active" }).then(setProductionUnits).catch(() => {
          setProductionUnits([]);
        }),
      ]);
    } finally {
      refreshInProgressRef.current = false;
      setRefreshing(false);
    }
  }, [loadFarmProfile]);

  useFocusEffect(
    useCallback(() => {
      void refreshFarmProfile();
    }, [refreshFarmProfile])
  );

  const handleLocateFarm = async () => {
    const coords = await requestLocation();
    if (!coords) {
      if (locationStatus === 'denied') {
        Alert.alert(
          t('farmLocation'),
          t('locationPermissionDenied'),
          [
            { text: t('cancel'), style: 'cancel' },
            { text: t('openSettings'), onPress: () => Linking.openSettings() },
          ]
        );
      } else if (locationStatus === 'unavailable') {
        Alert.alert(
          t('farmLocation'),
          t('locationServicesDisabled'),
          [
            { text: t('cancel'), style: 'cancel' },
            { text: t('openSettings'), onPress: () => Linking.openSettings() },
          ]
        );
      } else {
        Alert.alert(t('farmLocation'), t('locationCaptureError'));
      }
      return;
    }
    try {
      await saveLocation({
        latitude: coords.latitude,
        longitude: coords.longitude,
        location_address: coords.address || "",
      });
      Alert.alert(t('farmLocation'), t('locationCaptureSuccess'));
    } catch (err) {
      Alert.alert(t('farmLocation'), getAccountErrorMessage(err, t));
    }
  };

  const handleOpenMap = () => {
    navigation.navigate('FarmMap');
  };

  const handleSave = async () => {
    try {
      await save();
      Alert.alert(t("success"), t("profileUpdatedSuccess"));
    } catch (err) {
      Alert.alert(t("error"), getAccountErrorMessage(err, t));
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-cream p-10">
        <Text>{t("loading")}...</Text>
      </View>
    );
  }

  if (error && !farmProfile) {
    return (
      <View className="flex-1 items-center justify-center bg-cream p-10">
        <Text className="text-error text-center">{t("error")}: {getAccountErrorMessage(error, t)}</Text>
        <Text className="text-sm text-gray-light mt-2 text-center">{t("unableToLoadFarmProfile")}</Text>
        <TouchableOpacity
          className="bg-aquacare-primary px-6 py-3 rounded-lg mt-5"
          onPress={() => refreshFarmProfile()}
          disabled={isLoading}
        >
          <Text className="text-white text-base font-semibold">{isLoading ? t("loading") : t("retry")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!farmProfile) {
    return (
      <View className="flex-1 items-center justify-center bg-cream p-8">
        <Ionicons name="business-outline" size={64} color={AQUACARE_COLORS.GRAY_LIGHT} />
        <Text className="text-lg font-bold text-gray-dark mt-4 text-center">{t("noFarmProfile")}</Text>
        <Text className="text-sm text-gray-light mt-2 text-center">{t("loadingFarmProfile")}</Text>
        <TouchableOpacity
          className="bg-aquacare-primary px-6 py-3 rounded-lg mt-5"
          onPress={() => refreshFarmProfile()}
          disabled={isLoading}
        >
          <Text className="text-white text-base font-semibold">{isLoading ? t("loading") : t("reloadProfile")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-cream"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refreshFarmProfile} />
      }
    >
      <View className="bg-aquacare-primary items-center pt-14 pb-6 px-5">
        <View className="w-16 h-16 rounded-full bg-green-dark items-center justify-center mb-3">
          <Ionicons name="business" size={32} color={AQUACARE_COLORS.WHITE} />
        </View>
        <Text className="text-2xl font-bold text-white mb-2 text-center">
          {formatFarmName(farmProfile.farm_name) || t("myFarm")}
        </Text>
        <View className="flex-row items-center px-3 py-2 rounded-full" style={{ backgroundColor: certification.color }}>
          <Ionicons name={certification.icon} size={16} color={AQUACARE_COLORS.WHITE} />
          <Text className="text-sm font-semibold text-white ml-2">{certification.text}</Text>
        </View>
      </View>

      <View className="px-5 py-5">
        <View className="flex-row justify-between items-center mb-3">
          <Text className="text-lg font-bold text-gray-dark">{t("farmInfo")}</Text>
          <TouchableOpacity onPress={() => setIsEditing(!isEditing)} className="p-2">
            <Ionicons name={isEditing ? "close" : "pencil"} size={20} color={AQUACARE_COLORS.GREEN_PRIMARY} />
          </TouchableOpacity>
        </View>
        <View className="bg-white rounded-xl p-4">
          <FarmInfoRow
            label={t("farmName") || ""}
            value={isEditing ? undefined : formatFarmName(farmProfile.farm_name) || t("notProvided")}
            editable={isEditing}
            onChangeText={(value) => updateEditField("farm_name", value)}
            inputValue={editData.farm_name?.toString()}
            placeholder={t("farmNamePlaceholder") || ""}
          />
          <FarmInfoRow
            label={t("totalPonds") || ""}
            value={(farmProfile.setup_unit_count ?? farmProfile.total_ponds ?? 0).toString()}
            editable={false}
          />
          <FarmInfoRow
            label={t("surfaceTotal") || ""}
            value={totalSurfaceM2 > 0 ? `${totalSurfaceM2} m²` : t("notProvided")}
            editable={false}
          />
          <FarmInfoRow
            label={t("volumeTotal") || ""}
            value={totalVolumeM3 > 0 ? `${totalVolumeM3} m³` : t("notProvided")}
            editable={false}
          />
          <FarmInfoRow
            label={t("waterSource") || ""}
            value={isEditing ? undefined : farmProfile.water_source || t("notProvided")}
            editable={isEditing}
            onChangeText={(value) => updateEditField("water_source", value)}
            inputValue={editData.water_source}
            placeholder={t("waterSourcePlaceholder") || ""}
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
                <Ionicons name="checkmark-circle" size={20} color={AQUACARE_COLORS.GREEN_PRIMARY} />
                <View className="flex-1">
                  <Text className="text-sm font-medium text-aquacare-primary mb-1">
                    {t('locationCaptureSuccess')}
                  </Text>
                  {farmProfile.location_address ? (
                    <Text className="text-sm text-gray-dark">
                      {farmProfile.location_address}
                    </Text>
                  ) : null}
                </View>
              </View>
              <TouchableOpacity
                className="py-3 rounded-lg border border-aquacare-primary items-center mb-3"
                onPress={handleOpenMap}
              >
                <Text className="text-sm font-semibold text-aquacare-primary">{t('viewOnMap')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-row items-center justify-center gap-2 py-3 rounded-lg border border-gray-200"
                onPress={handleLocateFarm}
                disabled={locationStatus === 'requesting' || isSaving}
              >
                <Ionicons name="locate" size={16} color={AQUACARE_COLORS.GRAY_LIGHT} />
                <Text className="text-sm text-gray-light">
                  {locationStatus === 'requesting' || isSaving ? t('locatingFarm') : t('updateLocation')}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View className="items-center py-2 mb-3">
                <Ionicons name="location-outline" size={32} color={AQUACARE_COLORS.GRAY_LIGHT} />
                <Text className="text-sm text-gray-light mt-2 text-center">{t('farmNoLocation')}</Text>
              </View>
              <TouchableOpacity
                className="flex-row items-center justify-center gap-2 py-3 rounded-lg bg-aquacare-primary"
                onPress={handleLocateFarm}
                disabled={locationStatus === 'requesting' || isSaving}
              >
                <Ionicons name="locate" size={18} color="white" />
                <Text className="text-sm font-semibold text-white">
                  {locationStatus === 'requesting' || isSaving ? t('locatingFarm') : t('locateFarm')}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {isEditing && (
        <View className="px-5 pb-5">
          <TouchableOpacity
            className={`py-4 rounded-lg items-center ${isSaving ? "bg-aquacare-primary/70" : "bg-aquacare-primary"}`}
            onPress={handleSave}
            disabled={isSaving}
          >
            <Text className="text-white text-base font-semibold">{isSaving ? t("saving") : t("saveChanges")}</Text>
          </TouchableOpacity>
        </View>
      )}

      {error && (
        <View className="mx-5 mb-5 p-4 bg-[#fef2f2] rounded-lg border-l-4 border-l-error">
          <Text className="text-error text-sm">{getAccountErrorMessage(error, t)}</Text>
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
        {icon && <Ionicons name={icon} size={20} color={AQUACARE_COLORS.GRAY_LIGHT} />}
        <Text className={`text-sm text-gray-light ${icon ? "ml-3" : ""} flex-1`}>{label}</Text>
      </View>
      {editable ? (
        <TextInput
          className="border border-gray-300 rounded-md px-2 text-right text-gray-dark flex-1"
          style={[sharedTextInputStyles.compactSmall, { flex: 1 }]}
          value={inputValue}
          onChangeText={onChangeText}
          placeholder={placeholder}
          keyboardType={keyboardType}
          autoCapitalize="words"
        />
      ) : (
        <Text className="text-sm text-gray-dark font-medium flex-1 text-right">{value}</Text>
      )}
    </View>
  );
}
