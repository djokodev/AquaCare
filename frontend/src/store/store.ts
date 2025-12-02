import { configureStore } from '@reduxjs/toolkit';
import aquacultureReducer, { aquacultureSlice } from '@/features/aquaculture/store/aquacultureSlice';
import authReducer, { authSlice } from '@/features/auth/store/authSlice';
import commerceReducer from '@/features/commerce/store/commerceSlice';
import notificationReducer from '@/features/notifications/store/notificationSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    aquaculture: aquacultureReducer,
    notifications: notificationReducer,
    commerce: commerceReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types from serialization checks
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;



