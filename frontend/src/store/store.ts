import { configureStore } from '@reduxjs/toolkit';
import { authSlice } from './slices/authSlice';
import { aquacultureSlice } from './slices/aquacultureSlice';
import notificationReducer from './slices/notificationSlice';
import commerceReducer from './slices/commerceSlice';

export const store = configureStore({
  reducer: {
    auth: authSlice.reducer,
    aquaculture: aquacultureSlice.reducer,
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