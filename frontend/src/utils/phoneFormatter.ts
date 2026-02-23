/** Regex de validation d'un numéro camerounais normalisé (+237 + 9 chiffres). */
export const PHONE_REGEX = /^\+237[0-9]{9}$/;

/**
 * Formats a raw phone input string into a +237XXXXXXXXX Cameroon phone number.
 * Used by both LoginScreen and RegisterScreen.
 */
export function formatCameroonPhone(value: string): string {
  const digits = value.replace(/\D/g, '');

  if (digits.length === 0) return '';
  if (digits.length <= 9) return `+237${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('237')) {
    return `+${digits}`;
  }
  return value;
}
