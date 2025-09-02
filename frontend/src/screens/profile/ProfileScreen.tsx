import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { StackNavigationProp } from '@react-navigation/stack';

// Couleurs MAVECAM selon spécifications
const MAVECAM_COLORS = {
  GREEN_PRIMARY: '#059669',
  GREEN_LIGHT: '#10b981',
  GREEN_DARK: '#047857',
  WHITE: '#ffffff',
  CREAM: '#f8fafc',
  BLUE: '#2563eb',
  SUCCESS: '#059669',
  WARNING: '#f59e0b',
  ERROR: '#dc2626',
  INFO: '#0ea5e9',
  GRAY_LIGHT: '#64748b',
  GRAY_DARK: '#1e293b',
};

import { ProfileStackParamList } from '@/navigation/MainNavigator';
import { useAuth } from '@/hooks/useAuth';
import { User } from '@/types/auth';

type ProfileScreenNavigationProp = StackNavigationProp<ProfileStackParamList, 'ProfileMain'>;

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
    isFarmCertified 
  } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<User>>({});
  const [showAllDetails, setShowAllDetails] = useState(false);

  useEffect(() => {
    // Load profile data only if we really need it
    // Don't reload if we already have user data from login
    if (!user && !farmProfile && !isLoading) {
      console.log('🔄 ProfileScreen: Loading profile data...');
      loadProfile();
    }
  }, []); // Empty dependency array - load only once on mount

  useEffect(() => {
    // Initialize edit data when user data changes
    if (user) {
      setEditData({
        email: user.email || '',
        district: user.district || '',
        neighborhood: user.neighborhood || '',
        intervention_zone: user.intervention_zone || '',
        department: user.department || '',
        legal_status: user.legal_status || '',
        promoter_name: user.promoter_name || '',
      });
    }
  }, [user]);

  const handleSave = async () => {
    try {
      await updateProfile(editData);
      setIsEditing(false);
      Alert.alert(t('success'), t('profileUpdatedSuccess'));
    } catch (err) {
      Alert.alert(t('error'), t('profileUpdateError'));
    }
  };

  const handleLogout = () => {
    Alert.alert(
      t('logoutConfirm'),
      t('logoutMessage'),
      [
        { text: t('cancel'), style: 'cancel' },
        { 
          text: t('logoutConfirm'), 
          style: 'destructive',
          onPress: () => logout()
        },
      ]
    );
  };

  const handleNavigateToFarm = () => {
    navigation.navigate('FarmProfile');
  };

  const handleNavigateToSettings = () => {
    navigation.navigate('Settings');
  };


  if (!user) {
    return (
      <View style={styles.loadingContainer}>
        <Text>{t('loadingUserProfile')}</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text>{t('loading')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{ color: 'red' }}>{t('error')}: {error}</Text>
      </View>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getCertificationColor = () => {
    if (!farmProfile) return MAVECAM_COLORS.GRAY_LIGHT;
    switch (farmProfile.certification_status) {
      case 'certified': return MAVECAM_COLORS.GREEN_PRIMARY;
      case 'pending': return MAVECAM_COLORS.WARNING;
      case 'suspended': return MAVECAM_COLORS.ERROR;
      case 'rejected': return MAVECAM_COLORS.GRAY_LIGHT;
      default: return MAVECAM_COLORS.GRAY_LIGHT;
    }
  };

  const getCertificationText = () => {
    if (!farmProfile) return t('noFarmProfile');
    switch (farmProfile.certification_status) {
      case 'certified': return t('farmCertified');
      case 'pending': return t('certificationPending');
      case 'suspended': return t('certificationSuspended');
      case 'rejected': return t('certificationRejected');
      default: return t('statusUnknown');
    }
  };

  const getCertificationIcon = () => {
    if (!farmProfile) return 'help-circle';
    switch (farmProfile.certification_status) {
      case 'certified': return 'checkmark-circle';
      case 'pending': return 'time';
      case 'suspended': return 'pause-circle';
      case 'rejected': return 'close-circle';
      default: return 'help-circle';
    }
  };

  return (
      <ScrollView style={styles.container}>
        {/* Header MAVECAM */}
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={32} color={MAVECAM_COLORS.WHITE} />
          </View>
          <Text style={styles.displayName}>{displayName}</Text>
          <Text style={styles.accountType}>
            {isIndividual ? t('individualAccount') : t('companyAccount')}
          </Text>
          
          {farmProfile && (
            <View style={[styles.certificationBadge, { backgroundColor: getCertificationColor() }]}>
              <Ionicons 
                name={getCertificationIcon()} 
                size={16} 
                color={MAVECAM_COLORS.WHITE} 
              />
              <Text style={styles.certificationText}>
                {getCertificationText()}
              </Text>
            </View>
          )}
        </View>

        {/* Informations Personnelles/Entreprise */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{isIndividual ? t('personalInfo') : t('companyInfo')}</Text>
            <TouchableOpacity
              onPress={() => setIsEditing(!isEditing)}
              style={styles.editButton}
            >
              <Ionicons name={isEditing ? 'close' : 'pencil'} size={20} color={MAVECAM_COLORS.GREEN_PRIMARY} />
            </TouchableOpacity>
          </View>
          <View style={styles.infoCard}>
            <InfoRow
              icon="call"
              label={t('phoneNumber')}
              value={user.phone_number}
              editable={false}
            />
            <InfoRow
              icon="mail"
              label={t('email')}
              value={isEditing ? undefined : (user.email || t('notProvided'))}
              editable={isEditing}
              onChangeText={(value) => setEditData(prev => ({ ...prev, email: value }))}
              inputValue={editData.email}
              placeholder={t('yourEmail')}
            />
            
            {isIndividual ? (
              <>
                <InfoRow
                  icon="person"
                  label={t('firstName')}
                  value={user.first_name || t('notProvided')}
                  editable={false}
                />
                <InfoRow
                  icon="person"
                  label={t('lastName')}
                  value={user.last_name || t('notProvided')}
                  editable={false}
                />
                {user.age_group && (
                  <InfoRow
                    icon="calendar"
                    label={t('ageGroup')}
                    value={user.age_group}
                    editable={false}
                  />
                )}
              </>
            ) : (
              <>
                <InfoRow
                  icon="business"
                  label={t('businessName')}
                  value={user.business_name || t('notProvided')}
                  editable={false}
                />
                {user.legal_status && (
                  <InfoRow
                    icon="document-text"
                    label={t('legalStatus')}
                    value={user.legal_status}
                    editable={false}
                  />
                )}
                {user.promoter_name && (
                  <InfoRow
                    icon="person-circle"
                    label={t('promoterName')}
                    value={user.promoter_name}
                    editable={false}
                  />
                )}
              </>
            )}
            
            {user.activity_type && (
              <InfoRow
                icon="fish"
                label={t('activityType')}
                value={user.activity_type}
                editable={false}
              />
            )}
          </View>
        </View>

        {/* Localisation */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('location')}</Text>
          <View style={styles.infoCard}>
            {user.region && (
              <InfoRow
                icon="location"
                label={t('region')}
                value={user.region}
                editable={false}
              />
            )}
            <InfoRow
              icon="map"
              label={t('department')}
              value={isEditing ? undefined : (user.department || t('notProvided'))}
              editable={isEditing}
              onChangeText={(value) => setEditData(prev => ({ ...prev, department: value }))}
              inputValue={editData.department}
              placeholder={t('department')}
            />
            <InfoRow
              icon="pin"
              label={t('district')}
              value={isEditing ? undefined : (user.district || t('notProvided'))}
              editable={isEditing}
              onChangeText={(value) => setEditData(prev => ({ ...prev, district: value }))}
              inputValue={editData.district}
              placeholder={t('district')}
            />
            <InfoRow
              icon="home"
              label={t('neighborhood')}
              value={isEditing ? undefined : (user.neighborhood || t('notProvided'))}
              editable={isEditing}
              onChangeText={(value) => setEditData(prev => ({ ...prev, neighborhood: value }))}
              inputValue={editData.neighborhood}
              placeholder={t('neighborhood')}
            />
            <InfoRow
              icon="business"
              label={t('interventionZone')}
              value={isEditing ? undefined : (user.intervention_zone || t('notProvided'))}
              editable={isEditing}
              onChangeText={(value) => setEditData(prev => ({ ...prev, intervention_zone: value }))}
              inputValue={editData.intervention_zone}
              placeholder={t('interventionZone')}
            />
          </View>
        </View>

        {/* Informations Ferme Détaillées */}
        {farmProfile && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('farmInfo')}</Text>
            <View style={styles.infoCard}>
              <InfoRow
                icon="business"
                label={t('farmName')}
                value={farmProfile.farm_name}
                editable={false}
              />
              <InfoRow
                icon="water"
                label={t('totalPonds')}
                value={farmProfile.total_ponds.toString()}
                editable={false}
              />
              {farmProfile.total_area_m2 && (
                <InfoRow
                  icon="resize"
                  label={t('totalArea')}
                  value={`${farmProfile.total_area_m2} m²`}
                  editable={false}
                />
              )}
              {farmProfile.water_source && (
                <InfoRow
                  icon="water"
                  label={t('waterSource')}
                  value={farmProfile.water_source}
                  editable={false}
                />
              )}
              {farmProfile.main_species && (
                <InfoRow
                  icon="fish"
                  label={t('mainSpecies')}
                  value={farmProfile.main_species}
                  editable={false}
                />
              )}
              {farmProfile.annual_production_kg && (
                <InfoRow
                  icon="scale"
                  label={t('annualProduction')}
                  value={`${farmProfile.annual_production_kg} kg`}
                  editable={false}
                />
              )}
            </View>
          </View>
        )}


        {/* Métriques de Performance (si données disponibles) */}
        {farmProfile && farmProfile.total_ponds > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('performanceMetrics')}</Text>
            <View style={styles.metricsContainer}>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>
                  {farmProfile.total_area_m2 
                    ? Math.round(farmProfile.total_area_m2 / farmProfile.total_ponds) 
                    : 0} m²
                </Text>
                <Text style={styles.metricLabel}>{t('averageAreaPerPond')}</Text>
              </View>
              
              {farmProfile.annual_production_kg && farmProfile.total_area_m2 && (
                <View style={styles.metricCard}>
                  <Text style={styles.metricValue}>
                    {(farmProfile.annual_production_kg / farmProfile.total_area_m2).toFixed(1)} kg/m²
                  </Text>
                  <Text style={styles.metricLabel}>{t('yieldPerSquareMeter')}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Préférences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('preferences')}</Text>
          <View style={styles.infoCard}>
            <InfoRow
              icon="language"
              label={t('preferredLanguage')}
              value={user.language_preference === 'fr' ? t('french') : t('english')}
              editable={false}
            />
            <InfoRow
              icon="shield-checkmark"
              label={t('accountVerified')}
              value={user.is_verified ? t('yes') : t('no')}
              editable={false}
            />
          </View>
        </View>

        {/* Bouton de sauvegarde */}
        {isEditing && (
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={handleSave}
              disabled={isLoading}
            >
              <Text style={styles.buttonText}>
                {isLoading ? t('saving') : t('saveChanges')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.actionButton} onPress={handleNavigateToFarm}>
            <Ionicons name="analytics" size={20} color={MAVECAM_COLORS.GREEN_PRIMARY} />
            <Text style={styles.actionText}>{t('farmManagement')}</Text>
            <Ionicons name="chevron-forward" size={20} color={MAVECAM_COLORS.GRAY_LIGHT} />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionButton} onPress={handleNavigateToSettings}>
            <Ionicons name="settings" size={20} color={MAVECAM_COLORS.GREEN_PRIMARY} />
            <Text style={styles.actionText}>{t('settings')}</Text>
            <Ionicons name="chevron-forward" size={20} color={MAVECAM_COLORS.GRAY_LIGHT} />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.dangerButton} onPress={handleLogout}>
            <Ionicons name="log-out" size={20} color={MAVECAM_COLORS.WHITE} />
            <Text style={styles.dangerText}>{t('disconnect')}</Text>
          </TouchableOpacity>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </ScrollView>
  );
}

interface InfoRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  editable: boolean;
  onChangeText?: (text: string) => void;
  inputValue?: string;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
}

