import React from 'react';
import {
  StyleSheet,
  View,
} from 'react-native';
import MapView, { Marker, UrlTile } from 'react-native-maps';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';

import { AppText, Button, Card, EmptyState } from '@/components/ui';
import { colors, shadows, spacing } from '@/theme';
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
        <EmptyState title={t('farmNoLocation')} message={t('farmNoLocationHint')} actionLabel={t('farmBackToProfile')} onAction={() => navigation.goBack()} />
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
          pinColor={colors.brand.primary}
        />
      </MapView>

      <Card style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Ionicons name="location" size={18} color={colors.brand.primary} />
          <View style={styles.infoText}>
            <AppText variant="bodyStrong">{farmProfile?.farm_name}</AppText>
            {farmProfile?.location_address ? (
              <AppText variant="caption" color="muted">{farmProfile.location_address}</AppText>
            ) : null}
            <AppText variant="caption" color="muted" style={styles.coords}>
              {latitude.toFixed(6)}, {longitude.toFixed(6)}
            </AppText>
          </View>
        </View>

        <Button label={t('back')} variant="outline" iconLeft="arrow-back" onPress={() => navigation.goBack()} />
      </Card>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.page,
  },
  map: {
    flex: 1,
  },
  infoCard: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    gap: spacing[3],
    ...shadows.medium,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  infoText: {
    flex: 1,
  },
  coords: {
    marginTop: spacing[1],
    fontFamily: 'monospace',
  },
});

export default FarmMapScreen;
