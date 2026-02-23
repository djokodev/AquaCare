import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import logger from '@/utils/logger';

import {
  CAMEROON_REGIONS,
  getAllDepartments,
  getAllArrondissements,
  getAllCities,
  getNeighborhoodsByArrondissement,
  hasNeighborhoods,
  getDepartmentsByRegion,
  getArrondissementsByDepartment,
  getCitiesByArrondissement,
  getRegionByCode,
} from '@/constants/cameroon';

// Couleurs MAVECAM selon spÃ©cifications
const MAVECAM_COLORS = {
  GREEN_PRIMARY: '#059669',
  GREEN_LIGHT: '#10b981',
  GREEN_DARK: '#047857',
  WHITE: '#ffffff',
  CREAM: '#f8fafc',
  BLUE: '#2563eb',
  GRAY_LIGHT: '#64748b',
  GRAY_DARK: '#1e293b',
  BORDER: '#d1d5db',
  SUCCESS: '#10b981',
};

interface LocationData {
  region?: string;
  department?: string;
  arrondissement?: string;
  city?: string;
  neighborhood?: string;
}

interface LocationSelectorProps {
  value: LocationData;
  onChange: (location: LocationData) => void;
  userRegion?: string; // RÃ©gion de l'utilisateur pour filtrer
  editable?: boolean;
}

interface PickerOption {
  value: string;
  label: string;
  disabled?: boolean;
}

const { width } = Dimensions.get('window');

