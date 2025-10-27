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
import { useNavigation } from '@react-navigation/native';
import type { RootStackParamList } from '@/navigation/MainNavigator';
import type { StackNavigationProp } from '@react-navigation/stack';
import { MAVECAM_COLORS } from '@/constants/colors';
import { useAuth } from '@/hooks/useAuth';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '@/store/store';
import { fetchDashboardData } from '@/store/slices/aquacultureSlice';
import { FarmProfile } from '@/types/auth';

type NavigationProp = StackNavigationProp<RootStackParamList>;

export default function FarmProfileScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const dispatch = useDispatch<AppDispatch>();
  const {
    farmProfile,
    isLoading,
    error,
    updateFarm,
    isFarmCertified,
    loadProfile
  } = useAuth();

  // Récupérer les données aquaculture comme dans le dashboard
  const { dashboardData } = useSelector((state: RootState) => state.aquaculture);
  const activeCycles = dashboardData?.active_cycles || [];

  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<FarmProfile>>({});

  // Chargement initial des données aquaculture comme dans le dashboard
  useEffect(() => {
    dispatch(fetchDashboardData());
  }, [dispatch]);

  useEffect(() => {
    if (farmProfile) {
      setEditData({
        farm_name: farmProfile.farm_name || '',
        total_ponds: farmProfile.total_ponds || 0,
        total_area_m2: farmProfile.total_area_m2 || 0,
        water_source: farmProfile.water_source || '',
        main_species: farmProfile.main_species || '',
        annual_production_kg: farmProfile.annual_production_kg || 0,
      });
    }
  }, [farmProfile]);

  // Fonction pour afficher seulement le nom (sans prénom) dans le nom de ferme
  const formatFarmName = (farmName: string | undefined) => {
    if (!farmName) return '';

    // Si le nom commence par "Ferme de " et contient plusieurs mots
    if (farmName.startsWith('Ferme de ') && farmName.includes(' ')) {
      const nameAfterFermeDe = farmName.replace('Ferme de ', '');
      const nameParts = nameAfterFermeDe.split(' ');

      // Si il y a plusieurs mots, prendre le dernier (nom de famille)
      if (nameParts.length > 1) {
        const lastName = nameParts[nameParts.length - 1];
        return `Ferme de ${lastName}`;
      }
    }

    // Retourner le nom original si pas de format reconnu
    return farmName;
  };

  const handleSave = async () => {
    try {
      await updateFarm(editData);
      setIsEditing(false);
      Alert.alert(t('success'), t('profileUpdatedSuccess'));
    } catch (err) {
      Alert.alert(t('error'), t('profileUpdateError'));
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text>{t('loading')}...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.loadingContainer}>
        <Text>{t('error')}: {error}</Text>
        <Text>{t('unableToLoadFarmProfile')}</Text>
      </View>
    );
  }

  if (!farmProfile) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="business-outline" size={64} color="#64748b" />
        <Text style={styles.noProfileText}>{t('noFarmProfile')}</Text>
        <Text style={styles.noProfileSubtext}>{t('loadingFarmProfile')}</Text>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton, { marginTop: 20 }]}
          onPress={() => loadProfile()}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? t('loading') : t('reloadProfile')}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const getCertificationColor = () => {
    switch (farmProfile.certification_status) {
      case 'certified':
        return '#059669';
      case 'pending':
        return '#f59e0b';
      case 'suspended':
        return '#dc2626';
      case 'rejected':
        return '#64748b';
      default:
        return '#64748b';
    }
  };

  const getCertificationText = () => {
    switch (farmProfile.certification_status) {
      case 'certified':
        return t('farmCertified');
      case 'pending':
        return t('certificationPending');
      case 'suspended':
        return t('certificationSuspended');
      case 'rejected':
        return t('certificationRejected');
      default:
        return t('statusUnknown');
    }
  };

  const getCertificationIcon = () => {
    switch (farmProfile.certification_status) {
      case 'certified':
        return 'checkmark-circle';
      case 'pending':
        return 'time';
      case 'suspended':
        return 'pause-circle';
      case 'rejected':
        return 'close-circle';
      default:
        return 'help-circle';
    }
  };

  // Calculs des métriques communes
  const totalSurface = activeCycles.reduce((total, cycle) => {
    return total + (Number(cycle.pond_surface_m2) || 0);
  }, 0);

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.farmIcon}>
          <Ionicons name="business" size={32} color="#ffffff" />
        </View>
        <Text style={styles.farmName}>{formatFarmName(farmProfile.farm_name) || t('myFarm')}</Text>
        
        <View style={[styles.certificationBadge, { backgroundColor: getCertificationColor() }]}>
          <Ionicons 
            name={getCertificationIcon()} 
            size={16} 
            color="#ffffff" 
          />
          <Text style={styles.certificationText}>
            {getCertificationText()}
          </Text>
        </View>
      </View>

      {/* Farm Information */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('farmInfo')}</Text>
          <TouchableOpacity
            onPress={() => setIsEditing(!isEditing)}
            style={styles.editButton}
          >
            <Ionicons name={isEditing ? 'close' : 'pencil'} size={20} color="#2563eb" />
          </TouchableOpacity>
        </View>

        <View style={styles.infoCard}>
          <FarmInfoRow
            label={t('farmName')}
            value={isEditing ? undefined : formatFarmName(farmProfile.farm_name) || t('notProvided')}
            editable={isEditing}
            onChangeText={(value) => setEditData(prev => ({ ...prev, farm_name: value }))}
            inputValue={editData.farm_name?.toString()}
            placeholder={t('farmNamePlaceholder')}
          />
          
          <FarmInfoRow
            label={t('totalPonds')}
            value={isEditing ? undefined : activeCycles.length.toString()}
            editable={isEditing}
            onChangeText={(value) => setEditData(prev => ({ ...prev, total_ponds: parseInt(value) || 0 }))}
            inputValue={editData.total_ponds?.toString()}
            placeholder={t('totalPonds')}
            keyboardType="numeric"
          />
          
          <FarmInfoRow
            label={t('totalArea')}
            value={isEditing ? undefined : `${totalSurface} m²`}
            editable={false}
            onChangeText={(value) => setEditData(prev => ({ ...prev, total_area_m2: parseFloat(value) || 0 }))}
            inputValue={editData.total_area_m2?.toString()}
            placeholder={t('areaPlaceholder')}
            keyboardType="numeric"
          />
          
          <FarmInfoRow
            label={t('waterSource')}
            value={isEditing ? undefined : farmProfile.water_source || t('notProvided')}
            editable={isEditing}
            onChangeText={(value) => setEditData(prev => ({ ...prev, water_source: value }))}
            inputValue={editData.water_source}
            placeholder={t('waterSourcePlaceholder')}
          />
          
          <FarmInfoRow
            label={t('mainSpecies')}
            value={isEditing ? undefined : farmProfile.main_species || t('notProvided')}
            editable={isEditing}
            onChangeText={(value) => setEditData(prev => ({ ...prev, main_species: value }))}
            inputValue={editData.main_species}
            placeholder={t('speciesPlaceholder')}
          />
          
          <FarmInfoRow
            label={t('annualProduction')}
            value={isEditing ? undefined : farmProfile.annual_production_kg?.toString() || '0'}
            editable={isEditing}
            onChangeText={(value) => setEditData(prev => ({ ...prev, annual_production_kg: parseFloat(value) || 0 }))}
            inputValue={editData.annual_production_kg?.toString()}
            placeholder={t('productionPlaceholder')}
            keyboardType="numeric"
          />
        </View>
      </View>

      {/* Cycles en cours */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('currentCycles')}</Text>

        {activeCycles.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>{t('noActiveCycles')}</Text>
            <Text style={styles.emptyStateSubtext}>{t('startCycle')}</Text>
          </View>
        ) : (
          <View style={styles.cyclesContainer}>
            {activeCycles.map((cycle) => {
              // Calculer les jours depuis le début
              const startDate = new Date(cycle.start_date);
              const currentDate = new Date();
              const daysSinceStart = Math.floor((currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

              // Durée du cycle selon l'espèce
              const cycleDuration = cycle.species === 'clarias' ? 120 : 180;

              return (
                <View key={cycle.id} style={styles.cycleCard}>
                  <View style={styles.cycleHeader}>
                    <Text style={styles.cycleName}>{cycle.cycle_name}</Text>
                    <View style={styles.cycleStatusBadge}>
                      <Text style={styles.cycleStatusText}>
                        {t('dayProgress', { day: daysSinceStart, duration: cycleDuration })}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cycleDetails}>
                    <View style={styles.cycleDetailRow}>
                      <Text style={styles.cycleDetailLabel}>{t('pond')} :</Text>
                      <Text style={styles.cycleDetailValue}>{cycle.pond_identifier}</Text>
                    </View>

                    <View style={styles.cycleDetailRow}>
                      <Text style={styles.cycleDetailLabel}>{t('area')} :</Text>
                      <Text style={styles.cycleDetailValue}>{cycle.pond_surface_m2} m²</Text>
                    </View>

                    <View style={styles.cycleDetailRow}>
                      <Text style={styles.cycleDetailLabel}>{t('species')} :</Text>
                      <Text style={styles.cycleDetailValue}>
                        {cycle.species === 'clarias' ? 'Clarias' : 'Tilapia'}
                      </Text>
                    </View>

                    <View style={styles.cycleDetailRow}>
                      <Text style={styles.cycleDetailLabel}>{t('currentFish')} :</Text>
                      <Text style={styles.cycleDetailValue}>{cycle.current_count}</Text>
                    </View>

                    <View style={styles.cycleDetailRow}>
                      <Text style={styles.cycleDetailLabel}>{t('currentBiomass')} :</Text>
                      <Text style={styles.cycleDetailValue}>{cycle.current_biomass} kg</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Bouton Historique des saisies */}
        <TouchableOpacity
          onPress={() => navigation.navigate('DailyLogHistory')}
          style={styles.historyButton}
        >
          <Text style={styles.historyButtonText}>{t('viewDailyLogHistory')}</Text>
        </TouchableOpacity>
      </View>


      {/* Save Button */}
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

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
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
  keyboardType?: 'default' | 'numeric';
}

function FarmInfoRow({
  icon,
  label,
  value,
  editable,
  onChangeText,
  inputValue,
  placeholder,
  keyboardType = 'default'
}: FarmInfoRowProps) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoRowLeft}>
        {icon && <Ionicons name={icon} size={20} color="#64748b" />}
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
    padding: 40,
  },
  noProfileText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginTop: 16,
    textAlign: 'center',
  },
  noProfileSubtext: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  header: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    padding: 20,
    paddingTop: 60,
    alignItems: 'center',
  },
  farmIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: MAVECAM_COLORS.GREEN_DARK,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  farmName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.WHITE,
    marginBottom: 12,
    textAlign: 'center',
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
    marginBottom: 16,
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
  historyButton: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 16,
    alignItems: 'center',
  },
  historyButtonText: {
    fontSize: 16,
    color: MAVECAM_COLORS.WHITE,
    fontWeight: '600',
  },
  // Styles pour la section Cycles en cours
  emptyState: {
    alignItems: 'center',
    padding: 24,
  },
  emptyStateText: {
    fontSize: 16,
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
  },
  cyclesContainer: {
    gap: 12,
  },
  cycleCard: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  cycleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cycleName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    flex: 1,
  },
  cycleStatusBadge: {
    backgroundColor: MAVECAM_COLORS.GREEN_LIGHT,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  cycleStatusText: {
    fontSize: 12,
    color: MAVECAM_COLORS.WHITE,
    fontWeight: '600',
  },
  cycleDetails: {
    gap: 6,
  },
  cycleDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cycleDetailLabel: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    flex: 1,
  },
  cycleDetailValue: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_DARK,
    fontWeight: '600',
    textAlign: 'right',
  },
  buttonContainer: {
    padding: 20,
    paddingTop: 0,
  },
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 8,
  },
  primaryButton: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  buttonText: {
    color: MAVECAM_COLORS.WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
  errorContainer: {
    margin: 20,
    padding: 16,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
  },
  errorText: {
    color: MAVECAM_COLORS.ERROR,
    fontSize: 14,
  },
});