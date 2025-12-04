import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';

// Couleurs MAVECAM selon spÃ©cifications
const MAVECAM_COLORS = {
  GREEN_PRIMARY: '#059669',
  GREEN_LIGHT: '#10b981',
  GREEN_DARK: '#047857',
  WHITE: '#ffffff',
  CREAM: '#f8fafc',
  BLUE: '#2563eb',
  SUCCESS: '#059669',
  WARNING: '#f59e0b',
  ERROR: '#dc2626',
  INFO: '#0ea5e9',
  GRAY_LIGHT: '#64748b',
  GRAY_DARK: '#1e293b',
};

// Screens
import { DashboardScreen } from '@/features/main';
import { ProfileScreen, FarmProfileScreen, SettingsScreen } from '@/features/profile';

// Aquaculture Screens
import {
  DailyLogScreen,
  DailyLogHistoryScreen,
  SanitaryLogScreen,
  NewCycleScreen,
  CycleHistoryScreen,
  NotificationsScreen,
  FeedingPlanScreen,
  StatisticsScreen,
  NutritionalGuidesScreen,
} from '@/features/aquaculture';

// Commerce Screens
import {
  ProductCatalogScreen,
  ProductDetailScreen,
  CartScreen,
  OrdersHistoryScreen,
  FeedingSuggestionsScreen,
  CycleSimulatorScreen,
} from '@/features/commerce';

export type MainTabParamList = {
  Dashboard: undefined;
  ProfileStack: undefined;
};

export type RootStackParamList = {
  MainTabs: undefined;
  DailyLog: undefined;
  DailyLogHistory: undefined;
  SanitaryLog: undefined;
  NewCycle: undefined;
  CycleHistory: undefined;
  Notifications: undefined;
  FeedingPlan: undefined;
  Statistics: undefined;
  NutritionalGuides: undefined;
  // Commerce Screens
  ProductCatalog: undefined;
  ProductDetail: { productId: string };
  Cart: undefined;
  OrdersHistory: undefined;
  FeedingSuggestions: undefined;
  CycleSimulator: undefined;
};

export type ProfileStackParamList = {
  ProfileMain: undefined;
  FarmProfile: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();
const ProfileStack = createStackNavigator<ProfileStackParamList>();
const RootStack = createStackNavigator<RootStackParamList>();

function ProfileNavigator() {
  const { t, i18n } = useTranslation();
  const [currentLanguage, setCurrentLanguage] = React.useState(i18n.language);

  // Listen to language changes without force re-render
  React.useEffect(() => {
    const handleLanguageChanged = (lng: string) => {
      setCurrentLanguage(lng);
    };

    i18n.on('languageChanged', handleLanguageChanged);
    return () => {
      i18n.off('languageChanged', handleLanguageChanged);
    };
  }, [i18n]);

  return (
    <ProfileStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY },
        headerTintColor: MAVECAM_COLORS.WHITE,
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <ProfileStack.Screen
        name="ProfileMain"
        component={ProfileScreen}
        options={{ title: t('profile') }}
      />
      <ProfileStack.Screen
        name="FarmProfile"
        component={FarmProfileScreen}
        options={{ title: t('farmProfile') }}
      />
      <ProfileStack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: t('settings') }}
      />
    </ProfileStack.Navigator>
  );
}

function MainTabNavigator() {
  const { t, i18n } = useTranslation();
  const [currentLanguage, setCurrentLanguage] = React.useState(i18n.language);

  // Listen to language changes without force re-render
  React.useEffect(() => {
    const handleLanguageChanged = (lng: string) => {
      setCurrentLanguage(lng);
    };

    i18n.on('languageChanged', handleLanguageChanged);
    return () => {
      i18n.off('languageChanged', handleLanguageChanged);
    };
  }, [i18n]);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap;

          if (route.name === 'Dashboard') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'ProfileStack') {
            iconName = focused ? 'person' : 'person-outline';
          } else {
            iconName = 'ellipse-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: MAVECAM_COLORS.GREEN_PRIMARY,
        tabBarInactiveTintColor: MAVECAM_COLORS.GRAY_LIGHT,
        headerShown: false,
      })}
      screenListeners={({ navigation, route }) => ({
        tabPress: (e) => {
          // Allow the default behavior
        },
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarLabel: t('dashboard'),
        }}
      />
      <Tab.Screen
        name="ProfileStack"
        component={ProfileNavigator}
        options={{
          tabBarLabel: t('profile'),
        }}
      />
    </Tab.Navigator>
  );
}

export default function MainNavigator() {
  const { t } = useTranslation();

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen
        name="MainTabs"
        component={MainTabNavigator}
      />
      <RootStack.Screen
        name="DailyLog"
        component={DailyLogScreen}
      />
      <RootStack.Screen
        name="DailyLogHistory"
        component={DailyLogHistoryScreen}
      />
      <RootStack.Screen
        name="SanitaryLog"
        component={SanitaryLogScreen}
      />
      <RootStack.Screen
        name="NewCycle"
        component={NewCycleScreen}
      />
      <RootStack.Screen
        name="CycleHistory"
        component={CycleHistoryScreen}
      />
      <RootStack.Screen
        name="Notifications"
        component={NotificationsScreen}
      />
      <RootStack.Screen
        name="FeedingPlan"
        component={FeedingPlanScreen}
      />
      <RootStack.Screen
        name="Statistics"
        component={StatisticsScreen}
        options={{
          headerShown: false, // Header personnalisÃ© dans le composant
          headerStyle: { backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY },
          headerTintColor: MAVECAM_COLORS.WHITE,
          headerTitleStyle: { fontWeight: 'bold' },
          headerTitle: 'Statistiques'
        }}
      />
      <RootStack.Screen
        name="NutritionalGuides"
        component={NutritionalGuidesScreen}
      />
      {/* Commerce Screens */}
      <RootStack.Screen
        name="ProductCatalog"
        component={ProductCatalogScreen}
      />
      <RootStack.Screen
        name="ProductDetail"
        component={ProductDetailScreen}
      />
      <RootStack.Screen
        name="Cart"
        component={CartScreen}
      />
      <RootStack.Screen
        name="OrdersHistory"
        component={OrdersHistoryScreen}
      />
      <RootStack.Screen
        name="FeedingSuggestions"
        component={FeedingSuggestionsScreen}
      />
      <RootStack.Screen
        name="CycleSimulator"
        component={CycleSimulatorScreen}
      />
    </RootStack.Navigator>
  );
}




