import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

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

import { useNotificationsPolling } from '@/features/notifications/hooks/useNotificationsPolling';
import DashboardScreen from '@/features/main/screens/DashboardScreen';
import FarmMapScreen from '@/features/profile/screens/FarmMapScreen';
import FarmProfileScreen from '@/features/profile/screens/FarmProfileScreen';
import ProfileScreen from '@/features/profile/screens/ProfileScreen';
import SettingsScreen from '@/features/profile/screens/SettingsScreen';

// Aquaculture Screens
import AnnualSimulationScreen from '@/features/aquaculture/screens/AnnualSimulationScreen';
import CreateFarmScreen from '@/features/aquaculture/screens/CreateFarmScreen';
import PostHarvestConsolidationScreen from '@/features/aquaculture/screens/PostHarvestConsolidationScreen';
import CycleHistoryScreen from '@/features/aquaculture/screens/CycleHistoryScreen';
import CycleSessionEntryScreen from '@/features/aquaculture/screens/CycleSessionEntryScreen';
import DailyLogHistoryScreen from '@/features/aquaculture/screens/DailyLogHistoryScreen';
import DailyLogScreen from '@/features/aquaculture/screens/DailyLogScreen';
import FeedingPlanScreen from '@/features/aquaculture/screens/FeedingPlanScreen';
import NewCycleScreen from '@/features/aquaculture/screens/NewCycleScreen';
import NotificationsScreen from '@/features/aquaculture/screens/NotificationsScreen';
import ReportDetailScreen from '@/features/aquaculture/screens/ReportDetailScreen';
import ReportsScreen from '@/features/aquaculture/screens/ReportsScreen';
import SanitaryLogScreen from '@/features/aquaculture/screens/SanitaryLogScreen';
import StatisticsScreen from '@/features/aquaculture/screens/StatisticsScreen';

// Commerce Screens
import CartScreen from '@/features/commerce/screens/CartScreen';
import CycleSimulatorScreen from '@/features/commerce/screens/CycleSimulatorScreen';
import FeedingSuggestionsScreen from '@/features/commerce/screens/FeedingSuggestionsScreen';
import OrdersHistoryScreen from '@/features/commerce/screens/OrdersHistoryScreen';
import ProductCatalogScreen from '@/features/commerce/screens/ProductCatalogScreen';
import ProductDetailScreen from '@/features/commerce/screens/ProductDetailScreen';
import CycleFeedPhasesScreen from '@/features/commerce/screens/CycleFeedPhasesScreen';

// Chat/Support Screens
import { ChatScreen } from '@/features/chat/screens/ChatScreen';

export type MainTabParamList = {
  Dashboard: undefined;
  Support: undefined;
  ProfileStack: undefined;
};

export type RootStackParamList = {
  CycleSessionEntry: undefined;
  MainTabs: undefined;
  DailyLog: undefined;
  DailyLogHistory: undefined;
  SanitaryLog: undefined;
  NewCycle: undefined;
  CycleHistory: undefined;
  Notifications: undefined;
  FeedingPlan: undefined;
  Statistics: undefined;
  Reports: undefined;
  ReportDetail: { reportId: string };
  // Commerce Screens
  ProductCatalog: undefined;
  ProductDetail: { productId: string };
  Cart: undefined;
  OrdersHistory: undefined;
  FeedingSuggestions: undefined;
  CycleSimulator: {
    cycleId?: string;
    prefill?: {
      species: 'tilapia' | 'catfish';
      initial_fish_count: number;
      initial_weight_g: number;
      target_weight_g: number;
      cycle_duration_days: number;
      survival_rate: number;
      selling_price_per_kg_fcfa: number;
      fingerlings_cost_fcfa: number;
      other_costs_fcfa: number;
    };
  } | undefined;
  // Chat/Support Screens
  Chat: undefined;
  // Map Screen
  FarmMap: undefined;
  // Farm creation flow
  CreateFarm: undefined;
  AnnualSimulation: { formData: Record<string, string> };
  // Post-harvest consolidation
  PostHarvestConsolidation: { harvestedCycleId: string };
  // Feed phase ordering
  CycleFeedPhases: { cycleId: string };
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
  const { t } = useTranslation();

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
  const { t } = useTranslation();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap;

          if (route.name === 'Dashboard') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Support') {
            iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
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
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarLabel: t('dashboard'),
        }}
      />
      <Tab.Screen
        name="Support"
        component={ChatScreen}
        options={{
          tabBarLabel: t('chatTitle'),
          headerShown: true,
          headerStyle: { backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY },
          headerTintColor: MAVECAM_COLORS.WHITE,
          headerTitleStyle: { fontWeight: 'bold' },
          headerTitle: t('chatTitle'),
        }}
      />
      <Tab.Screen
        name="ProfileStack"
        component={ProfileNavigator}
        options={{
          tabBarLabel: t('profile'),
        }}
        listeners={({ navigation }) => ({
          tabPress: (event) => {
            // Always open profile root when tapping the profile tab icon.
            event.preventDefault();
            navigation.navigate('ProfileStack', { screen: 'ProfileMain' });
          },
        })}
      />
    </Tab.Navigator>
  );
}

export default function MainNavigator() {
  const { t } = useTranslation();
  useNotificationsPolling();

  return (
    <RootStack.Navigator
      initialRouteName="CycleSessionEntry"
      screenOptions={{ headerShown: false }}
    >
      <RootStack.Screen
        name="CycleSessionEntry"
        component={CycleSessionEntryScreen}
      />
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
        name="Reports"
        component={ReportsScreen}
      />
      <RootStack.Screen
        name="ReportDetail"
        component={ReportDetailScreen}
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
      <RootStack.Screen
        name="CycleFeedPhases"
        component={CycleFeedPhasesScreen}
      />
      {/* Chat/Support Screens */}
      <RootStack.Screen
        name="Chat"
        component={ChatScreen}
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY },
          headerTintColor: MAVECAM_COLORS.WHITE,
          headerTitleStyle: { fontWeight: 'bold' },
          title: t('chatTitle'),
        }}
      />
      {/* Farm Map Screen */}
      <RootStack.Screen
        name="FarmMap"
        component={FarmMapScreen}
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY },
          headerTintColor: MAVECAM_COLORS.WHITE,
          headerTitleStyle: { fontWeight: 'bold' },
          title: 'Carte de ma ferme',
          headerBackTitle: 'Profil',
        }}
      />
      {/* Farm creation flow */}
      <RootStack.Screen
        name="CreateFarm"
        component={CreateFarmScreen}
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY },
          headerTintColor: MAVECAM_COLORS.WHITE,
          headerTitleStyle: { fontWeight: 'bold' },
          title: t('createFarmTitle'),
          headerLeft: () => null,
        }}
      />
      <RootStack.Screen
        name="AnnualSimulation"
        component={AnnualSimulationScreen}
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY },
          headerTintColor: MAVECAM_COLORS.WHITE,
          headerTitleStyle: { fontWeight: 'bold' },
          title: t('simulationNavTitle'),
        }}
      />
      <RootStack.Screen
        name="PostHarvestConsolidation"
        component={PostHarvestConsolidationScreen}
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY },
          headerTintColor: MAVECAM_COLORS.WHITE,
          headerTitleStyle: { fontWeight: 'bold' },
          title: t('consolidationTitle'),
          headerLeft: () => null,
        }}
      />
    </RootStack.Navigator>
  );
}
