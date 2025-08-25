import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';

// Couleurs MAVECAM selon spécifications
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
import DashboardScreen from '@/screens/main/DashboardScreen';
import ProfileScreen from '@/screens/profile/ProfileScreen';
import FarmProfileScreen from '@/screens/profile/FarmProfileScreen';
import SettingsScreen from '@/screens/profile/SettingsScreen';

export type MainTabParamList = {
  Dashboard: undefined;
  ProfileStack: undefined;
};

export type ProfileStackParamList = {
  ProfileMain: undefined;
  FarmProfile: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();
const ProfileStack = createStackNavigator<ProfileStackParamList>();

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

export default function MainNavigator() {
  const { t } = useTranslation();

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
          console.log('🚦 Tab pressed:', route.name);
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