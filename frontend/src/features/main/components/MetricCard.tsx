import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface MetricCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  value: string | number;
  label: string;
  index: number;
  animationType?: 'bounce' | 'wave' | 'rotate' | 'pulse';
  subtitle?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({
  icon,
  color,
  value,
  label,
  index,
  animationType = 'pulse',
  subtitle,
}) => {
  return (
    <View className="w-[48%] bg-white rounded-2xl p-4 shadow-sm items-center mb-3">
      <View>
        <Ionicons name={icon} size={32} color={color} />
      </View>
      <Text
        className="text-2xl font-bold text-gray-dark mt-2 text-center w-full"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.65}
      >
        {value}
      </Text>
      <Text className="text-sm text-gray-light text-center mt-1">{label}</Text>
      {subtitle ? <Text className="text-xs text-gray-light text-center mt-1">{subtitle}</Text> : null}
    </View>
  );
};

export default React.memo(MetricCard);
