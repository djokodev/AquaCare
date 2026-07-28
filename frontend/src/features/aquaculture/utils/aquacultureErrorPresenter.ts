import { ParsedApiError, formatErrorForDisplay } from '@/utils/errorParser';

type Translator = (key: string) => string;

const getActionHint = (status: number, hasFieldErrors: boolean, t: Translator): string => {
  if (hasFieldErrors || status === 400) {
    return t('aquacultureErrorFixField');
  }
  if (status === 0) {
    return t('aquacultureErrorCheckConnection');
  }
  if (status === 401) {
    return t('aquacultureErrorReconnect');
  }
  if (status === 409) {
    return t('aquacultureErrorSyncConflict');
  }
  if (status === 403) {
    return t('aquacultureErrorSupport');
  }
  return t('aquacultureErrorRetry');
};

export const formatAquacultureErrorWithAction = (
  parsedError: ParsedApiError,
  t: Translator
): string => {
  const baseMessage = formatErrorForDisplay(parsedError);
  const actionHint = getActionHint(parsedError.status, parsedError.details.length > 0, t);
  return `${baseMessage}\n\n${actionHint}`;
};
