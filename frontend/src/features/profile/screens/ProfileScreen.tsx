import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { StackNavigationProp } from "@react-navigation/stack";
import { AQUACARE_COLORS } from "@/constants/colors";
import { ProfileStackParamList } from "@/navigation/MainNavigator";
import { useAuth } from "@/hooks/useAuth";
import { INTERVENTION_ZONES } from "@/constants/cameroon";
import LocationSelector from "@/components/common/LocationSelector";
import { getAccountErrorMessage } from "@/features/auth/utils/accountsErrorPresenter";
import { useProfileEditor } from "@/features/profile/hooks/useProfileEditor";
import { getCertificationPresentation } from "@/features/profile/utils/accountProfilePresentation";
import { ProfileInfoRow } from '@/features/profile/components/ProfileInfoRow';
import { SelectionModal } from '@/components/ui';

type ProfileScreenNavigationProp = StackNavigationProp<ProfileStackParamList, "ProfileMain">;

interface Props {
  navigation: ProfileScreenNavigationProp;
}

export default function ProfileScreen({ navigation }: Props) {
  const { t } = useTranslation();
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

  const [showInterventionZoneModal, setShowInterventionZoneModal] = useState(false);
  const {
    isEditing,
    setIsEditing,
    isSaving,
    editData,
    updateEditField,
    locationData,
    setLocationData,
    save,
  } = useProfileEditor({ user, updateProfile });
  const certification = useMemo(
    () => getCertificationPresentation(farmProfile, t),
    [farmProfile, t]
  );

  useEffect(() => {
    if (!user && !farmProfile && !isLoading) {
      loadProfile();
    }
  }, [farmProfile, isLoading, loadProfile, user]);

  const handleSave = async () => {
    try {
      await save();
      Alert.alert(t("success"), t("profileUpdatedSuccess"));
    } catch (err) {
      Alert.alert(t("error"), getAccountErrorMessage(err, t));
    }
  };

  const handleLogout = () => {
    Alert.alert(t("logoutConfirm"), t("logoutMessage"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("logoutConfirm"), style: "destructive", onPress: () => logout() },
    ]);
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

  if (error && !user) {
    return (
      <View className="flex-1 items-center justify-center bg-cream px-6">
        <Text className="text-error text-center">{t("error")}: {getAccountErrorMessage(error, t)}</Text>
        <TouchableOpacity className="bg-aquacare-primary px-6 py-3 rounded-lg mt-5" onPress={() => loadProfile()}>
          <Text className="text-white font-semibold text-base">{t("retry")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-cream">
      <View className="bg-aquacare-primary items-center pt-14 pb-6 px-5">
        <View className="w-20 h-20 rounded-full bg-green-dark items-center justify-center mb-3">
          <Ionicons name="person" size={32} color={AQUACARE_COLORS.WHITE} />
        </View>
        <Text className="text-2xl font-bold text-white text-center mb-1">{displayName}</Text>
        <Text className="text-base text-white/80 mb-3">{isIndividual ? t("individualAccount") : t("companyAccount")}</Text>
        {farmProfile && (
          <View className="flex-row items-center px-3 py-2 rounded-full" style={{ backgroundColor: certification.color }}>
            <Ionicons name={certification.icon} size={16} color={AQUACARE_COLORS.WHITE} />
            <Text className="text-sm font-semibold text-white ml-2">{certification.text}</Text>
          </View>
        )}
      </View>

      <View className="px-5 py-5">
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-lg font-bold text-gray-dark">{isIndividual ? t("personalInfo") : t("companyInfo")}</Text>
          <TouchableOpacity onPress={() => setIsEditing(!isEditing)} className="p-2">
            <Ionicons name={isEditing ? "close" : "pencil"} size={20} color={AQUACARE_COLORS.GREEN_PRIMARY} />
          </TouchableOpacity>
        </View>
        <View className="bg-white rounded-xl p-4">
          <ProfileInfoRow label={t("phoneNumber") || ""} value={user.phone_number} />
          <ProfileInfoRow
            label={t("email") || ""}
            value={isEditing ? undefined : user.email || t("notProvided")}
            editable={isEditing}
            onChangeText={(value) => updateEditField("email", value)}
            inputValue={editData.email}
            placeholder={t("yourEmail") || ""}
            selectable
          />

          {isIndividual ? (
            <>
              <ProfileInfoRow label={t("firstName") || ""} value={user.first_name || t("notProvided")} />
              <ProfileInfoRow label={t("lastName") || ""} value={user.last_name || t("notProvided")} />
              {user.age_group && <ProfileInfoRow label={t("ageGroup") || ""} value={user.age_group} />}
            </>
          ) : (
            <>
              <ProfileInfoRow
                label={t("businessName") || ""}
                value={user.business_name || t("notProvided")}
              />
              {user.legal_status && (
                <ProfileInfoRow label={t("legalStatus") || ""} value={user.legal_status} />
              )}
              {user.promoter_name && (
                <ProfileInfoRow label={t("promoterName") || ""} value={user.promoter_name} />
              )}
            </>
          )}

        </View>
      </View>

      <View className="px-5 py-3">
        <Text className="text-lg font-bold text-gray-dark mb-3">{t("location")}</Text>
        <View className="bg-white rounded-xl p-4">
          {user.region && <ProfileInfoRow label={t("region") || ""} value={user.region} />}
          <LocationSelector value={locationData} onChange={setLocationData} userRegion={user?.region} editable={isEditing} />

          {isEditing ? (
            <TouchableOpacity
              className={`flex-row items-center justify-between px-4 py-3 mt-3 rounded-xl border ${
                editData.intervention_zone ? "border-aquacare-primary bg-aquacare-selected" : "border-gray-200 bg-white"
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
              <Ionicons name="chevron-forward" size={16} color={AQUACARE_COLORS.GRAY_LIGHT} />
            </TouchableOpacity>
          ) : (
            <ProfileInfoRow
              label={t("interventionZone") || ""}
              value={
                user.intervention_zone
                  ? t(INTERVENTION_ZONES.find((z) => z.value === user.intervention_zone)?.labelKey || "notProvided")
                  : t("notProvided")
              }
            />
          )}
        </View>
      </View>

      <View className="px-5 py-3">
        <Text className="text-lg font-bold text-gray-dark mb-3">{t("preferences")}</Text>
        <View className="bg-white rounded-xl p-4">
          <ProfileInfoRow
            icon="language"
            label={t("preferredLanguage") || ""}
            value={user.language_preference === "fr" ? t("french") : t("english")}
          />
          <ProfileInfoRow
            icon="shield-checkmark"
            label={t("accountVerified") || ""}
            value={user.is_verified ? t("yes") : t("no")}
          />
        </View>
      </View>

      {isEditing && (
        <View className="px-5 pb-4">
          <TouchableOpacity
            className={`py-4 rounded-lg items-center ${isSaving ? "bg-aquacare-primary/70" : "bg-aquacare-primary"}`}
            onPress={handleSave}
            disabled={isSaving}
          >
            <Text className="text-white text-base font-semibold">{isSaving ? t("saving") : t("saveChanges")}</Text>
          </TouchableOpacity>
        </View>
      )}

      <View className="px-5 pb-8">
        <TouchableOpacity className="bg-white flex-row items-center p-4 rounded-xl mb-3" onPress={() => navigation.navigate("FarmProfile")}>
          <Text className="text-base font-semibold text-gray-dark flex-1">{t("farmManagement")}</Text>
          <Ionicons name="chevron-forward" size={20} color={AQUACARE_COLORS.GRAY_LIGHT} />
        </TouchableOpacity>

        <TouchableOpacity className="bg-white flex-row items-center p-4 rounded-xl mb-3" onPress={() => navigation.navigate("Settings")}>
          <Ionicons name="settings" size={20} color={AQUACARE_COLORS.GREEN_PRIMARY} />
          <Text className="text-base font-semibold text-gray-dark flex-1 ml-3">{t("settings")}</Text>
          <Ionicons name="chevron-forward" size={20} color={AQUACARE_COLORS.GRAY_LIGHT} />
        </TouchableOpacity>

        <TouchableOpacity className="bg-error flex-row items-center justify-center p-4 rounded-xl" onPress={handleLogout}>
          <Ionicons name="log-out" size={20} color={AQUACARE_COLORS.WHITE} />
          <Text className="text-white text-base font-semibold ml-2">{t("disconnect")}</Text>
        </TouchableOpacity>
      </View>

      <SelectionModal
        visible={showInterventionZoneModal}
        title={t('selectInterventionZone')}
        options={INTERVENTION_ZONES.map((zone) => ({ value: zone.value, label: t(zone.labelKey) }))}
        selectedValue={editData.intervention_zone}
        onSelect={(value) => {
          updateEditField('intervention_zone', value);
          setShowInterventionZoneModal(false);
        }}
        onClose={() => setShowInterventionZoneModal(false)}
        closeLabel={t('close')}
        emptyLabel={t('notProvided')}
      />
    </ScrollView>
  );
}
