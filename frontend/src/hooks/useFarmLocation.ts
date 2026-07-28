import { useCallback, useRef, useState } from 'react';
import * as Location from 'expo-location';
import logger from '@/utils/logger';

export type LocationStatus =
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unavailable'
  | 'error';

export interface FarmCoordinates {
  latitude: number;
  longitude: number;
  address?: string;
}

/**
 * Capture la position GPS de la ferme (usage ponctuel, foreground uniquement).
 * Pattern défensif Android : check avant request + timeout + fallback last known.
 */
export const useFarmLocation = () => {
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [coordinates, setCoordinates] = useState<FarmCoordinates | null>(null);
  const isRequesting = useRef(false);

  const requestLocation = useCallback(async (): Promise<FarmCoordinates | null> => {
    if (isRequesting.current) return null;
    isRequesting.current = true;
    setStatus('requesting');

    try {
      // 1. Vérifier que la localisation est activée sur le téléphone
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setStatus('unavailable');
        return null;
      }

      // 2. CHECK avant REQUEST (évite le freeze Android si déjà accordé)
      const { status: existingStatus } = await Location.getForegroundPermissionsAsync();
      if (existingStatus !== 'granted') {
        const { status: requestedStatus } = await Location.requestForegroundPermissionsAsync();
        if (requestedStatus !== 'granted') {
          setStatus('denied');
          return null;
        }
      }

      // 3. Capture GPS avec timeout 15s (bug Android getCurrentPositionAsync freeze)
      let position: Location.LocationObject | null = null;
      try {
        position = await Promise.race([
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('GPS timeout')), 15000)
          ),
        ]);
      } catch {
        // 4. Fallback : dernière position connue (max 5 minutes)
        position = await Location.getLastKnownPositionAsync({
          maxAge: 300000,
          requiredAccuracy: 200,
        });
      }

      if (!position) {
        setStatus('error');
        return null;
      }

      // Arrondir à 7 décimales pour correspondre au DecimalField Django (max_digits=10)
      const latitude = Math.round(position.coords.latitude * 1e7) / 1e7;
      const longitude = Math.round(position.coords.longitude * 1e7) / 1e7;

      // 5. Reverse geocoding → adresse lisible (gratuit, sans clé API)
      // Format : Quartier, Ville, Pays (ex: Bonanjo, Douala, Cameroun)
      let address: string | undefined;
      try {
        const [result] = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (result) {
          const parts = [result.district || result.subregion, result.city, result.country].filter(Boolean);
          address = parts.join(', ');
        }
      } catch {
        // Le reverse geocoding est optionnel, on continue sans
        logger.warn('Reverse geocoding failed');
      }

      const coords: FarmCoordinates = { latitude, longitude, address };
      setCoordinates(coords);
      setStatus('granted');
      return coords;
    } catch (error) {
      logger.warn('Farm location capture failed', error);
      setStatus('error');
      return null;
    } finally {
      isRequesting.current = false;
    }
  }, []);

  return { status, coordinates, requestLocation };
};
