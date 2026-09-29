/**
 * Liens de navigation universels vers la ferme.
 *
 * Les URLs Google Maps "api=1" ouvrent l'app Google Maps si elle est
 * installée (Android, iOS) et le site web sinon: aucune clé API requise.
 */
export interface MapPoint {
  latitude: number;
  longitude: number;
}

const formatPoint = ({ latitude, longitude }: MapPoint) =>
  `${latitude.toFixed(6)},${longitude.toFixed(6)}`;

/** Itinéraire depuis la position actuelle de l'utilisateur jusqu'à la ferme. */
export const buildDirectionsUrl = (point: MapPoint): string =>
  `https://www.google.com/maps/dir/?api=1&destination=${formatPoint(point)}`;

/** Lien partageable (WhatsApp, SMS) qui pointe sur la ferme. */
export const buildShareLocationUrl = (point: MapPoint): string =>
  `https://www.google.com/maps/search/?api=1&query=${formatPoint(point)}`;