export default function LocationSelector({
  value,
  onChange,
  userRegion,
  editable = true
}: LocationSelectorProps) {
  const { t } = useTranslation();

  // Ã‰tats pour les options disponibles
  const [regionOptions, setRegionOptions] = useState<PickerOption[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<PickerOption[]>([]);
  const [arrondissementOptions, setArrondissementOptions] = useState<PickerOption[]>([]);
  const [cityOptions, setCityOptions] = useState<PickerOption[]>([]);
  const [neighborhoodOptions, setNeighborhoodOptions] = useState<PickerOption[]>([]);

  // Ã‰tats pour les modales de sÃ©lection
  const [showRegionModal, setShowRegionModal] = useState(false);
  const [showDepartmentModal, setShowDepartmentModal] = useState(false);
  const [showArrondissementModal, setShowArrondissementModal] = useState(false);
  const [showCityModal, setShowCityModal] = useState(false);
  const [showNeighborhoodModal, setShowNeighborhoodModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Initialiser les rÃ©gions disponibles
  useEffect(() => {
    const regions = CAMEROON_REGIONS.map(region => ({
      value: region.code,
      label: region.name
    }));
    setRegionOptions(regions);
  }, []);

  // Mettre Ã  jour les dÃ©partements selon la rÃ©gion sÃ©lectionnÃ©e
  useEffect(() => {
    setIsLoading(true);

    try {
      if (value.region) {
        const departments = getDepartmentsByRegion(value.region);
        const options = departments.map(dept => ({
          value: dept.name,
          label: dept.name
        }));
        setDepartmentOptions(options);
      } else {
        // Si pas de rÃ©gion sÃ©lectionnÃ©e, vider les dÃ©partements
        setDepartmentOptions([]);
      }
    } catch (error) {
      logger.error('LocationSelector: Error loading departments:', error);
      setDepartmentOptions([]);
    } finally {
      setIsLoading(false);
    }
  }, [value.region]);

  // Mettre Ã  jour les arrondissements selon le dÃ©partement
  useEffect(() => {
    if (value.department && value.region) {
      const arrondissements = getArrondissementsByDepartment(value.region, value.department);
      setArrondissementOptions(
        arrondissements.map(arr => ({
          value: arr.name,
          label: arr.name
        }))
      );
    } else {
      setArrondissementOptions([]);
    }
    
    // Reset les niveaux infÃ©rieurs
    if (value.arrondissement || value.city || value.neighborhood) {
      onChange({
        ...value,
        arrondissement: undefined,
        city: undefined,
        neighborhood: undefined
      });
    }
  }, [value.department, value.region]);

  // Mettre Ã  jour les villes selon l'arrondissement sÃ©lectionnÃ©
  useEffect(() => {
    if (value.arrondissement && value.region && value.department) {
      const cities = getCitiesByArrondissement(value.region, value.department, value.arrondissement);
      setCityOptions(
        cities.map(city => ({
          value: city.name,
          label: city.name + (city.isChefLieu ? ' (Chef-lieu)' : '')
        }))
      );
      
      // Si une seule ville, la sÃ©lectionner automatiquement
      if (cities.length === 1 && !value.city) {
        onChange({
          ...value,
          city: cities[0].name,
          neighborhood: undefined // Reset quartier
        });
      }
    } else {
      setCityOptions([]);
    }
    
    // Reset les niveaux infÃ©rieurs si on change d'arrondissement
    if (value.city || value.neighborhood) {
      onChange({
        ...value,
        city: undefined,
        neighborhood: undefined
      });
    }
  }, [value.arrondissement, value.region, value.department]);

  // Mettre Ã  jour les quartiers selon l'arrondissement sÃ©lectionnÃ©
  useEffect(() => {
    if (value.arrondissement && value.region && value.department) {
      const quartiers = getNeighborhoodsByArrondissement(value.region, value.department, value.arrondissement);
      setNeighborhoodOptions(
        quartiers.map(q => ({ value: q, label: q }))
      );
    } else {
      setNeighborhoodOptions([]);
    }

    // Reset neighborhood si l'arrondissement change
    if (value.neighborhood) {
      onChange({
        ...value,
        neighborhood: undefined
      });
    }
  }, [value.arrondissement, value.region, value.department]);

  const handleRegionSelect = (regionCode: string) => {
    onChange({
      region: regionCode,
      department: undefined, // Reset dÃ©partement
      arrondissement: undefined, // Reset arrondissement
      city: undefined, // Reset ville
      neighborhood: undefined // Reset quartier
    });
    setShowRegionModal(false);
  };

  const handleDepartmentSelect = (department: string) => {
    onChange({
      ...value,
      department,
      arrondissement: undefined,
      city: undefined,
      neighborhood: undefined
    });
    setShowDepartmentModal(false);
  };

  const handleArrondissementSelect = (arrondissement: string) => {
    onChange({
      ...value,
      arrondissement,
      city: undefined,
      neighborhood: undefined
    });
    setShowArrondissementModal(false);
  };

  const handleCitySelect = (city: string) => {
    onChange({
      ...value,
      city,
      neighborhood: undefined
    });
    setShowCityModal(false);
  };

  const handleNeighborhoodSelect = (neighborhood: string) => {
    onChange({
      ...value,
      neighborhood
    });
    setShowNeighborhoodModal(false);
  };

  if (!editable) {
    return (
      <View style={styles.container}>
        <LocationDisplayRow
          label={t('department')}
          value={value.department || t('notProvided')}
        />
        <LocationDisplayRow
          label={t('district')}
          value={value.arrondissement || t('notProvided')}
        />
        {value.city && (
          <LocationDisplayRow
            label={t('city')}
            value={value.city || t('notProvided')}
          />
        )}
        <LocationDisplayRow
          label={t('neighborhood')}
          value={value.neighborhood || t('notProvided')}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* SÃ©lection RÃ©gion */}
      <LocationSelectorRow
        label={t('region') + ' *'}
        value={value.region ? CAMEROON_REGIONS.find(r => r.code === value.region)?.name : undefined}
        placeholder={t('selectRegion')}
        onPress={() => setShowRegionModal(true)}
        hasOptions={regionOptions.length > 0}
      />

      {/* SÃ©lection DÃ©partement */}
      <LocationSelectorRow
        label={t('department') + ' *'}
        value={value.department}
        placeholder={value.region ? t('selectDepartment') : t('selectRegionFirst')}
        onPress={() => value.region && setShowDepartmentModal(true)}
        hasOptions={departmentOptions.length > 0}
        disabled={!value.region}
      />

      {/* SÃ©lection Arrondissement */}
      <LocationSelectorRow
        label={t('district')}
        value={value.arrondissement}
        placeholder={value.department ? t('selectDistrict') : t('selectDepartmentFirst')}
        onPress={() => value.department && setShowArrondissementModal(true)}
        hasOptions={arrondissementOptions.length > 0}
        disabled={!value.department}
      />

      {/* SÃ©lection Ville */}
      {cityOptions.length > 0 && (
        <LocationSelectorRow
          label={t('city')}
          value={value.city}
          placeholder={value.arrondissement ? t('selectCity') : t('selectDistrictFirst')}
          onPress={() => value.arrondissement && setShowCityModal(true)}
          hasOptions={cityOptions.length > 0}
          disabled={!value.arrondissement}
        />
      )}

      {/* SÃ©lection Quartier */}
      {neighborhoodOptions.length > 0 && (
        <LocationSelectorRow
          label={t('neighborhood')}
          value={value.neighborhood}
          placeholder={value.arrondissement 
            ? (neighborhoodOptions.length > 0 ? t('selectNeighborhood') : t('noNeighborhoodsAvailable'))
            : t('selectDistrictFirst')
          }
          onPress={() => value.arrondissement && neighborhoodOptions.length > 0 && setShowNeighborhoodModal(true)}
          hasOptions={neighborhoodOptions.length > 0}
          disabled={!value.arrondissement || neighborhoodOptions.length === 0}
        />
      )}

      {/* Modal RÃ©gion */}
      <PickerModal
        visible={showRegionModal}
        title={t('selectRegion')}
        options={regionOptions}
        selectedValue={value.region}
        onSelect={handleRegionSelect}
        onClose={() => setShowRegionModal(false)}
      />

      {/* Modal DÃ©partement */}
      <PickerModal
        visible={showDepartmentModal}
        title={t('selectDepartment')}
        options={departmentOptions}
        selectedValue={value.department}
        onSelect={handleDepartmentSelect}
        onClose={() => setShowDepartmentModal(false)}
        isLoading={isLoading}
      />

      {/* Modal Arrondissement */}
      <PickerModal
        visible={showArrondissementModal}
        title={t('selectDistrict')}
        options={arrondissementOptions}
        selectedValue={value.arrondissement}
        onSelect={handleArrondissementSelect}
        onClose={() => setShowArrondissementModal(false)}
      />

      {/* Modal Ville */}
      <PickerModal
        visible={showCityModal}
        title={t('selectCity')}
        options={cityOptions}
        selectedValue={value.city}
        onSelect={handleCitySelect}
        onClose={() => setShowCityModal(false)}
      />

      {/* Modal Quartier */}
      <PickerModal
        visible={showNeighborhoodModal}
        title={t('selectNeighborhood')}
        options={neighborhoodOptions}
        selectedValue={value.neighborhood}
        onSelect={handleNeighborhoodSelect}
        onClose={() => setShowNeighborhoodModal(false)}
      />
    </View>
  );
}

// Composant pour affichage en lecture seule
interface LocationDisplayRowProps {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}

function LocationDisplayRow({ icon, label, value }: LocationDisplayRowProps) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoRowLeft}>
        {icon && <Ionicons name={icon} size={20} color={MAVECAM_COLORS.GRAY_LIGHT} />}
        <Text style={[styles.infoLabel, !icon && styles.infoLabelNoIcon]}>{label}</Text>
      </View>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

// Composant pour sÃ©lecteur interactif
interface LocationSelectorRowProps {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  placeholder: string;
  onPress: () => void;
  hasOptions: boolean;
  disabled?: boolean;
}

function LocationSelectorRow({
  icon,
  label,
  value,
  placeholder,
  onPress,
  hasOptions,
  disabled = false
}: LocationSelectorRowProps) {
  const getDisplayValue = () => {
    if (value) return value;
    return placeholder;
  };

  const getTextStyle = () => {
    if (disabled) return [styles.selectorText, styles.disabledText];
    if (value) return [styles.selectorText, styles.selectedText];
    return [styles.selectorText, styles.placeholderText];
  };

  return (
    <TouchableOpacity
      style={[
        styles.selectorRow,
        disabled && styles.disabledSelector,
        value && styles.selectedSelector
      ]}
      onPress={onPress}
      disabled={disabled || !hasOptions}
      activeOpacity={0.7}
    >
      <View style={styles.selectorLeft}>
        {icon && <Ionicons 
          name={icon} 
          size={20} 
          color={disabled ? MAVECAM_COLORS.GRAY_LIGHT : MAVECAM_COLORS.GREEN_PRIMARY} 
        />}
        <Text style={[styles.selectorLabel, !icon && styles.selectorLabelNoIcon]}>{label}</Text>
      </View>
      
      <View style={styles.selectorRight}>
        <Text style={getTextStyle()}>{getDisplayValue()}</Text>
        {hasOptions && !disabled && (
          <Ionicons 
            name="chevron-down" 
            size={16} 
            color={MAVECAM_COLORS.GRAY_LIGHT} 
          />
        )}
      </View>
    </TouchableOpacity>
  );
}

// Modal de sÃ©lection
interface PickerModalProps {
  visible: boolean;
  title: string;
  options: PickerOption[];
  selectedValue?: string;
  onSelect: (value: string) => void;
  onClose: () => void;
  isLoading?: boolean;
}

function PickerModal({
  visible,
  title,
  options,
  selectedValue,
  onSelect,
  onClose,
  isLoading = false
}: PickerModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={MAVECAM_COLORS.GRAY_DARK} />
            </TouchableOpacity>
          </View>
          
          {isLoading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Chargement...</Text>
            </View>
          ) : options.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Aucune option disponible</Text>
            </View>
          ) : (
            <View style={styles.optionsContainer}>
              <ScrollView style={styles.optionsList} showsVerticalScrollIndicator={false}>
                {options.map((option, index) => (
                    <TouchableOpacity
                      key={`${option.value}-${index}`}
                      style={[
                        styles.optionItem,
                        selectedValue === option.value && styles.selectedOption
                      ]}
                      onPress={() => {
                        onSelect(option.value);
                      }}
                      disabled={option.disabled}
                    >
                      <Text style={[
                        styles.optionText,
                        selectedValue === option.value && styles.selectedOptionText,
                        option.disabled && styles.disabledOptionText
                      ]}>
                        {option.label}
                      </Text>
                      {selectedValue === option.value && (
                        <Ionicons 
                          name="checkmark" 
                          size={20} 
                          color={MAVECAM_COLORS.GREEN_PRIMARY} 
                        />
                      )}
                    </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
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
  infoLabelNoIcon: {
    marginLeft: 0,
  },
  infoValue: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_DARK,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  selectorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: MAVECAM_COLORS.BORDER,
    backgroundColor: MAVECAM_COLORS.WHITE,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  selectedSelector: {
    borderColor: MAVECAM_COLORS.GREEN_PRIMARY,
    backgroundColor: '#f0fdf4',
  },
  disabledSelector: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
  },
  selectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  selectorLabel: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_DARK,
    marginLeft: 12,
    fontWeight: '500',
  },
  selectorLabelNoIcon: {
    marginLeft: 0,
  },
  selectorRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  selectorText: {
    fontSize: 14,
    marginRight: 8,
    textAlign: 'right',
  },
  selectedText: {
    color: MAVECAM_COLORS.GREEN_DARK,
    fontWeight: '600',
  },
  placeholderText: {
    color: MAVECAM_COLORS.GRAY_LIGHT,
    fontStyle: 'italic',
  },
  disabledText: {
    color: MAVECAM_COLORS.GRAY_LIGHT,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  closeButton: {
    padding: 4,
  },
  optionsContainer: {
    maxHeight: 400,
    minHeight: 200,
  },
  optionsList: {
    flexGrow: 0,
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
    minHeight: 50,
    backgroundColor: MAVECAM_COLORS.WHITE,
  },
  selectedOption: {
    backgroundColor: '#f0fdf4',
  },
  optionText: {
    fontSize: 16,
    color: MAVECAM_COLORS.GRAY_DARK,
    flex: 1,
  },
  selectedOptionText: {
    color: MAVECAM_COLORS.GREEN_DARK,
    fontWeight: '600',
  },
  disabledOptionText: {
    color: MAVECAM_COLORS.GRAY_LIGHT,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    textAlign: 'center',
  },
});


