import React, { useRef, useState } from 'react';
import { Alert, Linking, Share, StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';

import { AppText, Button, Card, EmptyState, IconButton } from '@/components/ui';
import { colors, radii, shadows, spacing } from '@/theme';
import { useAuth } from '@/hooks/useAuth';
import type { RootStackParamList } from '@/navigation/MainNavigator';
import { buildDirectionsUrl, buildShareLocationUrl } from '@/features/profile/utils/farmMapLinks';
import logger from '@/utils/logger';

type NavigationProp = StackNavigationProp<RootStackParamList, 'FarmMap'>;

const FARM_ZOOM_DELTA = 0.01;

/**
 * Carte native de la ferme (Apple Plans sur iOS, Google Maps sur Android).
 * Pensée pour la livraison: vue satellite pour les zones sans rues nommées,
 * itinéraire dans l'app de navigation du téléphone et partage de la position.
 */
const FarmMapScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const { farmProfile } = useAuth();
  const mapRef = useRef<MapView>(null);
  const [isSatellite, setIsSatellite] = useState(false);

  const latitude = farmProfile?.latitude ? Number(farmProfile.latitude) : null;
  const longitude = farmProfile?.longitude ? Number(farmProfile.longitude) : null;

  if (latitude === null || longitude === null) {
    return (
      <View style={styles.container}>
        <EmptyState title={t('farmNoLocation')} message={t('farmNoLocationHint')} actionLabel={t('farmBackToProfile')} onAction={() => navigation.goBack()} />
      </View>
    );
  }

  const point = { latitude, longitude };
  const farmName = farmProfile?.farm_name || t('myFarm');
  const region = { ...point, latitudeDelta: FARM_ZOOM_DELTA, longitudeDelta: FARM_ZOOM_DELTA };

  const openDirections = async () => {
    try {
      await Linking.openURL(buildDirectionsUrl(point));
    } catch (error) {
      logger.warn('Farm directions could not be opened', error);
      Alert.alert(t('error'), t('farmMapOpenError'));
    }
  };

  const shareLocation = async () => {
    try {
      await Share.share({ message: t('farmMapShareMessage', { name: farmName, url: buildShareLocationUrl(point) }) });
    } catch (error) {
      logger.warn('Farm location could not be shared', error);
    }
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        mapType={isSatellite ? 'hybrid' : 'standard'}
        showsCompass
        showsScale
        toolbarEnabled={false}
      >
        <Marker coordinate={point} title={farmName} description={farmProfile?.location_address ?? ''} pinColor={colors.brand.primary} />
      </MapView>

      <View style={styles.mapControls}>
        <IconButton
          icon={isSatellite ? 'map-outline' : 'earth-outline'}
          accessibilityLabel={t(isSatellite ? 'farmMapStandard' : 'farmMapSatellite')}
          onPress={() => setIsSatellite((value) => !value)}
          style={styles.controlButton}
        />
        <IconButton
          icon="locate-outline"
          accessibilityLabel={t('farmMapRecenter')}
          onPress={() => mapRef.current?.animateToRegion(region, 400)}
          style={styles.controlButton}
        />
      </View>

      <Card style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Ionicons name="location" size={18} color={colors.brand.primary} />
          <View style={styles.infoText}>
            <AppText variant="bodyStrong">{farmName}</AppText>
            {farmProfile?.location_address ? (
              <AppText variant="caption" color="muted">{farmProfile.location_address}</AppText>
            ) : null}
          </View>
        </View>

        <Button label={t('farmMapDirections')} iconLeft="navigate" onPress={() => void openDirections()} />
        <Button label={t('farmMapShare')} variant="outline" iconLeft="share-social" onPress={() => void shareLocation()} />
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
  mapControls: {
    position: 'absolute',
    top: spacing[4],
    right: spacing[4],
    gap: spacing[2],
  },
  controlButton: {
    backgroundColor: colors.surface.card,
    borderRadius: radii.full,
    ...shadows.medium,
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
});

export default FarmMapScreen;
