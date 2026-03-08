import React, { useCallback } from 'react';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { MAVECAM_COLORS } from '@/constants/colors';
import { ProductionCycle } from '@/types/aquaculture';

interface CyclePickerProps {
  cycles: ProductionCycle[];
  selectedCycleId: string | null;
  onSelectCycle: (cycleId: string) => void;
}

const getDaysActive = (startDate: string): number => {
  const start = new Date(startDate).getTime();
  const now = new Date().getTime();
  return Math.max(0, Math.floor((now - start) / (1000 * 60 * 60 * 24)));
};

const formatBiomass = (cycle: ProductionCycle): string => {
  const biomass = Number(cycle.current_biomass ?? cycle.initial_biomass ?? 0);
  return Number.isFinite(biomass) ? biomass.toFixed(1) : '0.0';
};

const formatSurvivalRate = (cycle: ProductionCycle): string => {
  const rate = Number(cycle.survival_rate ?? 0);
  return Number.isFinite(rate) ? `${rate.toFixed(0)}%` : '-';
};

function CyclePicker({ cycles, selectedCycleId, onSelectCycle }: CyclePickerProps) {
  const { t } = useTranslation();

  const renderCycleItem = useCallback(
    ({ item: cycle }: { item: ProductionCycle }) => {
      const isSelected = selectedCycleId === cycle.id;
      const daysActive = getDaysActive(cycle.start_date);
      const speciesLabel = cycle.species === 'clarias' ? t('catfish') : t('tilapia');
      const speciesIcon: keyof typeof Ionicons.glyphMap =
        cycle.species === 'clarias' ? 'fish' : 'fish-outline';

      return (
        <TouchableOpacity
          className={`bg-white rounded-xl p-4 mb-3 border ${
            isSelected ? 'border-mavecam-primary bg-[#f0fdf4]' : 'border-gray-200'
          }`}
          onPress={() => onSelectCycle(cycle.id)}
        >
          <View className="flex-row items-start justify-between">
            <View className="flex-1 mr-3">
              <Text className="text-base font-bold text-gray-dark mb-1">{cycle.cycle_name}</Text>

              <View className="flex-row items-center mb-2">
                <Ionicons name={speciesIcon} size={14} color={MAVECAM_COLORS.GREEN_PRIMARY} />
                <Text className="text-sm text-gray-light ml-1">
                  {speciesLabel} - {cycle.pond_identifier}
                </Text>
              </View>

              <View className="flex-row flex-wrap gap-x-4 gap-y-1">
                <View className="flex-row items-center">
                  <Ionicons name="time-outline" size={12} color={MAVECAM_COLORS.GRAY_LIGHT} />
                  <Text className="text-xs text-gray-light ml-1">
                    {daysActive} {t('days')}
                  </Text>
                </View>
                <View className="flex-row items-center">
                  <Ionicons name="scale-outline" size={12} color={MAVECAM_COLORS.GRAY_LIGHT} />
                  <Text className="text-xs text-gray-light ml-1">{formatBiomass(cycle)} kg</Text>
                </View>
                <View className="flex-row items-center">
                  <Ionicons name="trending-up-outline" size={12} color={MAVECAM_COLORS.GRAY_LIGHT} />
                  <Text className="text-xs text-gray-light ml-1">
                    {formatSurvivalRate(cycle)} {t('survivalRateShort', { defaultValue: 'survie' })}
                  </Text>
                </View>
              </View>
            </View>

            {isSelected && (
              <Ionicons name="checkmark-circle" size={24} color={MAVECAM_COLORS.GREEN_PRIMARY} />
            )}
          </View>
        </TouchableOpacity>
      );
    },
    [onSelectCycle, selectedCycleId, t]
  );

  return (
    <FlatList
      data={cycles}
      keyExtractor={(item) => item.id}
      renderItem={renderCycleItem}
      extraData={selectedCycleId}
      showsVerticalScrollIndicator={false}
      removeClippedSubviews
      initialNumToRender={6}
      maxToRenderPerBatch={8}
      windowSize={5}
    />
  );
}

export default React.memo(CyclePicker);
