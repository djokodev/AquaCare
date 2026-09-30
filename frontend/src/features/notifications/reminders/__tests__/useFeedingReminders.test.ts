import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useFeedingReminders } from '../useFeedingReminders';
import { scheduleFeedingReminders } from '../feedingReminders';

jest.mock('react-redux', () => ({
  useSelector: (selector: (state: unknown) => unknown) => selector({ auth: { user: { id: 'user-1' } } }),
}));

jest.mock('../feedingReminders', () => {
  const actual = jest.requireActual('../feedingReminders');
  return {
    ...actual,
    scheduleFeedingReminders: jest.fn(() => Promise.resolve({ status: 'scheduled', scheduledCount: 2 })),
  };
});

const mockSchedule = scheduleFeedingReminders as jest.MockedFunction<typeof scheduleFeedingReminders>;

describe('useFeedingReminders', () => {
  beforeEach(() => jest.clearAllMocks());

  it('demande la permission seulement a l activation', async () => {
    const { result } = renderHook(() => useFeedingReminders());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setEnabled(true);
    });

    expect(mockSchedule).toHaveBeenLastCalledWith(expect.objectContaining({ requestPermission: true }));
    expect(result.current.settings.enabled).toBe(true);
  });

  it('enchaine deux changements rapides sans perdre le premier', async () => {
    const { result } = renderHook(() => useFeedingReminders());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      void result.current.toggleDay(1);
      void result.current.toggleDay(7);
    });

    expect(result.current.settings.days).toEqual([2, 3, 4, 5, 6]);
  });

  it('ajoute, modifie et supprime une heure', async () => {
    const { result } = renderHook(() => useFeedingReminders());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.saveTime({ hour: 12, minute: 0 });
    });
    const added = result.current.settings.times.find((time) => time.hour === 12);
    expect(result.current.settings.times.map((time) => time.hour)).toEqual([8, 12, 16]);

    await act(async () => {
      await result.current.saveTime({ id: added?.id, hour: 13, minute: 15 });
    });
    expect(result.current.settings.times.map((time) => `${time.hour}:${time.minute}`)).toEqual(['8:30', '13:15', '16:30']);

    await act(async () => {
      await result.current.removeTime(added?.id ?? '');
    });
    expect(result.current.settings.times).toHaveLength(2);
  });
});
