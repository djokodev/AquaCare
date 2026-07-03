import React, { useMemo } from 'react';
import { ScrollView, Text, View, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSelector } from 'react-redux';

import { AQUACARE_COLORS } from '@/constants/colors';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { RootState } from '@/store/store';
import { CycleLog } from '@/types/aquaculture';
import { formatDate, formatDateTime } from '@/utils';

type DailyLogDetailScreenNavigationProp = StackNavigationProp<RootStackParamList, 'DailyLogDetail'>;
type DailyLogDetailScreenRouteProp = RouteProp<RootStackParamList, 'DailyLogDetail'>;

interface DailyLogDetailScreenProps {
  navigation: DailyLogDetailScreenNavigationProp;
  route?: DailyLogDetailScreenRouteProp;
}

const formatOptionalNumber = (value: number | string | null | undefined, suffix = ''): string => {
  if (value === null || value === undefined || value === '') {
    return '-';
  }
  return `${value}${suffix}`;
};

export default function DailyLogDetailScreen({ navigation, route }: DailyLogDetailScreenProps) {
  const { t } = useTranslation();
  const { dashboardData, currentCycle } = useSelector((state: RootState) => state.aquaculture);
  const activeCycles = dashboardData?.active_cycles || [];
  const routeParams = route?.params;
  const log: CycleLog | null = routeParams?.log ?? null;

  const selectedCycle = useMemo(() => {
    if (!routeParams?.cycleId) {
      return currentCycle || null;
    }
    return activeCycles.find((cycle) => cycle.id === routeParams.cycleId) || currentCycle || null;
  }, [activeCycles, currentCycle, routeParams?.cycleId]);

  const unitName = routeParams?.productionUnitName || log?.production_unit_name || t('productionUnitsUnknownUnit');
  const cycleName = selectedCycle?.cycle_name || log?.cycle || t('sessionCycleNotSelected');
  const detailDate = log ? formatDate(log.log_date) : t('noData');
  const detailTime = log?.log_time ? log.log_time.slice(0, 5) : '-';
  const createdAt = log?.created_at ? formatDateTime(log.created_at) : '-';

  const renderField = (label: string, value: React.ReactNode) => (
    <View className="flex-row items-start justify-between py-2 border-b border-slate-100 last:border-b-0">
      <Text className="text-sm text-gray-light flex-1 pr-3">{label}</Text>
      <Text className="text-sm font-semibold text-gray-dark text-right flex-1">{value}</Text>
    </View>
  );

  const renderSection = (title: string, children: React.ReactNode) => (
    <View className="bg-white rounded-xl p-4 mb-3">
      <Text className="text-base font-bold text-gray-dark mb-3">{title}</Text>
      {children}
    </View>
  );

  if (!log) {
    return (
      <View className="flex-1 bg-cream">
        <View className="bg-aquacare-primary flex-row items-center pt-14 pb-4 px-4">
          <TouchableOpacity className="mr-4" onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={AQUACARE_COLORS.WHITE} />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-white">{t('dailyLogDetailTitle')}</Text>
        </View>

        <View className="flex-1 items-center justify-center px-6">
          <Ionicons name="document-text-outline" size={56} color={AQUACARE_COLORS.GRAY_LIGHT} />
          <Text className="text-lg font-bold text-gray-dark mt-4">{t('dailyLogDetailUnavailable')}</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-cream">
      <View className="bg-aquacare-primary flex-row items-center pt-14 pb-4 px-4">
        <TouchableOpacity className="mr-4" onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={AQUACARE_COLORS.WHITE} />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-white">{t('dailyLogDetailTitle')}</Text>
      </View>

      <View className="p-4">
        <View className="bg-white rounded-xl p-4 mb-3">
          <Text className="text-lg font-bold text-aquacare-primary">{detailDate}</Text>
          <Text className="text-sm text-gray-light mt-1">{unitName}</Text>
          <Text className="text-sm text-gray-light mt-1">{cycleName}</Text>
        </View>

        {renderSection(t('dailyLogDetailInfoTitle'), (
          <>
            {renderField(t('dailyLogDetailDateLabel'), detailDate)}
            {renderField(t('dailyLogDetailTimeLabel'), detailTime)}
            {renderField(t('dailyLogDetailCycleLabel'), cycleName)}
            {renderField(t('dailyLogDetailUnitLabel'), unitName)}
            {renderField(t('dailyLogDetailCreatedAtLabel'), createdAt)}
            {renderField(t('dailyLogDetailCreatedOfflineLabel'), log.created_offline ? t('yes') : t('no'))}
            {log.synced_at ? renderField(t('dailyLogDetailSyncedAtLabel'), formatDateTime(log.synced_at)) : null}
            {log.client_uuid ? renderField(t('dailyLogDetailClientUuidLabel'), log.client_uuid) : null}
          </>
        ))}

        {renderSection(t('dailyLogDetailSamplingTitle'), (
          <>
            {renderField(t('sampleCount'), formatOptionalNumber(log.sample_count))}
            {renderField(t('totalWeight'), formatOptionalNumber(log.sample_total_weight, ' g'))}
            {renderField(t('averageWeight'), formatOptionalNumber(log.average_weight, ' g'))}
          </>
        ))}

        {renderSection(t('dailyLogDetailFeedingTitle'), (
          <>
            {renderField(t('feedQuantity'), formatOptionalNumber(log.feed_quantity, ' kg'))}
            {renderField(t('feedType'), log.feed_type || t('noData'))}
            {renderField(t('feedSizeMm'), formatOptionalNumber(log.feed_size_mm, ' mm'))}
            {renderField(
              t('feedingTimes'),
              log.feeding_times && log.feeding_times.length > 0 ? log.feeding_times.join(', ') : t('noData')
            )}
          </>
        ))}

        {renderSection(t('dailyLogDetailEnvironmentTitle'), (
          <>
            {renderField(t('waterTemperature'), formatOptionalNumber(log.water_temperature, '°C'))}
            {renderField(t('dissolvedOxygen'), formatOptionalNumber(log.dissolved_oxygen, ' mg/L'))}
            {renderField(t('phLevel'), formatOptionalNumber(log.ph_level))}
            {renderField(t('ammoniaLevel'), formatOptionalNumber(log.ammonia_level, ' ppm'))}
          </>
        ))}

        {renderSection(t('dailyLogDetailMortalityTitle'), (
          <>
            {renderField(t('mortality'), formatOptionalNumber(log.mortality_count))}
            {renderField(t('mortalityReason'), log.mortality_reason || t('noData'))}
          </>
        ))}

        {renderSection(t('dailyLogDetailObservationsTitle'), (
          <Text className="text-sm text-gray-dark leading-6">
            {log.observations || t('noData')}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}
