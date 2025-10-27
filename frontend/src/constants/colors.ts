/**
 * Charte graphique MAVECAM - Couleurs officielles de l'application.
 *
 * Ces couleurs sont utilisées dans toute l'application pour assurer
 * une cohérence visuelle et respecter l'identité de marque MAVECAM.
 *
 * @see CLAUDE.md section "CHARTE GRAPHIQUE MAVECAM"
 */

export const MAVECAM_COLORS = {
  // Couleurs principales MAVECAM
  GREEN_PRIMARY: '#059669',    // Vert MAVECAM principal (boutons, headers)
  GREEN_LIGHT: '#10b981',      // Vert clair pour accents
  GREEN_DARK: '#047857',       // Vert foncé pour headers/emphasis

  // Couleurs de fond
  WHITE: '#ffffff',            // Blanc pur
  CREAM: '#f8fafc',            // Blanc cassé pour backgrounds

  // Couleurs fonctionnelles
  BLUE: '#2563eb',             // Bleu pour informations
  SUCCESS: '#059669',          // Vert pour succès (= GREEN_PRIMARY)
  WARNING: '#f59e0b',          // Orange pour avertissements
  ERROR: '#dc2626',            // Rouge pour erreurs
  INFO: '#0ea5e9',             // Bleu clair pour info

  // Couleurs de texte
  GRAY_LIGHT: '#64748b',       // Texte secondaire
  GRAY_DARK: '#1e293b',        // Texte principal
} as const;

/**
 * Type TypeScript pour les clés de couleur MAVECAM.
 * Permet l'autocomplétion et la vérification de type.
 */
export type MavecamColorKey = keyof typeof MAVECAM_COLORS;

/**
 * Type TypeScript pour les valeurs de couleur MAVECAM.
 */
export type MavecamColor = typeof MAVECAM_COLORS[MavecamColorKey];
