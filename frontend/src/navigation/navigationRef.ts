import { createNavigationContainerRef } from '@react-navigation/native';

/** Référence globale pour naviguer hors composant (ex: tap sur une notification). */
export const navigationRef = createNavigationContainerRef<Record<string, object | undefined>>();
