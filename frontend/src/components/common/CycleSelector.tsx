import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ProductionCycle } from '@/types/aquaculture';
import { AQUACARE_COLORS } from '@/constants/colors';

interface CycleSelectorProps {
  cycles: ProductionCycle[];
  selectedCycleId: string | null;
  onSelectCycle: (cycleId: string) => void;
}

export default function CycleSelector({ cycles, selectedCycleId, onSelectCycle }: CycleSelectorProps) {
  const { t } = useTranslation();

  return (
    <View className="mb-6">
      <Text className="text-base font-bold text-gray-dark mb-3">{t('cycleSelection')}</Text>
      {cycles.map((cycle) => (
        <TouchableOpacity
          key={cycle.id}
          className={`bg-white p-4 rounded-lg mb-2 border flex-row justify-between items-center ${
            selectedCycleId === cycle.id ? 'border-aquacare-primary bg-[#f0fdf4]' : 'border-gray-200'
          }`}
          onPress={() => onSelectCycle(cycle.id)}
        >
          <View className="flex-1">
            <Text className="text-base font-semibold text-gray-dark">
              {t('pondPrefix')} {cycle.pond_identifier || cycle.id.slice(-4)}
            </Text>
            <Text className="text-sm text-gray-light mt-1">
              {cycle.current_count} {t('fishLabel')} - {t(cycle.species)}
            </Text>
          </View>
          {selectedCycleId === cycle.id && (
            <Ionicons name="checkmark-circle" size={24} color={AQUACARE_COLORS.GREEN_PRIMARY} />
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}
