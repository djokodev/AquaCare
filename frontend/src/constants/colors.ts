/**
 * Charte graphique AquaCare - Couleurs officielles de l'application.
 *
 * Ces couleurs sont utilisÃ©es dans toute l'application pour assurer
 * une cohÃ©rence visuelle et respecter l'identitÃ© de marque AquaCare.
 *
 * @see CLAUDE.md section "CHARTE GRAPHIQUE AquaCare"
 */

export const AQUACARE_COLORS = {
  // Couleurs principales AquaCare
  GREEN_PRIMARY: '#059669',    // Vert AquaCare principal (boutons, headers)
  GREEN_LIGHT: '#10b981',      // Vert clair pour accents
  GREEN_DARK: '#047857',       // Vert foncÃ© pour headers/emphasis

  // Couleurs de fond
  WHITE: '#ffffff',            // Blanc pur
  CREAM: '#f8fafc',            // Blanc cassÃ© pour backgrounds

  // Couleurs fonctionnelles
  BLUE: '#2563eb',             // Bleu pour informations
  SUCCESS: '#059669',          // Vert pour succÃ¨s (= GREEN_PRIMARY)
  WARNING: '#f59e0b',          // Orange pour avertissements
  ERROR: '#dc2626',            // Rouge pour erreurs
  INFO: '#0ea5e9',             // Bleu clair pour info

  // Couleurs de texte
  GRAY_LIGHT: '#64748b',       // Texte secondaire
  GRAY_DARK: '#1e293b',        // Texte principal
} as const;

/**
 * Type TypeScript pour les clÃ©s de couleur AquaCare.
 * Permet l'autocomplÃ©tion et la vÃ©rification de type.
 */
export type AquacareColorKey = keyof typeof AQUACARE_COLORS;

/**
 * Type TypeScript pour les valeurs de couleur AquaCare.
 */
export type AquacareColor = typeof AQUACARE_COLORS[AquacareColorKey];




