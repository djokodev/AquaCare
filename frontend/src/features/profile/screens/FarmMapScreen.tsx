import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, UrlTile } from 'react-native-maps';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';

import { MAVECAM_COLORS } from '@/constants/colors';
import { useAuth } from '@/hooks/useAuth';
import type { RootStackParamList } from '@/navigation/MainNavigator';

type NavigationProp = StackNavigationProp<RootStackParamList, 'FarmMap'>;

const FarmMapScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const { farmProfile } = useAuth();

  const latitude = farmProfile?.latitude ? Number(farmProfile.latitude) : null;
  const longitude = farmProfile?.longitude ? Number(farmProfile.longitude) : null;
  const hasLocation = latitude !== null && longitude !== null;

  if (!hasLocation) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Ionicons name="location-outline" size={56} color={MAVECAM_COLORS.GREEN_PRIMARY} />
          <Text style={styles.emptyTitle}>{t('farmNoLocation')}</Text>
          <Text style={styles.emptySubtitle}>
            {t('farmNoLocationHint')}
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>{t('farmBackToProfile')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude,
          longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
      >
        <UrlTile
          urlTemplate="https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maximumZ={19}
          flipY={false}
          tileSize={256}
        />
        <Marker
          coordinate={{ latitude, longitude }}
          title={farmProfile?.farm_name ?? t('myFarm')}
          description={farmProfile?.location_address ?? ''}
          pinColor={MAVECAM_COLORS.GREEN_PRIMARY}
        />
      </MapView>

      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Ionicons name="location" size={18} color={MAVECAM_COLORS.GREEN_PRIMARY} />
          <View style={styles.infoText}>
            <Text style={styles.farmName}>{farmProfile?.farm_name}</Text>
            {farmProfile?.location_address ? (
              <Text style={styles.address}>{farmProfile.location_address}</Text>
            ) : null}
            <Text style={styles.coords}>
              {latitude.toFixed(6)}, {longitude.toFixed(6)}
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.infoBackButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={18} color={MAVECAM_COLORS.GREEN_PRIMARY} />
          <Text style={styles.infoBackButtonText}>{t('back')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MAVECAM_COLORS.CREAM,
  },
  map: {
    flex: 1,
  },
  infoCard: {
    backgroundColor: 'white',
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: MAVECAM_COLORS.GRAY_DARK,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  infoText: {
    flex: 1,
  },
  farmName: {
    fontSize: 16,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  address: {
    fontSize: 13,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginTop: 2,
  },
  coords: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  infoBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  infoBackButtonText: {
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    fontWeight: '600',
    fontSize: 15,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    textAlign: 'center',
  },
  backButton: {
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  backButtonText: {
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    fontSize: 14,
    fontWeight: '500',
  },
});

export default FarmMapScreen;
