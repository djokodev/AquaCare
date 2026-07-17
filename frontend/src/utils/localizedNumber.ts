export type LocalizedNumberResult =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | { kind: 'valid'; value: number };

/**
 * Parse a user-entered decimal without losing French comma decimals.
 * Thousands separators are deliberately rejected: aquaculture form values are
 * measurements, not formatted display values.
 */
export function parseLocalizedNumber(value: string): LocalizedNumberResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { kind: 'empty' };
  }

  const normalized = trimmed.replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
    return { kind: 'invalid' };
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed)
    ? { kind: 'valid', value: parsed }
    : { kind: 'invalid' };
}

export function formatEditableNumber(value: number | null | undefined, useComma: boolean): string {
  if (value === null || value === undefined) {
    return '';
  }
  const raw = String(value);
  return useComma ? raw.replace('.', ',') : raw;
}
