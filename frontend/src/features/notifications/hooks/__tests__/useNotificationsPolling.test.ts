import { act, renderHook } from '@testing-library/react-native';
import { AppState, AppStateStatus } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';

import { useNotificationsPolling } from '../useNotificationsPolling';
import { fetchNotificationsSilent } from '@/features/notifications/store/notificationSlice';

jest.mock('react-redux', () => ({
  useDispatch: jest.fn(),
  useSelector: jest.fn(),
}));

jest.mock('@/features/notifications/store/notificationSlice', () => ({
  fetchNotificationsSilent: jest.fn(() => ({ type: 'notifications/fetchSilent' })),
}));

describe('features/notifications/hooks/useNotificationsPolling', () => {
  const mockDispatch = jest.fn(() => Promise.resolve({}));
  const mockUseSelector = useSelector as unknown as jest.Mock;
  let appStateHandler: ((status: AppStateStatus) => void) | null = null;
  let removeSubscriptionMock: jest.Mock;

  const setAuthState = (isAuthenticated: boolean) => {
    mockUseSelector.mockImplementation((selector: (state: any) => unknown) =>
      selector({
        auth: { isAuthenticated },
      })
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    appStateHandler = null;
    removeSubscriptionMock = jest.fn();

    (useDispatch as unknown as jest.Mock).mockReturnValue(mockDispatch);
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
      appStateHandler = handler;
      return { remove: removeSubscriptionMock } as any;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('demarre le polling si utilisateur authentifie et refetch en revenant actif', async () => {
    setAuthState(true);

    const { unmount } = renderHook(() => useNotificationsPolling(1000));
    await act(async () => {});

    expect(fetchNotificationsSilent).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(fetchNotificationsSilent).toHaveBeenCalledTimes(2);
    expect(mockDispatch).toHaveBeenCalledTimes(2);

    act(() => {
      appStateHandler?.('active');
    });
    expect(fetchNotificationsSilent).toHaveBeenCalledTimes(3);
    expect(mockDispatch).toHaveBeenCalledTimes(3);

    const dispatchCountBeforeUnmount = mockDispatch.mock.calls.length;
    unmount();

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(mockDispatch).toHaveBeenCalledTimes(dispatchCountBeforeUnmount);
    expect(removeSubscriptionMock).toHaveBeenCalledTimes(1);
  });

  it('ne lance pas de polling si utilisateur non authentifie', () => {
    setAuthState(false);

    const { unmount } = renderHook(() => useNotificationsPolling(1000));

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(fetchNotificationsSilent).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();

    act(() => {
      appStateHandler?.('active');
    });
    expect(mockDispatch).not.toHaveBeenCalled();

    unmount();
  });
});
