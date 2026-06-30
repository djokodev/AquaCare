import React from 'react';
import { Text, View } from 'react-native';

export interface MetricCardProps {
  value: string | number;
  label: string;
  subtitle?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ value, label, subtitle }) => {
  return (
    <View className="flex-1 min-w-[45%] bg-cream rounded-lg p-4">
      <Text className="text-xl font-bold text-aquacare-primary" numberOfLines={2}>
        {value}
      </Text>
      <Text className="text-xs text-gray-light mt-1">{label}</Text>
      {subtitle ? <Text className="text-xs text-gray-light mt-1">{subtitle}</Text> : null}
    </View>
  );
};

export default React.memo(MetricCard);
