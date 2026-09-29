export const formatFarmName = (farmName?: string): string => {
  if (!farmName) return '';
  if (farmName.startsWith('Ferme de ') && farmName.includes(' ')) {
    const parts = farmName.replace('Ferme de ', '').split(' ');
    if (parts.length > 1) return `Ferme de ${parts[parts.length - 1]}`;
  }
  return farmName;
};

/**
 * Raccourcit la partie locale d'un email pour tenir sur une ligne:
 * "djoko.dev.pro@gmail.com" -> "djoko…@gmail.com".
 */
export const formatCompactEmail = (email?: string, visibleChars = 5): string => {
  if (!email) return '';
  const atIndex = email.lastIndexOf('@');
  if (atIndex <= 0) return email;
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex);
  if (local.length <= visibleChars + 1) return email;
  return `${local.slice(0, visibleChars)}…${domain}`;
};
