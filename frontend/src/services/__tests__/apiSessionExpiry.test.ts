import { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { apiService, setLogoutCallback } from '@/services/api';

const unauthorizedAdapter = async (config: InternalAxiosRequestConfig) => {
  throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, {
    status: 401,
    statusText: 'Unauthorized',
    data: {},
    headers: {},
    config: { ...config, headers: new AxiosHeaders() },
  });
};

describe('apiService session expiry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiService as unknown as { api: { defaults: { adapter: unknown } } }).api.defaults.adapter =
      unauthorizedAdapter;
    setLogoutCallback(jest.fn());
  });

  it('does not show the session expired alert after a voluntary logout', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

    await expect(apiService.get('/notifications/')).rejects.toBeInstanceOf(AxiosError);

    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
