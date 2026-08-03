import {
  ParsedApiError,
  formatErrorForDisplay,
  sanitizeUserFacingErrorMessage,
} from '@/utils/errorParser';

type Translator = (key: string) => string;

export const TRANSACTIONAL_LAUNCH_ERROR_KEYS: Record<string, string> = {
  cycle_launch_idempotency_conflict: 'cycleLaunchIdempotencyConflict',
  cycle_launch_unit_already_allocated: 'cycleLaunchUnitAlreadyAllocated',
  cycle_launch_unit_capacity_exceeded: 'cycleLaunchUnitCapacityExceeded',
  cycle_launch_unit_capacity_unavailable: 'cycleLaunchUnitCapacityUnavailable',
  feed_reference_not_found: 'cycleLaunchFeedReferenceNotFound',
  feed_reference_idempotency_conflict: 'cycleLaunchFeedReferenceConflict',
  ongoing_cycle_baseline_invalid: 'ongoingCycleTrackingDateInvalid',
  ongoing_cycle_tracking_baseline_required: 'ongoingCycleTrackingDateInvalid',
  ongoing_cycle_tracking_date_before_start: 'ongoingCycleTrackingDateInvalid',
  ongoing_cycle_tracking_date_in_future: 'ongoingCycleTrackingDateInvalid',
  ongoing_cycle_tracking_date_invalid: 'ongoingCycleTrackingDateInvalid',
  ongoing_cycle_current_count_required: 'ongoingCycleCurrentCountInvalid',
  ongoing_cycle_current_count_exceeds_initial: 'ongoingCycleCurrentCountInvalid',
  ongoing_cycle_current_weight_required: 'ongoingCycleCurrentWeightRequired',
  ongoing_cycle_biomass_inconsistent: 'ongoingCycleBiomassInconsistent',
  ongoing_cycle_planned_harvest_elapsed: 'ongoingCyclePlannedHarvestElapsed',
  planned_harvest_elapsed: 'ongoingCyclePlannedHarvestElapsed',
  validation_error: 'cycleLaunchValidationRejected',
  not_found: 'cycleLaunchResourceNotFound',
  event_before_tracking_start: 'eventBeforeTrackingStartForbidden',
};

interface RejectedCycleLaunchDisplayInput {
  code?: string;
  message?: string;
  httpStatus?: number;
  t: Translator;
}

export interface RejectedCycleLaunchDisplay {
  status: string;
  cause: string;
  action: string;
}

const getControlledFallbackMessage = (message?: string): string | null => {
  if (!message || message.length > 180 || /[<>{}\n\r]/.test(message)) {
    return null;
  }
  const sanitized = sanitizeUserFacingErrorMessage(message);
  return sanitized === 'UNKNOWN_ERROR' ? null : sanitized;
};

export const getRejectedCycleLaunchDisplay = ({
  code,
  message,
  t,
}: RejectedCycleLaunchDisplayInput): RejectedCycleLaunchDisplay => {
  const translationKey = code
    ? TRANSACTIONAL_LAUNCH_ERROR_KEYS[code]
    : undefined;
  return {
    status: t('cycleLaunchRejectedStatus'),
    cause:
      (translationKey ? t(translationKey) : null)
      ?? getControlledFallbackMessage(message)
      ?? t('cycleLaunchRejectedGenericCause'),
    action: t('cycleLaunchRejectedNextAction'),
  };
};

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
