import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, Modal } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { StackNavigationProp } from "@react-navigation/stack";
import { MAVECAM_COLORS } from "@/constants/colors";
import { ProfileStackParamList } from "@/navigation/MainNavigator";
import { useAuth } from "@/hooks/useAuth";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "@/store/store";
import { fetchDashboardData } from "@/features/aquaculture/store/aquacultureSlice";
import { User } from "@/types/auth";
import { INTERVENTION_ZONES } from "@/constants/cameroon";
import LocationSelector from "@/components/common/LocationSelector";

type ProfileScreenNavigationProp = StackNavigationProp<ProfileStackParamList, "ProfileMain">;

interface LocationData {
  region?: string;
  department?: string;
  arrondissement?: string;
  city?: string;
  neighborhood?: string;
}

interface Props {
  navigation: ProfileScreenNavigationProp;
}

export default function ProfileScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const {
    user,
    farmProfile,
    isLoading,
    error,
    updateProfile,
    loadProfile,
    logout,
    displayName,
    isIndividual,
  } = useAuth();

  const { dashboardData } = useSelector((state: RootState) => state.aquaculture);
  const activeCycles = dashboardData?.active_cycles || [];

  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<User>>({});
  const [locationData, setLocationData] = useState<LocationData>({});
  const [showInterventionZoneModal, setShowInterventionZoneModal] = useState(false);

  useEffect(() => {
    dispatch(fetchDashboardData());
  }, [dispatch]);

  useEffect(() => {
    if (!user && !farmProfile && !isLoading) {
      loadProfile();
    }
  }, []);

  useEffect(() => {
    if (user) {
      setEditData({
        email: user.email || "",
        intervention_zone: user.intervention_zone || "",
        legal_status: user.legal_status || "",
        promoter_name: user.promoter_name || "",
      });
      setLocationData({
        region: user.region || "",
        department: user.department || "",
        arrondissement: user.district || "",
        city: user.city || "",
        neighborhood: user.neighborhood || "",
      });
    }
  }, [user]);

  const handleLocationChange = (newLocation: LocationData) => setLocationData(newLocation);

  const handleSave = async () => {
    try {
      const combinedData = {
        ...editData,
        region: locationData.region,
        department: locationData.department,
        district: locationData.arrondissement,
        city: locationData.city,
        neighborhood: locationData.neighborhood,
      };
      await updateProfile(combinedData);
      setIsEditing(false);
      Alert.alert(t("success"), t("profileUpdatedSuccess"));
    } catch (err) {
      Alert.alert(t("error"), t("profileUpdateError"));
    }
  };

  const handleLogout = () => {
    Alert.alert(t("logoutConfirm"), t("logoutMessage"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("logoutConfirm"), style: "destructive", onPress: () => logout() },
    ]);
  };

  const formatFarmName = (farmName: string | undefined) => {
    if (!farmName) return "";
    if (farmName.startsWith("Ferme de ") && farmName.includes(" ")) {
      const parts = farmName.replace("Ferme de ", "").split(" ");
      if (parts.length > 1) return `Ferme de ${parts[parts.length - 1]}`;
    }
    return farmName;
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });

  const getCertificationColor = () => {
    if (!farmProfile) return MAVECAM_COLORS.GRAY_LIGHT;
    switch (farmProfile.certification_status) {
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
    if (!farmProfile) return t("noFarmProfile");
    switch (farmProfile.certification_status) {
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
    if (!farmProfile) return "help-circle";
    switch (farmProfile.certification_status) {
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

  if (!user) {
    return (
      <View className="flex-1 items-center justify-center bg-cream">
        <Text>{t("loadingUserProfile")}</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-cream">
        <Text>{t("loading")}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-cream px-6">
        <Text className="text-error text-center">{t("error")}: {error}</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-cream">
      <View className="bg-mavecam-primary items-center pt-14 pb-6 px-5">
        <View className="w-20 h-20 rounded-full bg-green-dark items-center justify-center mb-3">
          <Ionicons name="person" size={32} color={MAVECAM_COLORS.WHITE} />
        </View>
        <Text className="text-2xl font-bold text-white text-center mb-1">{displayName}</Text>
        <Text className="text-base text-white/80 mb-3">{isIndividual ? t("individualAccount") : t("companyAccount")}</Text>
        {farmProfile && (
          <View className="flex-row items-center px-3 py-2 rounded-full" style={{ backgroundColor: getCertificationColor() }}>
            <Ionicons name={getCertificationIcon()} size={16} color={MAVECAM_COLORS.WHITE} />
            <Text className="text-sm font-semibold text-white ml-2">{getCertificationText()}</Text>
          </View>
        )}
      </View>

      <View className="px-5 py-5">
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-lg font-bold text-gray-dark">{isIndividual ? t("personalInfo") : t("companyInfo")}</Text>
          <TouchableOpacity onPress={() => setIsEditing(!isEditing)} className="p-2">
            <Ionicons name={isEditing ? "close" : "pencil"} size={20} color={MAVECAM_COLORS.GREEN_PRIMARY} />
          </TouchableOpacity>
        </View>
        <View className="bg-white rounded-xl p-4">
          <InfoRow label={t("phoneNumber") || ""} value={user.phone_number} editable={false} />
          <InfoRow
            label={t("email") || ""}
            value={isEditing ? undefined : user.email || t("notProvided")}
            editable={isEditing}
            onChangeText={(value) => setEditData((prev) => ({ ...prev, email: value }))}
            inputValue={editData.email}
            placeholder={t("yourEmail") || ""}
            isEmail
          />

          {isIndividual ? (
            <>
              <InfoRow label={t("firstName") || ""} value={user.first_name || t("notProvided")} editable={false} />
              <InfoRow label={t("lastName") || ""} value={user.last_name || t("notProvided")} editable={false} />
              {user.age_group && <InfoRow label={t("ageGroup") || ""} value={user.age_group} editable={false} />}
            </>
          ) : (
            <>
              <InfoRow
                label={t("businessName") || ""}
                value={user.business_name || t("notProvided")}
                editable={false}
              />
              {user.legal_status && (
                <InfoRow label={t("legalStatus") || ""} value={user.legal_status} editable={false} />
              )}
              {user.promoter_name && (
                <InfoRow label={t("promoterName") || ""} value={user.promoter_name} editable={false} />
              )}
            </>
          )}

          {user.activity_type && <InfoRow label={t("activityType") || ""} value={user.activity_type} editable={false} />}
        </View>
      </View>

      <View className="px-5 py-3">
        <Text className="text-lg font-bold text-gray-dark mb-3">{t("location")}</Text>
        <View className="bg-white rounded-xl p-4">
          {user.region && <InfoRow label={t("region") || ""} value={user.region} editable={false} />}
          <LocationSelector value={locationData} onChange={handleLocationChange} userRegion={user?.region} editable={isEditing} />

          {isEditing ? (
            <TouchableOpacity
              className={`flex-row items-center justify-between px-4 py-3 mt-3 rounded-xl border ${
                editData.intervention_zone ? "border-mavecam-primary bg-[#f0fdf4]" : "border-gray-200 bg-white"
              }`}
              onPress={() => setShowInterventionZoneModal(true)}
            >
              <View className="flex-1">
                <Text className="text-sm font-medium text-gray-dark">{t("interventionZone")} *</Text>
                <Text className={`text-sm mt-1 ${editData.intervention_zone ? "text-green-dark" : "text-gray-light italic"}`}>
                  {editData.intervention_zone
                    ? t(INTERVENTION_ZONES.find((z) => z.value === editData.intervention_zone)?.labelKey || "notProvided")
                    : t("selectInterventionZone")}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={MAVECAM_COLORS.GRAY_LIGHT} />
            </TouchableOpacity>
          ) : (
            <InfoRow
              label={t("interventionZone") || ""}
              value={
                user.intervention_zone
                  ? t(INTERVENTION_ZONES.find((z) => z.value === user.intervention_zone)?.labelKey || "notProvided")
                  : t("notProvided")
              }
              editable={false}
            />
          )}
        </View>
      </View>

      {farmProfile && (
        <View className="px-5 py-3">
          <Text className="text-lg font-bold text-gray-dark mb-3">{t("farmInfo")}</Text>
          <View className="bg-white rounded-xl p-4">
            <InfoRow label={t("farmName") || ""} value={formatFarmName(farmProfile.farm_name)} editable={false} icon="business" />
            <InfoRow label={t("totalPonds") || ""} value={activeCycles.length.toString()} editable={false} icon="water" />
            {farmProfile.total_area_m2 && (
              <InfoRow
                label={t("totalArea") || ""}
                value={`${farmProfile.total_area_m2} m²`}
                editable={false}
                icon="resize"
              />
            )}
            {farmProfile.water_source && (
              <InfoRow label={t("waterSource") || ""} value={farmProfile.water_source} editable={false} icon="water" />
            )}
            {farmProfile.main_species && (
              <InfoRow label={t("mainSpecies") || ""} value={farmProfile.main_species} editable={false} icon="fish" />
            )}
            {farmProfile.annual_production_kg && (
              <InfoRow
                label={t("annualProduction") || ""}
                value={`${farmProfile.annual_production_kg} kg`}
                editable={false}
                icon="scale"
              />
            )}
          </View>
        </View>
      )}

      <View className="px-5 py-3">
        <Text className="text-lg font-bold text-gray-dark mb-3">{t("preferences")}</Text>
        <View className="bg-white rounded-xl p-4">
          <InfoRow
            icon="language"
            label={t("preferredLanguage") || ""}
            value={user.language_preference === "fr" ? t("french") : t("english")}
            editable={false}
          />
          <InfoRow
            icon="shield-checkmark"
            label={t("accountVerified") || ""}
            value={user.is_verified ? t("yes") : t("no")}
            editable={false}
          />
        </View>
      </View>

      {isEditing && (
        <View className="px-5 pb-4">
          <TouchableOpacity
            className={`py-4 rounded-lg items-center ${isLoading ? "bg-mavecam-primary/70" : "bg-mavecam-primary"}`}
            onPress={handleSave}
            disabled={isLoading}
          >
            <Text className="text-white text-base font-semibold">{isLoading ? t("saving") : t("saveChanges")}</Text>
          </TouchableOpacity>
        </View>
      )}

      <View className="px-5 pb-8">
        <TouchableOpacity className="bg-white flex-row items-center p-4 rounded-xl mb-3" onPress={() => navigation.navigate("FarmProfile")}>
          <Ionicons name="analytics" size={20} color={MAVECAM_COLORS.GREEN_PRIMARY} />
          <Text className="text-base font-semibold text-gray-dark flex-1 ml-3">{t("farmManagement")}</Text>
          <Ionicons name="chevron-forward" size={20} color={MAVECAM_COLORS.GRAY_LIGHT} />
        </TouchableOpacity>

        <TouchableOpacity className="bg-white flex-row items-center p-4 rounded-xl mb-3" onPress={() => navigation.navigate("Settings")}>
          <Ionicons name="settings" size={20} color={MAVECAM_COLORS.GREEN_PRIMARY} />
          <Text className="text-base font-semibold text-gray-dark flex-1 ml-3">{t("settings")}</Text>
          <Ionicons name="chevron-forward" size={20} color={MAVECAM_COLORS.GRAY_LIGHT} />
        </TouchableOpacity>

        <TouchableOpacity className="bg-error flex-row items-center justify-center p-4 rounded-xl" onPress={handleLogout}>
          <Ionicons name="log-out" size={20} color={MAVECAM_COLORS.WHITE} />
          <Text className="text-white text-base font-semibold ml-2">{t("disconnect")}</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showInterventionZoneModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowInterventionZoneModal(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-2xl max-h-[80%] pb-5">
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-slate-100">
              <Text className="text-lg font-bold text-gray-dark">{t("selectInterventionZone")}</Text>
              <TouchableOpacity onPress={() => setShowInterventionZoneModal(false)} className="p-1">
                <Ionicons name="close" size={24} color={MAVECAM_COLORS.GRAY_DARK} />
              </TouchableOpacity>
            </View>

            <ScrollView className="max-h-96 min-h-56">
              {INTERVENTION_ZONES.map((zone) => (
                <TouchableOpacity
                  key={zone.value}
                  className={`flex-row items-center justify-between px-5 py-4 border-b border-slate-50 ${
                    editData.intervention_zone === zone.value ? "bg-[#f0fdf4]" : "bg-white"
                  }`}
                  onPress={() => {
                    setEditData((prev) => ({ ...prev, intervention_zone: zone.value }));
                    setShowInterventionZoneModal(false);
                  }}
                >
                  <Text
                    className={`text-base flex-1 ${
                      editData.intervention_zone === zone.value ? "text-green-dark font-semibold" : "text-gray-dark"
                    }`}
                  >
                    {t(zone.labelKey)}
                  </Text>
                  {editData.intervention_zone === zone.value && (
                    <Ionicons name="checkmark" size={20} color={MAVECAM_COLORS.GREEN_PRIMARY} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

interface InfoRowProps {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  editable: boolean;
  onChangeText?: (text: string) => void;
  inputValue?: string;
  placeholder?: string;
  keyboardType?: "default" | "numeric";
  isEmail?: boolean;
}

function InfoRow({
  icon,
  label,
  value,
  editable,
  onChangeText,
  inputValue,
  placeholder,
  keyboardType = "default",
  isEmail = false,
}: InfoRowProps) {
  return (
    <View className="flex-row justify-between items-center py-3 border-b border-slate-100">
      <View className="flex-row items-center flex-1 mr-3">
        {icon && <Ionicons name={icon} size={20} color={MAVECAM_COLORS.GRAY_LIGHT} />}
        <Text className={`text-sm text-gray-light ${icon ? "ml-3" : ""} flex-1`}>{label}</Text>
      </View>
      {editable ? (
        <TextInput
          className="border border-gray-300 rounded-md px-2 py-1 text-sm text-right text-gray-dark flex-1"
          value={inputValue}
          onChangeText={onChangeText}
          placeholder={placeholder}
          keyboardType={keyboardType}
          autoCapitalize="words"
        />
      ) : (
        <Text className={`text-sm text-gray-dark font-medium flex-1 text-right ${isEmail ? "" : ""}`} selectable={isEmail}>
          {value}
        </Text>
      )}
    </View>
  );
}
