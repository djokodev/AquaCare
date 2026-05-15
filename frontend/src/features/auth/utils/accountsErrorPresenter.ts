type Translate = (key: string, options?: Record<string, unknown>) => string;

const KNOWN_ERROR_KEYS = new Set([
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_FORBIDDEN',
  'AUTH_NOT_FOUND',
  'AUTH_RATE_LIMITED',
  'AUTH_SERVER_ERROR',
  'AUTH_NETWORK_ERROR',
  'AUTH_UNKNOWN_ERROR',
  'UNKNOWN_ERROR',
]);

const getMessageFromThrownValue = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return 'AUTH_UNKNOWN_ERROR';
};

export const getAccountErrorMessage = (error: unknown, t: Translate): string => {
  const message = getMessageFromThrownValue(error);
  const normalized = message.trim();

  if (KNOWN_ERROR_KEYS.has(normalized)) {
    return t(normalized, { defaultValue: t('accountsErrorGeneric') });
  }

  if (
    normalized === 'Network Error' ||
    normalized.toLowerCase().includes('timeout') ||
    normalized.toLowerCase().includes('network')
  ) {
    return t('AUTH_NETWORK_ERROR', { defaultValue: t('accountsErrorGeneric') });
  }

  if (normalized.startsWith('HTTP_')) {
    return t('accountsErrorGeneric');
  }

  if (normalized.startsWith('{') || normalized.startsWith('[')) {
    return t('accountsErrorGeneric');
  }

  return normalized || t('accountsErrorGeneric');
};
