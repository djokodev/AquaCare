import React from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Image,
} from 'react-native';
import { useTranslation } from 'react-i18next';

// Couleurs MAVECAM selon spécifications
const MAVECAM_COLORS = {
  GREEN_PRIMARY: '#059669',
  GREEN_LIGHT: '#10b981',
  GREEN_DARK: '#047857',
  WHITE: '#ffffff',
  CREAM: '#f8fafc',
  GRAY_LIGHT: '#64748b',
  GRAY_DARK: '#1e293b',
};

export default function LoadingScreen() {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Logo placeholder */}
        <View style={styles.logo}>
          <Text style={styles.logoText}>MAVECAM</Text>
          <Text style={styles.logoSubText}>AquaCare</Text>
        </View>
        
        <ActivityIndicator size="large" color={MAVECAM_COLORS.GREEN_PRIMARY} style={styles.spinner} />
        <Text style={styles.loadingText}>{t('loading')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MAVECAM_COLORS.WHITE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    letterSpacing: 2,
  },
  logoSubText: {
    fontSize: 18,
    fontWeight: '300',
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginTop: 4,
  },
  spinner: {
    marginBottom: 20,
  },
  loadingText: {
    fontSize: 16,
    color: MAVECAM_COLORS.GRAY_LIGHT,
  },
});