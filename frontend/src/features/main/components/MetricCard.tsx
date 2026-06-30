import React from 'react';
import { Text, View } from 'react-native';

export interface MetricCardProps {
  value: string | number;
  label: string;
  subtitle?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ value, label, subtitle }) => {
  return (
    <View className="w-[48%] bg-cream rounded-xl p-4 mb-3 border border-[#f1f5f9]">
      <Text className="text-2xl font-bold text-gray-dark" numberOfLines={2}>
        {value}
      </Text>
      <Text className="text-sm text-gray-light mt-1">{label}</Text>
      {subtitle ? <Text className="text-xs text-gray-light mt-1">{subtitle}</Text> : null}
    </View>
  );
};

export default React.memo(MetricCard);
