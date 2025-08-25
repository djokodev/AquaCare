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

import { useAuth } from '@/hooks/useAuth';
import { FarmProfile } from '@/types/auth';

export default function FarmProfileScreen() {
  const { t } = useTranslation();
  const { 
    farmProfile, 
    isLoading, 
    error, 
    updateFarm,
    isFarmCertified 
  } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<FarmProfile>>({});

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

  const handleSave = async () => {
    try {
      await updateFarm(editData);
      setIsEditing(false);
      Alert.alert('Succès', 'Profil ferme mis à jour avec succès');
    } catch (err) {
      Alert.alert('Erreur', 'Erreur lors de la mise à jour du profil ferme');
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Chargement du profil ferme...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Erreur: {error}</Text>
        <Text>Impossible de charger le profil ferme</Text>
      </View>
    );
  }

  if (!farmProfile) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Aucun profil ferme trouvé</Text>
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
        return 'Ferme Certifiée MAVECAM';
      case 'pending':
        return 'Certification en cours d\'examen';
      case 'suspended':
        return 'Certification suspendue';
      case 'rejected':
        return 'Certification refusée';
      default:
        return 'Statut de certification inconnu';
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

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.farmIcon}>
          <Ionicons name="business" size={32} color="#ffffff" />
        </View>
        <Text style={styles.farmName}>{farmProfile.farm_name || 'Ma Ferme'}</Text>
        
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
          <Text style={styles.sectionTitle}>Informations de la ferme</Text>
          <TouchableOpacity
            onPress={() => setIsEditing(!isEditing)}
            style={styles.editButton}
          >
            <Ionicons name={isEditing ? 'close' : 'pencil'} size={20} color="#2563eb" />
          </TouchableOpacity>
        </View>

        <View style={styles.infoCard}>
          <FarmInfoRow
            icon="business"
            label="Nom de la ferme"
            value={isEditing ? undefined : farmProfile.farm_name || 'Non renseigné'}
            editable={isEditing}
            onChangeText={(value) => setEditData(prev => ({ ...prev, farm_name: value }))}
            inputValue={editData.farm_name?.toString()}
            placeholder="Nom de votre ferme"
          />
          
          <FarmInfoRow
            icon="water"
            label="Nombre de bassins"
            value={isEditing ? undefined : farmProfile.total_ponds?.toString() || '0'}
            editable={isEditing}
            onChangeText={(value) => setEditData(prev => ({ ...prev, total_ponds: parseInt(value) || 0 }))}
            inputValue={editData.total_ponds?.toString()}
            placeholder="Nombre de bassins"
            keyboardType="numeric"
          />
          
          <FarmInfoRow
            icon="resize"
            label="Superficie totale (m²)"
            value={isEditing ? undefined : farmProfile.total_area_m2?.toString() || '0'}
            editable={isEditing}
            onChangeText={(value) => setEditData(prev => ({ ...prev, total_area_m2: parseFloat(value) || 0 }))}
            inputValue={editData.total_area_m2?.toString()}
            placeholder="Superficie en m²"
            keyboardType="numeric"
          />
          
          <FarmInfoRow
            icon="drop"
            label="Source d'eau"
            value={isEditing ? undefined : farmProfile.water_source || 'Non renseigné'}
            editable={isEditing}
            onChangeText={(value) => setEditData(prev => ({ ...prev, water_source: value }))}
            inputValue={editData.water_source}
            placeholder="Source d'approvisionnement en eau"
          />
          
          <FarmInfoRow
            icon="fish"
            label="Espèce principale"
            value={isEditing ? undefined : farmProfile.main_species || 'Non renseigné'}
            editable={isEditing}
            onChangeText={(value) => setEditData(prev => ({ ...prev, main_species: value }))}
            inputValue={editData.main_species}
            placeholder="Tilapia, Clarias, etc."
          />
          
          <FarmInfoRow
            icon="scale"
            label="Production annuelle (kg)"
            value={isEditing ? undefined : farmProfile.annual_production_kg?.toString() || '0'}
            editable={isEditing}
            onChangeText={(value) => setEditData(prev => ({ ...prev, annual_production_kg: parseFloat(value) || 0 }))}
            inputValue={editData.annual_production_kg?.toString()}
            placeholder="Production en kg/an"
            keyboardType="numeric"
          />
        </View>
      </View>

      {/* Certification Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Certification MAVECAM</Text>
        
        <View style={styles.certificationCard}>
          <View style={styles.certificationHeader}>
            <Ionicons 
              name={getCertificationIcon()} 
              size={32} 
              color={getCertificationColor()} 
            />
            <View style={styles.certificationInfo}>
              <Text style={styles.certificationTitle}>
                {getCertificationText()}
              </Text>
              <Text style={styles.certificationDate}>
                Créé le : {new Date(farmProfile.created_at).toLocaleDateString('fr-FR')}
              </Text>
              {farmProfile.updated_at !== farmProfile.created_at && (
                <Text style={styles.certificationDate}>
                  Mis à jour le : {new Date(farmProfile.updated_at).toLocaleDateString('fr-FR')}
                </Text>
              )}
            </View>
          </View>
          
          <Text style={styles.certificationDescription}>
            {farmProfile.certification_status === 'certified' && 
              'Félicitations ! Votre ferme est certifiée MAVECAM. Vous bénéficiez de tous les avantages du programme.'
            }
            {farmProfile.certification_status === 'pending' && 
              'Votre demande de certification est en cours d\'examen par l\'équipe MAVECAM. Nous vous contacterons bientôt.'
            }
            {farmProfile.certification_status === 'suspended' && 
              'Votre certification a été temporairement suspendue. Contactez l\'équipe MAVECAM pour plus d\'informations.'
            }
            {farmProfile.certification_status === 'rejected' && 
              'Votre demande de certification n\'a pas été acceptée. Vous pouvez nous contacter pour connaître les critères requis.'
            }
          </Text>
        </View>
      </View>

      {/* Performance Metrics */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Métriques de performance</Text>
        
        <View style={styles.metricsContainer}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>
              {farmProfile.total_ponds > 0 
                ? (farmProfile.total_area_m2 || 0) / farmProfile.total_ponds 
                : 0
              } m²
            </Text>
            <Text style={styles.metricLabel}>Superficie moyenne par bassin</Text>
          </View>
          
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>
              {farmProfile.total_area_m2 > 0 
                ? ((farmProfile.annual_production_kg || 0) / farmProfile.total_area_m2).toFixed(1)
                : '0'
              } kg/m²
            </Text>
            <Text style={styles.metricLabel}>Rendement par m²</Text>
          </View>
        </View>
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
              {isLoading ? 'Enregistrement...' : 'Enregistrer les modifications'}
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
  icon: keyof typeof Ionicons.glyphMap;
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
        <Ionicons name={icon} size={20} color="#64748b" />
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
  certificationCard: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  certificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  certificationInfo: {
    flex: 1,
    marginLeft: 16,
  },
  certificationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 4,
  },
  certificationDate: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginBottom: 2,
  },
  certificationDescription: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    lineHeight: 20,
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