import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useTranslation } from 'react-i18next';

import LocationSelector from '@/components/common/LocationSelector';
import { AppText, Button, Card, ErrorState, IconButton, InteractiveCard, LoadingState, SelectionModal } from '@/components/ui';
import { INTERVENTION_ZONES } from '@/constants/cameroon';
import { getAccountErrorMessage } from '@/features/auth/utils/accountsErrorPresenter';
import { ProfileInfoRow } from '@/features/profile/components/ProfileInfoRow';
import { useProfileEditor } from '@/features/profile/hooks/useProfileEditor';
import { getCertificationPresentation } from '@/features/profile/utils/accountProfilePresentation';
import { useAuth } from '@/hooks/useAuth';
import type { ProfileStackParamList } from '@/navigation/MainNavigator';
import { colors, radii, spacing } from '@/theme';

type ProfileScreenNavigationProp = StackNavigationProp<ProfileStackParamList, 'ProfileMain'>;

interface Props { navigation: ProfileScreenNavigationProp; }

export default function ProfileScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { user, farmProfile, isLoading, error, updateProfile, loadProfile, logout, displayName, isIndividual } = useAuth();
  const [showInterventionZoneModal, setShowInterventionZoneModal] = useState(false);
  const { isEditing, setIsEditing, isSaving, editData, updateEditField, locationData, setLocationData, save } = useProfileEditor({ user, updateProfile });
  const certification = useMemo(() => getCertificationPresentation(farmProfile, t), [farmProfile, t]);

  useEffect(() => {
    if (!user && !farmProfile && !isLoading && !error) void loadProfile();
  }, [error, farmProfile, isLoading, loadProfile, user]);

  const handleSave = async () => {
    try {
      await save();
      Alert.alert(t('success'), t('profileUpdatedSuccess'));
    } catch (saveError) {
      Alert.alert(t('error'), getAccountErrorMessage(saveError, t));
    }
  };

  const handleLogout = () => {
    Alert.alert(t('logoutConfirm'), t('logoutMessage'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('logoutConfirm'), style: 'destructive', onPress: () => logout() },
    ]);
  };

  if (error && !user) return <ErrorState title={t('error')} message={getAccountErrorMessage(error, t)} actionLabel={t('retry')} onAction={() => void loadProfile()} />;
  if (isLoading || !user) return <LoadingState message={t(user ? 'loading' : 'loadingUserProfile')} />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <View style={styles.avatar}><Ionicons name="person" size={32} color={colors.text.inverse} /></View>
        <AppText variant="screenTitle" color="inverse" style={styles.center}>{displayName}</AppText>
        <AppText color="inverse">{isIndividual ? t('individualAccount') : t('companyAccount')}</AppText>
        {farmProfile ? <View style={[styles.certification, { backgroundColor: certification.color }]}><Ionicons name={certification.icon} size={16} color={colors.text.inverse} /><AppText variant="label" color="inverse">{certification.text}</AppText></View> : null}
      </View>

      <Section title={isIndividual ? t('personalInfo') : t('companyInfo')} action={<IconButton icon={isEditing ? 'close' : 'pencil'} accessibilityLabel={t(isEditing ? 'cancel' : 'edit')} variant="ghost" onPress={() => setIsEditing(!isEditing)} />}>
        <ProfileInfoRow label={t('phoneNumber')} value={user.phone_number} />
        <ProfileInfoRow label={t('email')} value={isEditing ? undefined : user.email || t('notProvided')} editable={isEditing} onChangeText={(value) => updateEditField('email', value)} inputValue={editData.email} placeholder={t('yourEmail')} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" selectable />
        {isIndividual ? <>
          <ProfileInfoRow label={t('firstName')} value={user.first_name || t('notProvided')} />
          <ProfileInfoRow label={t('lastName')} value={user.last_name || t('notProvided')} />
          {user.age_group ? <ProfileInfoRow label={t('ageGroup')} value={user.age_group} /> : null}
        </> : <>
          <ProfileInfoRow label={t('businessName')} value={user.business_name || t('notProvided')} />
          {user.legal_status ? <ProfileInfoRow label={t('legalStatus')} value={user.legal_status} /> : null}
          {user.promoter_name ? <ProfileInfoRow label={t('promoterName')} value={user.promoter_name} /> : null}
        </>}
      </Section>

      <Section title={t('location')}>
        {user.region ? <ProfileInfoRow label={t('region')} value={user.region} /> : null}
        <LocationSelector value={locationData} onChange={setLocationData} userRegion={user.region} editable={isEditing} />
        {isEditing ? <InteractiveCard accessibilityLabel={t('selectInterventionZone')} onPress={() => setShowInterventionZoneModal(true)} style={styles.selector}>
          <View style={styles.flex}><AppText variant="label">{t('interventionZone')} *</AppText><AppText variant="caption" color={editData.intervention_zone ? 'link' : 'muted'}>{editData.intervention_zone ? t(INTERVENTION_ZONES.find((zone) => zone.value === editData.intervention_zone)?.labelKey || 'notProvided') : t('selectInterventionZone')}</AppText></View>
          <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
        </InteractiveCard> : <ProfileInfoRow label={t('interventionZone')} value={user.intervention_zone ? t(INTERVENTION_ZONES.find((zone) => zone.value === user.intervention_zone)?.labelKey || 'notProvided') : t('notProvided')} />}
      </Section>

      <Section title={t('preferences')}>
        <ProfileInfoRow icon="language" label={t('preferredLanguage')} value={user.language_preference === 'fr' ? t('french') : t('english')} />
        <ProfileInfoRow icon="shield-checkmark" label={t('accountVerified')} value={user.is_verified ? t('yes') : t('no')} />
      </Section>

      {isEditing ? <Button label={isSaving ? t('saving') : t('saveChanges')} loading={isSaving} onPress={handleSave} /> : null}
      <View style={styles.links}>
        <InteractiveCard accessibilityLabel={t('farmManagement')} onPress={() => navigation.navigate('FarmProfile')}><AppText variant="bodyStrong">{t('farmManagement')}</AppText><Ionicons name="chevron-forward" size={20} color={colors.text.muted} /></InteractiveCard>
        <InteractiveCard accessibilityLabel={t('settings')} onPress={() => navigation.navigate('Settings')}><View style={styles.row}><Ionicons name="settings" size={20} color={colors.brand.primary} /><AppText variant="bodyStrong">{t('settings')}</AppText></View><Ionicons name="chevron-forward" size={20} color={colors.text.muted} /></InteractiveCard>
        <Button label={t('disconnect')} variant="danger" iconLeft="log-out" onPress={handleLogout} />
      </View>

      <SelectionModal visible={showInterventionZoneModal} title={t('selectInterventionZone')} options={INTERVENTION_ZONES.map((zone) => ({ value: zone.value, label: t(zone.labelKey) }))} selectedValue={editData.intervention_zone} onSelect={(value) => { updateEditField('intervention_zone', value); setShowInterventionZoneModal(false); }} onClose={() => setShowInterventionZoneModal(false)} closeLabel={t('close')} emptyLabel={t('notProvided')} />
    </ScrollView>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <View style={styles.section}><View style={styles.sectionHeader}><AppText variant="sectionTitle">{title}</AppText>{action}</View><Card variant="outlined">{children}</Card></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  content: { gap: spacing[4], paddingBottom: spacing[6] },
  hero: { alignItems: 'center', gap: spacing[2], backgroundColor: colors.brand.primary, padding: spacing[5] },
  avatar: { width: 80, height: 80, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand.dark },
  certification: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], borderRadius: radii.full, paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  center: { textAlign: 'center' },
  section: { gap: spacing[2], paddingHorizontal: spacing[4] },
  sectionHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selector: { marginTop: spacing[3] },
  flex: { flex: 1, gap: spacing[1] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  links: { gap: spacing[3], paddingHorizontal: spacing[4] },
});
