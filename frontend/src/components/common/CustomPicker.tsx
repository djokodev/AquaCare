import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

// Couleurs MAVECAM selon spÃ©cifications
const MAVECAM_COLORS = {
  GREEN_PRIMARY: '#059669',
  GREEN_LIGHT: '#10b981',
  GREEN_DARK: '#047857',
  WHITE: '#ffffff',
  CREAM: '#f8fafc',
  GRAY_LIGHT: '#64748b',
  GRAY_DARK: '#1e293b',
};

export interface PickerOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface CustomPickerProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  options: PickerOption[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  editable?: boolean;
  displayValue?: string;
}

export default function CustomPicker({
  icon,
  label,
  value,
  options,
  onValueChange,
  placeholder = '',
  editable = true,
  displayValue
}: CustomPickerProps) {
  const { t } = useTranslation();

  const handlePickerChange = (selectedValue: string) => {
    if (selectedValue && selectedValue !== value) {
      onValueChange(selectedValue);
    }
  };

  const getDisplayValue = () => {
    if (displayValue) return displayValue;
    if (!value) return placeholder || t('notProvided');
    
    const option = options.find(opt => opt.value === value);
    return option?.label || value;
  };

  if (!editable) {
    // Mode lecture seule - affiche juste la valeur
    return (
      <View style={styles.infoRow}>
        <View style={styles.infoRowLeft}>
          <Ionicons name={icon} size={20} color={MAVECAM_COLORS.GRAY_LIGHT} />
          <Text style={styles.infoLabel}>{label}</Text>
        </View>
        <Text style={styles.infoValue}>{getDisplayValue()}</Text>
      </View>
    );
  }

  return (
    <View style={styles.infoRow}>
      <View style={styles.infoRowLeft}>
        <Ionicons name={icon} size={20} color={MAVECAM_COLORS.GRAY_LIGHT} />
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={value || ''}
          onValueChange={handlePickerChange}
          style={styles.picker}
          mode="dropdown"
        >
          {placeholder && (
            <Picker.Item 
              label={placeholder} 
              value="" 
              color={MAVECAM_COLORS.GRAY_LIGHT}
            />
          )}
          {options.map((option) => (
            <Picker.Item
              key={option.value}
              label={option.label}
              value={option.value}
              enabled={!option.disabled}
              color={option.disabled ? MAVECAM_COLORS.GRAY_LIGHT : MAVECAM_COLORS.GRAY_DARK}
            />
          ))}
        </Picker>
      </View>
    </View>
  );
}

/**
 * Composant pour les sÃ©lections en cascade (exemple: rÃ©gion â†’ dÃ©partement â†’ arrondissement)
 */
interface CascadingPickerProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  levels: {
    value: string;
    options: PickerOption[];
    placeholder: string;
    onChange: (value: string) => void;
  }[];
  editable?: boolean;
}

export function CascadingPicker({
  icon,
  label,
  levels,
  editable = true
}: CascadingPickerProps) {
  if (!editable) {
    return (
      <View style={styles.cascadingContainer}>
        <View style={styles.cascadingHeader}>
          <Ionicons name={icon} size={20} color={MAVECAM_COLORS.GRAY_LIGHT} />
          <Text style={styles.infoLabel}>{label}</Text>
        </View>
        {levels.map((level, index) => {
          const selected = level.options.find(o => o.value === level.value);
          return (
            <View key={index} style={styles.cascadingLevel}>
              <Text style={styles.readOnlyText}>{selected?.label || level.placeholder}</Text>
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.cascadingContainer}>
      <View style={styles.cascadingHeader}>
        <Ionicons name={icon} size={20} color={MAVECAM_COLORS.GRAY_LIGHT} />
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      
      {levels.map((level, index) => (
        <View key={index} style={styles.cascadingLevel}>
          <Picker
            selectedValue={level.value || ''}
            onValueChange={level.onChange}
            style={styles.picker}
            mode="dropdown"
          >
            <Picker.Item 
              label={level.placeholder} 
              value="" 
              color={MAVECAM_COLORS.GRAY_LIGHT}
            />
            {level.options.map((option) => (
              <Picker.Item
                key={option.value}
                label={option.label}
                value={option.value}
                enabled={!option.disabled}
                color={option.disabled ? MAVECAM_COLORS.GRAY_LIGHT : MAVECAM_COLORS.GRAY_DARK}
              />
            ))}
          </Picker>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
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
  pickerContainer: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    backgroundColor: MAVECAM_COLORS.WHITE,
  },
  picker: {
    height: 40,
    backgroundColor: 'transparent',
  },
  cascadingContainer: {
    marginVertical: 8,
  },
  cascadingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  cascadingLevel: {
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    backgroundColor: MAVECAM_COLORS.WHITE,
  },
  readOnlyText: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_DARK,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
});


