import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  Platform,
  SafeAreaView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { MAVECAM_COLORS } from '@/constants/colors';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  error?: string;
  required?: boolean;
}

/**
 * Composant SelectField cross-platform
 * Résout le problème de débordement du Picker iOS en utilisant une Modal avec FlatList
 *
 * @param label - Label affiché au-dessus du champ
 * @param value - Valeur sélectionnée actuelle
 * @param onChange - Callback appelé lors de la sélection
 * @param options - Liste des options disponibles
 * @param placeholder - Texte affiché quand aucune valeur n'est sélectionnée
 * @param error - Message d'erreur à afficher
 * @param required - Affiche un astérisque si le champ est requis
 */
export default function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  error,
  required = false,
}: SelectFieldProps) {
  const { t } = useTranslation();
  const [modalVisible, setModalVisible] = useState(false);

  // Trouver le label de l'option sélectionnée
  const selectedOption = options.find((opt) => opt.value === value);
  const displayText = selectedOption?.label || placeholder || t('selectOption');

  const handleSelect = (selectedValue: string) => {
    onChange(selectedValue);
    setModalVisible(false);
  };

  return (
    <View style={styles.container}>
      {/* Label */}
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>

      {/* Champ sélecteur (TouchableOpacity qui ressemble à un TextInput) */}
      <TouchableOpacity
        style={[styles.selectButton, error ? styles.selectButtonError : styles.selectButtonNormal]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
      >
        <Text style={[styles.selectText, !selectedOption && styles.placeholderText]}>{displayText}</Text>
        <Text style={styles.arrow}>▼</Text>
      </TouchableOpacity>

      {/* Message d'erreur */}
      {error && <Text style={styles.errorText}>{error}</Text>}

      {/* Modal avec liste des options */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <SafeAreaView style={styles.modalContainer}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{label}</Text>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
              </TouchableOpacity>
            </View>

            {/* Liste des options */}
            <FlatList
              data={options}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.optionItem, item.value === value && styles.optionItemSelected]}
                  onPress={() => handleSelect(item.value)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[styles.optionText, item.value === value && styles.optionTextSelected]}
                  >
                    {item.label}
                  </Text>
                  {item.value === value && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 8,
  },
  required: {
    color: MAVECAM_COLORS.ERROR,
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: MAVECAM_COLORS.WHITE,
    minHeight: 48,
  },
  selectButtonNormal: {
    borderColor: '#d1d5db', // border-gray-300
  },
  selectButtonError: {
    borderColor: MAVECAM_COLORS.ERROR,
  },
  selectText: {
    fontSize: 16,
    color: MAVECAM_COLORS.GRAY_DARK,
    flex: 1,
  },
  placeholderText: {
    color: MAVECAM_COLORS.GRAY_LIGHT,
  },
  arrow: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginLeft: 8,
  },
  errorText: {
    fontSize: 14,
    color: MAVECAM_COLORS.ERROR,
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  cancelButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  cancelButtonText: {
    fontSize: 16,
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    fontWeight: '600',
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: MAVECAM_COLORS.WHITE,
  },
  optionItemSelected: {
    backgroundColor: '#ecfdf5', // mavecam-green-50
  },
  optionText: {
    fontSize: 16,
    color: MAVECAM_COLORS.GRAY_DARK,
    flex: 1,
  },
  optionTextSelected: {
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    fontWeight: '600',
  },
  checkmark: {
    fontSize: 18,
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  separator: {
    height: 1,
    backgroundColor: '#f3f4f6',
  },
});
