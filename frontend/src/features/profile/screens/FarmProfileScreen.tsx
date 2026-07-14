import React, { useCallback, useMemo, useRef, useState } from "react";
import { Alert, Linking, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { RootStackParamList } from "@/navigation/MainNavigator";
import type { StackNavigationProp } from "@react-navigation/stack";
import { aquacultureService } from "@/features/aquaculture/services/aquacultureService";
import { useAuth } from "@/hooks/useAuth";
import { useFarmLocation } from "@/hooks/useFarmLocation";
import { getAccountErrorMessage } from "@/features/auth/utils/accountsErrorPresenter";
import { useFarmProfileEditor } from "@/features/profile/hooks/useFarmProfileEditor";
import { formatFarmName, getCertificationPresentation } from "@/features/profile/utils/accountProfilePresentation";
import { ProfileInfoRow } from '@/features/profile/components/ProfileInfoRow';
import { AppText, Button, Card, EmptyState, ErrorState, IconButton, InlineAlert, LoadingState } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';
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
  const activeProductionUnits = useMemo(
    () => productionUnits.filter((unit) => unit.status === "active"),
    [productionUnits]
  );
  const { totalSurfaceM2, totalVolumeM3 } = useMemo(() => {
    const aggregateDimension = (selector: (unit: ProductionUnit) => number | string | null | undefined) =>
      activeProductionUnits.reduce((total, unit) => {
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
  }, [activeProductionUnits]);
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
        aquacultureService.getProductionUnits({ status: "active" }).then(setProductionUnits).catch(() => undefined),
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

  if (isLoading && !farmProfile) return <LoadingState message={t('loading')} />;
  if (error && !farmProfile) return <ErrorState title={t('error')} message={`${getAccountErrorMessage(error, t)} ${t('unableToLoadFarmProfile')}`} actionLabel={t('retry')} onAction={() => void refreshFarmProfile()} />;
  if (!farmProfile) return <EmptyState title={t('noFarmProfile')} message={t('loadingFarmProfile')} actionLabel={t('reloadProfile')} onAction={() => void refreshFarmProfile()} />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshFarmProfile} tintColor={colors.brand.primary} />}>
      <View style={styles.hero}>
        <View style={styles.avatar}><Ionicons name="business" size={32} color={colors.text.inverse} /></View>
        <AppText variant="screenTitle" color="inverse" style={styles.center}>{formatFarmName(farmProfile.farm_name) || t('myFarm')}</AppText>
        <View style={[styles.certification, { backgroundColor: certification.color }]}><Ionicons name={certification.icon} size={16} color={colors.text.inverse} /><AppText variant="label" color="inverse">{certification.text}</AppText></View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}><AppText variant="sectionTitle">{t('farmInfo')}</AppText><IconButton icon={isEditing ? 'close' : 'pencil'} accessibilityLabel={t(isEditing ? 'cancel' : 'edit')} variant="ghost" onPress={() => setIsEditing(!isEditing)} /></View>
        <Card variant="outlined">
          <ProfileInfoRow
            label={t("farmName") || ""}
            value={isEditing ? undefined : formatFarmName(farmProfile.farm_name) || t("notProvided")}
            editable={isEditing}
            onChangeText={(value) => updateEditField("farm_name", value)}
            inputValue={editData.farm_name?.toString()}
            placeholder={t("farmNamePlaceholder") || ""}
          />
          <ProfileInfoRow
            label={t("totalPonds") || ""}
            value={activeProductionUnits.length.toString()}
          />
          <ProfileInfoRow
            label={t("surfaceTotal") || ""}
            value={totalSurfaceM2 > 0 ? `${totalSurfaceM2} m²` : t("notProvided")}
          />
          <ProfileInfoRow
            label={t("volumeTotal") || ""}
            value={totalVolumeM3 > 0 ? `${totalVolumeM3} m³` : t("notProvided")}
          />
          <ProfileInfoRow
            label={t("waterSource") || ""}
            value={isEditing ? undefined : farmProfile.water_source || t("notProvided")}
            editable={isEditing}
            onChangeText={(value) => updateEditField("water_source", value)}
            inputValue={editData.water_source}
            placeholder={t("waterSourcePlaceholder") || ""}
          />
        </Card>
      </View>

      <View style={styles.section}>
        <AppText variant="sectionTitle">{t('farmLocation')}</AppText>
        <Card variant="outlined" style={styles.locationCard}>
          {farmProfile.latitude && farmProfile.longitude ? (
            <>
              <View style={styles.locationStatus}>
                <Ionicons name="checkmark-circle" size={20} color={colors.brand.primary} />
                <View style={styles.flex}>
                  <AppText variant="label" color="link">{t('locationCaptureSuccess')}</AppText>
                  {farmProfile.location_address ? <AppText>{farmProfile.location_address}</AppText> : null}
                </View>
              </View>
              <Button label={t('viewOnMap')} variant="outline" onPress={handleOpenMap} />
              <Button label={locationStatus === 'requesting' || isSaving ? t('locatingFarm') : t('updateLocation')} variant="ghost" iconLeft="locate" disabled={locationStatus === 'requesting' || isSaving} onPress={handleLocateFarm} />
            </>
          ) : (
            <>
              <View style={styles.emptyLocation}>
                <Ionicons name="location-outline" size={32} color={colors.text.muted} />
                <AppText color="muted" style={styles.center}>{t('farmNoLocation')}</AppText>
              </View>
              <Button label={locationStatus === 'requesting' || isSaving ? t('locatingFarm') : t('locateFarm')} iconLeft="locate" loading={locationStatus === 'requesting' || isSaving} onPress={handleLocateFarm} />
            </>
          )}
        </Card>
      </View>

      {isEditing ? <View style={styles.section}><Button label={isSaving ? t('saving') : t('saveChanges')} loading={isSaving} onPress={handleSave} /></View> : null}

      {error ? <View style={styles.section}><InlineAlert tone="error" message={getAccountErrorMessage(error, t)} /></View> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  content: { gap: spacing[4], paddingBottom: spacing[6] },
  hero: { alignItems: 'center', gap: spacing[2], backgroundColor: colors.brand.primary, padding: spacing[5] },
  avatar: { width: 64, height: 64, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand.dark },
  certification: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], borderRadius: radii.full, paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  center: { textAlign: 'center' },
  section: { gap: spacing[2], paddingHorizontal: spacing[4] },
  sectionHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  locationCard: { gap: spacing[3] },
  locationStatus: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  emptyLocation: { alignItems: 'center', gap: spacing[2], paddingVertical: spacing[2] },
  flex: { flex: 1, gap: spacing[1] },
});