function InfoRow({ 
  icon, 
  label, 
  value, 
  editable, 
  onChangeText, 
  inputValue, 
  placeholder,
  keyboardType = 'default'
}: InfoRowProps) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoRowLeft}>
        <Ionicons name={icon} size={20} color={MAVECAM_COLORS.GRAY_LIGHT} />
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      
      {editable ? (
        <TextInput
          style={styles.infoInput}
          value={inputValue}
          onChangeText={onChangeText}
          placeholder={placeholder}
          keyboardType={keyboardType}
          autoCapitalize="words"
        />
      ) : (
        <Text style={styles.infoValue}>{value}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MAVECAM_COLORS.CREAM,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: MAVECAM_COLORS.CREAM,
  },
  header: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    padding: 20,
    paddingTop: 60,
    alignItems: 'center',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: MAVECAM_COLORS.GREEN_DARK,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.WHITE,
  },
  displayName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.WHITE,
    marginBottom: 4,
    textAlign: 'center',
  },
  accountType: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 12,
  },
  certificationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  certificationText: {
    fontSize: 14,
    fontWeight: '600',
    color: MAVECAM_COLORS.WHITE,
    marginLeft: 6,
  },
  section: {
    padding: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  editButton: {
    padding: 8,
  },
  infoCard: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  infoRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  infoLabel: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginLeft: 12,
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_DARK,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  infoInput: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_DARK,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  actionButton: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  actionText: {
    fontSize: 16,
    color: MAVECAM_COLORS.GRAY_DARK,
    fontWeight: '500',
    flex: 1,
    marginLeft: 12,
  },
  buttonContainer: {
    padding: 20,
    paddingTop: 0,
  },
  button: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  buttonText: {
    color: MAVECAM_COLORS.WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
  metricsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricCard: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    textAlign: 'center',
  },
  errorContainer: {
    margin: 20,
    padding: 16,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: MAVECAM_COLORS.ERROR,
  },
  errorText: {
    color: MAVECAM_COLORS.ERROR,
    fontSize: 14,
  },
  infoText: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 8,
  },
  dangerButton: {
    backgroundColor: MAVECAM_COLORS.ERROR,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8,
    marginTop: 10,
  },
  dangerText: {
    color: MAVECAM_COLORS.WHITE,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});