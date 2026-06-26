/**
 * Jest Setup File
 * Configuration globale pour tous les tests
 */

// Mock pour Expo SecureStore
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Mock pour Expo ImagePicker
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: 'granted' })
  ),
  requestCameraPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: 'granted' })
  ),
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));

// Mock pour AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock pour i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: {
      changeLanguage: jest.fn(),
      language: 'fr',
    },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: jest.fn(),
  },
}));

// Mock crypto.randomUUID — non disponible dans jsdom (environnement Jest)
Object.defineProperty(globalThis, 'crypto', {
  value: {
    randomUUID: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    }),
  },
  writable: true,
});

// Suppression des warnings React Native
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn(),
};

globalThis._WORKLET = false;
globalThis.__RUNTIME_KIND = 2;

const mockWorklets = {
  __esModule: true,
  RuntimeKind: {
    ReactNative: 2,
  },
  WorkletsModule: {},
  callMicrotasks: jest.fn(),
  createSerializable: (value) => value,
  createSynchronizable: (value) => value,
  createWorkletRuntime: jest.fn(() => ({})),
  executeOnUIRuntimeSync: (value) => value,
  getRuntimeKind: jest.fn(() => 2),
  getStaticFeatureFlag: jest.fn(() => false),
  isSerializableRef: (value) => value,
  isShareableRef: jest.fn(() => true),
  isSynchronizable: jest.fn(() => false),
  isWorkletFunction: (value) => typeof value === 'function' && Boolean(value.__workletHash),
  makeShareable: (value) => value,
  makeShareableCloneOnUIRecursive: (value) => value,
  makeShareableCloneRecursive: (value) => value,
  runOnJS: (fun) => (...args) => queueMicrotask(() => fun(...args)),
  runOnRuntime: (value) => value,
  runOnRuntimeAsync: async (_runtime, worklet, ...args) => worklet(...args),
  runOnUI: (worklet) => (...args) => worklet(...args),
  runOnUIAsync: async (worklet, ...args) => worklet(...args),
  runOnUISync: (value) => value,
  scheduleOnRN: (fun, ...args) => fun(...args),
  scheduleOnRuntime: (callback) => callback(),
  scheduleOnUI: (worklet, ...args) => worklet(...args),
  serializableMappingCache: new Map(),
  setDynamicFeatureFlag: jest.fn(),
  shareableMappingCache: new Map(),
};

jest.mock('react-native-worklets', () => mockWorklets);
jest.mock('react-native-worklets/src/index', () => mockWorklets);
jest.mock('react-native-worklets/lib/module/index', () => mockWorklets);

// Mock pour les animations React Native Reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

// Mock pour Gesture Handler
jest.mock('react-native-gesture-handler', () => {
  const View = require('react-native').View;
  return {
    Swipeable: View,
    DrawerLayout: View,
    State: {},
    ScrollView: View,
    Slider: View,
    Switch: View,
    TextInput: View,
    ToolbarAndroid: View,
    ViewPagerAndroid: View,
    DrawerLayoutAndroid: View,
    WebView: View,
    NativeViewGestureHandler: View,
    TapGestureHandler: View,
    FlingGestureHandler: View,
    ForceTouchGestureHandler: View,
    LongPressGestureHandler: View,
    PanGestureHandler: View,
    PinchGestureHandler: View,
    RotationGestureHandler: View,
    RawButton: View,
    BaseButton: View,
    RectButton: View,
    BorderlessButton: View,
    FlatList: View,
    gestureHandlerRootHOC: jest.fn(),
    Directions: {},
  };
});
