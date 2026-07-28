import { sanitizeUserFacingErrorMessage } from '@/utils/errorParser';

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

const isTechnicalOnlyMessage = (message: string): boolean => {
  const normalized = message.trim();

  if (!normalized) {
    return false;
  }

  return (
    normalized.startsWith('{') ||
    normalized.startsWith('[') ||
    /^HTTP_\d{3}(?:\s+invalid)?$/i.test(normalized) ||
    /^status[_-]?code(?:\s*[:=]\s*\d{3})?$/i.test(normalized) ||
    /^code(?:\s*[:=]\s*[A-Za-z0-9_-]+)?$/i.test(normalized) ||
    /status code\s*\d{3}/i.test(normalized)
  );
};

export const getAccountErrorMessage = (error: unknown, t: Translate): string => {
  const message = getMessageFromThrownValue(error);
  if (isTechnicalOnlyMessage(message)) {
    return t('accountsErrorGeneric');
  }

  const normalized = sanitizeUserFacingErrorMessage(message).trim();

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

  if (
    normalized === 'UNKNOWN_ERROR' ||
    normalized.startsWith('HTTP_') ||
    normalized.startsWith('{') ||
    normalized.startsWith('[') ||
    normalized === 'invalid'
  ) {
    return t('accountsErrorGeneric');
  }

  return normalized || t('accountsErrorGeneric');
};
